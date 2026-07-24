import { supabase } from './supabase';
import { Database } from '../types/database';

export type SessionContractSubstitutionRow = Database['public']['Tables']['session_contract_substitutions']['Row'];
export type SessionContractTournamentRow = Database['public']['Tables']['session_contract_tournaments']['Row'];

// ============================================================================
// TYPES
// Narrow Pick<> types below match the exact column list each fetcher below
// actually selects — never a full Row for a query that doesn't select every
// column. The corresponding *full*-row shape (used by weeklyGamePlan.ts's
// resolveWGPContext/fetchExistingWGP, which do select('*')) lives in
// src/types.ts as PokerWeek/WeeklyGamePlan/WeeklyGamePlanTournament/
// WeeklyGamePlanConditionalTournament — same table, deliberately different
// (wider) shape, so don't conflate the two.
// ============================================================================

export type PokerWeekSummary = Pick<
  Database['public']['Tables']['poker_weeks']['Row'],
  'id' | 'player_id' | 'start_timestamp' | 'end_timestamp' | 'boundary_config_id'
>;

export type WeeklyGamePlanSummary = Pick<
  Database['public']['Tables']['weekly_game_plans']['Row'],
  'id' | 'player_id' | 'poker_week_id' | 'framework_version_id' | 'brm_assignment_id' | 'status' | 'locked_at' | 'weekly_intention' | 'weekly_focus'
>;

export type WGPTournamentSlot = Pick<
  Database['public']['Tables']['weekly_game_plan_tournaments']['Row'],
  'id' | 'weekly_game_plan_id' | 'slot_number' | 'tournament_name' | 'permitted_buy_ins' | 'intended_buy_ins' | 'planned_date'
>;

export type WGPConditionalTournament = Pick<
  Database['public']['Tables']['weekly_game_plan_conditional_tournaments']['Row'],
  'id' | 'weekly_game_plan_id' | 'tournament_name' | 'permitted_buy_ins' | 'activation_condition'
>;

export type WeeklyBRMAssignmentRow = Database['public']['Tables']['weekly_brm_assignments']['Row'];

// Matches the narrow column list actually used by fetchWeeklyBRMAssignment,
// fetchLatestBRMAssignment, and fetchPlayerDashboardData — NOT the full Row,
// since none of those queries select the bankroll-audit columns
// (bankroll_balance_at_assignment, bankroll_band_id, brm_config_version_id,
// opening_capital_at_assignment). Those columns exist to satisfy PRD §4's
// "assigned using the bankroll state at that boundary" / "historical sessions
// retain the BRM configuration version" requirements, but nothing in this
// codebase writes or reads them yet outside perform_end_session() — see
// resolveWGPContext below for the one call site that does select('*').
export type WeeklyBRMAssignmentSummary = Pick<WeeklyBRMAssignmentRow,
  'id' | 'player_id' | 'poker_week_id' | 'brm_level_id' |
  'session_stop_loss_snapshot' | 'day_stop_loss_snapshot' | 'week_stop_loss_snapshot' | 'locked_at'
>;

// fetchPlayerDashboardData additionally joins brm_levels!inner(level_index).
// weekly_brm_assignments -> brm_levels is isOneToOne: false, so the raw
// embedded relation type-resolves to an array even though each assignment
// has exactly one level; fetchPlayerDashboardData flattens it before
// returning, so this describes that flattened, nullable-object output —
// never the raw pre-flatten query shape.
export type WeeklyBRMAssignmentWithLevel = WeeklyBRMAssignmentSummary & {
  brm_levels: { level_index: number } | null;
};

// Full row (every consumer below does select('*')) — remaining_day/week_
// capacity_snapshot are genuinely nullable in the DB (a DRAFT contract has
// never had capacity computed yet), so callers must guard before formatting.
export type SessionContractRow = Database['public']['Tables']['session_contracts']['Row'];

export interface CapacityState {
  remainingDayCapacity: number;
  remainingWeekCapacity: number;
  effectiveSessionLossLimit: number;
  blocked: boolean; // true => "Coach Configuration Required" (PRD §4)
}

// ============================================================================
// POKER WEEK / DAY RESOLUTION
// ============================================================================

export async function fetchCurrentPokerWeek(playerId: string): Promise<PokerWeekSummary | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('poker_weeks')
    .select('id, player_id, start_timestamp, end_timestamp, boundary_config_id')
    .eq('player_id', playerId)
    .lte('start_timestamp', nowIso)
    .gt('end_timestamp', nowIso)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Simplification (TBD): uses the browser's local clock rather than a
// timezone-aware library keyed off profiles.timezone. Good enough to
// bound "today" for MVP; swap for date-fns-tz once player timezone
// handling is centralized.
export async function computeTodayBoundaries(boundaryConfigId: string | null): Promise<{ start: Date; end: Date }> {
  let boundaryTime = '10:00:00';
  if (boundaryConfigId) {
    const { data } = await supabase
      .from('poker_week_boundary_configs')
      .select('poker_day_boundary_time')
      .eq('id', boundaryConfigId)
      .maybeSingle();
    if (data?.poker_day_boundary_time) boundaryTime = data.poker_day_boundary_time;
  }

  const [h, m, s] = boundaryTime.split(':').map(Number);
  const now = new Date();
  const todayBoundary = new Date(now);
  todayBoundary.setHours(h, m, s || 0, 0);

  if (now >= todayBoundary) {
    const end = new Date(todayBoundary);
    end.setDate(end.getDate() + 1);
    return { start: todayBoundary, end };
  }
  const start = new Date(todayBoundary);
  start.setDate(start.getDate() - 1);
  return { start, end: todayBoundary };
}

// Local calendar-day key (YYYY-MM-DD) for a Date, matching the
// weekly_game_plan_tournaments.planned_date convention WeeklyGamePlanView
// writes (see its getWeekDates: local components, not toISOString(), which
// rolls the date back a day for any timezone ahead of UTC).
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ============================================================================
// LOCKED WEEKLY GAME PLAN + BRM ASSIGNMENT
// ============================================================================

export async function fetchLockedWeeklyGamePlan(
  playerId: string,
  pokerWeekId: string
): Promise<{
  plan: WeeklyGamePlanSummary;
  tournaments: WGPTournamentSlot[];
  conditionals: WGPConditionalTournament[];
} | null> {
  const { data: plan, error: planErr } = await supabase
    .from('weekly_game_plans')
    .select('id, player_id, poker_week_id, framework_version_id, brm_assignment_id, status, locked_at, weekly_intention, weekly_focus')
    .eq('player_id', playerId)
    .eq('poker_week_id', pokerWeekId)
    .eq('status', 'LOCKED')
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) return null;

  const [{ data: tournaments, error: tErr }, { data: conditionals, error: cErr }] = await Promise.all([
    supabase
      .from('weekly_game_plan_tournaments')
      .select('id, weekly_game_plan_id, slot_number, tournament_name, permitted_buy_ins, intended_buy_ins, planned_date')
      .eq('weekly_game_plan_id', plan.id)
      .order('slot_number', { ascending: true }),
    supabase
      .from('weekly_game_plan_conditional_tournaments')
      .select('id, weekly_game_plan_id, tournament_name, permitted_buy_ins, activation_condition')
      .eq('weekly_game_plan_id', plan.id),
  ]);
  if (tErr) throw tErr;
  if (cErr) throw cErr;

  return { plan, tournaments: tournaments || [], conditionals: conditionals || [] };
}

export async function fetchWeeklyBRMAssignment(
  playerId: string,
  pokerWeekId: string
): Promise<WeeklyBRMAssignmentSummary | null> {
  const { data, error } = await supabase
    .from('weekly_brm_assignments')
    .select('id, player_id, poker_week_id, brm_level_id, session_stop_loss_snapshot, day_stop_loss_snapshot, week_stop_loss_snapshot, locked_at')
    .eq('player_id', playerId)
    .eq('poker_week_id', pokerWeekId)
    .not('locked_at', 'is', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchActiveFrameworkVersionId(coachId: string): Promise<string | null> {
  const { data: fw } = await supabase
    .from('performance_frameworks')
    .select('id')
    .eq('coach_id', coachId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!fw) return null;

  const { data: version } = await supabase
    .from('framework_versions')
    .select('id')
    .eq('framework_id', fw.id)
    .eq('is_activated', true)
    .maybeSingle();
  return version?.id ?? null;
}

// ============================================================================
// CAPACITY CALCULATION — PRD §6
// Session Loss Contribution = MAX(0, -Final Session Net P&L), summed across
// prior FINALIZED sessions in the current Poker Day / Poker Week.
// Simplification (TBD): reads session_outcome_assessments directly rather
// than a dedicated risk-rollup table/view — correct today, but a materialized
// view would scale better once volume grows.
// ============================================================================

export async function computeCapacity(
  playerId: string,
  pokerWeek: PokerWeekSummary,
  brmAssignment: WeeklyBRMAssignmentSummary
): Promise<CapacityState> {
  const { start: dayStart, end: dayEnd } = await computeTodayBoundaries(pokerWeek.boundary_config_id);

  // Every session this poker week, via its locked contract -> weekly game plan
  const { data: contractsInWeek, error: cErr } = await supabase
    .from('session_contracts')
    .select('id, weekly_game_plans!inner(poker_week_id)')
    .eq('player_id', playerId)
    .eq('weekly_game_plans.poker_week_id', pokerWeek.id);
  if (cErr) throw cErr;

  const contractIds = (contractsInWeek || []).map((c) => c.id);
  if (contractIds.length === 0) {
    return {
      remainingDayCapacity: brmAssignment.day_stop_loss_snapshot,
      remainingWeekCapacity: brmAssignment.week_stop_loss_snapshot,
      effectiveSessionLossLimit: Math.min(
        brmAssignment.session_stop_loss_snapshot,
        brmAssignment.day_stop_loss_snapshot,
        brmAssignment.week_stop_loss_snapshot
      ),
      blocked: false,
    };
  }

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id, start_time, contract_id, status')
    .in('contract_id', contractIds)
    .eq('status', 'FINALIZED');
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  let weekLoss = 0;
  let dayLoss = 0;

  if (sessionIds.length > 0) {
    const { data: outcomes, error: oErr } = await supabase
      .from('session_outcome_assessments')
      .select('session_id, final_session_net_pnl, is_current')
      .in('session_id', sessionIds)
      .eq('is_current', true);
    if (oErr) throw oErr;

    const sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
    for (const o of outcomes || []) {
      const loss = Math.max(0, -(o.final_session_net_pnl ?? 0));
      weekLoss += loss;
      const s = sessionMap.get(o.session_id);
      if (s?.start_time) {
        const t = new Date(s.start_time);
        if (t >= dayStart && t < dayEnd) dayLoss += loss;
      }
    }
  }

  const remainingDayCapacity = brmAssignment.day_stop_loss_snapshot - dayLoss;
  const remainingWeekCapacity = brmAssignment.week_stop_loss_snapshot - weekLoss;
  const effectiveSessionLossLimit = Math.min(
    brmAssignment.session_stop_loss_snapshot,
    remainingDayCapacity,
    remainingWeekCapacity
  );

  return {
    remainingDayCapacity,
    remainingWeekCapacity,
    effectiveSessionLossLimit,
    blocked: effectiveSessionLossLimit <= 0,
  };
}

// ============================================================================
// CREATE / VALIDATE — PRD §5, §2.3
// Player selects slots already present in the locked WGP; terms (permitted
// buy-ins) are pulled through verbatim, never freely retyped.
// ============================================================================

//export async function fetchExistingContractForSession(
  //playerId: string,
  //weeklyGamePlanId: string
//): Promise<SessionContractRow | null> {
  //const { data, error } = await supabase
    //.from('session_contracts')
    //.select('*')
    //.eq('player_id', playerId)
    //.eq('weekly_game_plan_id', weeklyGamePlanId)
    //.in('status', ['VALIDATED', 'LOCKED'])
    //.order('id', { ascending: false })
    //.limit(1)
    //.maybeSingle();
  //if (error) throw error;
  //return data;
//}
export async function fetchExistingContractForSession(
  playerId: string,
  weeklyGamePlanId: string
): Promise<SessionContractRow | null> {

  // STEP 1: Check if an ACTIVE session exists
  const { data: activeSession, error: sessionError } = await supabase
    .from('sessions')
    .select('contract_id')
    .eq('player_id', playerId)
    .eq('status', 'ACTIVE')
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError) throw sessionError;

  // STEP 2: If ACTIVE session exists, return its LOCKED contract
  if (activeSession?.contract_id) {
    const { data: lockedContract, error: contractError } = await supabase
      .from('session_contracts')
      .select('*')
      .eq('id', activeSession.contract_id)
      .maybeSingle();

    if (contractError) throw contractError;

    return lockedContract;
  }

  // STEP 3: No ACTIVE session -> return only VALIDATED contract
  const { data: validatedContract, error: validatedError } = await supabase
    .from('session_contracts')
    .select('*')
    .eq('player_id', playerId)
    .eq('weekly_game_plan_id', weeklyGamePlanId)
    .eq('status', 'VALIDATED')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (validatedError) throw validatedError;

  return validatedContract;
}
export async function createValidatedSessionContract(params: {
  playerId: string;
  coachId: string;
  plan: WeeklyGamePlanSummary;
  brmAssignment: WeeklyBRMAssignmentSummary;
  capacity: CapacityState;
  selectedSlots: WGPTournamentSlot[];
  selectedConditionals: WGPConditionalTournament[];
  sessionIntention?: string;
}): Promise<SessionContractRow> {
  if (params.capacity.blocked) {
    throw new Error('Coach Configuration Required — no BRM capacity remains for a new authorized session this period.');
  }
  if (params.selectedSlots.length === 0 && params.selectedConditionals.length === 0) {
    throw new Error('Select at least one tournament from your Weekly Game Plan.');
  }

  const frameworkVersionId = await fetchActiveFrameworkVersionId(params.coachId);
  if (!frameworkVersionId) {
    throw new Error('No active Performance Framework found. Contact your coach.');
  }

  const { data: contract, error: cErr } = await supabase
    .from('session_contracts')
    .insert({
      player_id: params.playerId,
      weekly_game_plan_id: params.plan.id,
      brm_assignment_id: params.brmAssignment.id,
      framework_version_id: frameworkVersionId,
      session_stop_loss: params.brmAssignment.session_stop_loss_snapshot,
      effective_session_loss_limit_at_creation: params.capacity.effectiveSessionLossLimit,
      remaining_day_capacity_snapshot: params.capacity.remainingDayCapacity,
      remaining_week_capacity_snapshot: params.capacity.remainingWeekCapacity,
      status: 'VALIDATED',
      session_intention: params.sessionIntention || null,
    })
    .select('*')
    .single();
  if (cErr) throw cErr;

  if (params.selectedSlots.length > 0) {
    const { error: stErr } = await supabase.from('session_contract_tournaments').insert(
      params.selectedSlots.map((slot) => ({
        session_contract_id: contract.id,
        source_wgp_tournament_id: slot.id,
        slot_number: slot.slot_number,
        tournament_name: slot.tournament_name,
        permitted_buy_ins: slot.permitted_buy_ins,
      }))
    );
    if (stErr) throw stErr;
  }

  if (params.selectedConditionals.length > 0) {
    const { error: scErr } = await supabase.from('session_contract_conditional_tournaments').insert(
      params.selectedConditionals.map((c) => ({
        session_contract_id: contract.id,
        source_wgp_conditional_id: c.id,
        tournament_name: c.tournament_name,
        activation_condition: c.activation_condition,
        permitted_buy_ins: c.permitted_buy_ins,
      }))
    );
    if (scErr) throw scErr;
  }

  return contract;
}

// ============================================================================
// LOCK CONTRACT + START SESSION — PRD §5 "locks when the session starts"
// Single atomic write via the perform_start_session RPC (mirrors
// perform_end_session's pattern in endSession.ts) — the contract lock,
// authorization check, max-two-sessions-per-poker-day guard, and session
// insert all happen inside one Postgres transaction, so a failure partway
// through can never leave the contract LOCKED with no session.
// ============================================================================

export async function lockContractAndStartSession(params: {
  contractId: string;
  preparationId: string;
}): Promise<{ sessionId: string }> {
  const { data, error } = await supabase.rpc('perform_start_session', {
    p_contract_id: params.contractId,
    p_preparation_id: params.preparationId,
  });
  if (error) throw error;

  // perform_start_session returns jsonb, so the generated client type can
  // only say `Json` — cast once, here, to the shape the RPC actually returns.
  const rpcResult = data as unknown as { session_id: string };
  return { sessionId: rpcResult.session_id };
}

// ============================================================================
// SUBSTITUTION — PRD §2.3, §5
// Original contract stays intact; substitution is appended, never edited in place.
// ============================================================================

export async function fetchSubstitutions(contractId: string): Promise<SessionContractSubstitutionRow[]> {
  const { data, error } = await supabase
    .from('session_contract_substitutions')
    .select('*')
    .eq('session_contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function substituteTournament(params: {
  contractId: string;
  originalSlotId: string | null;
  replacementTournamentName: string;
  replacementPermittedBuyIns: number;
  reason: string;
  passedBrmValidation: boolean;
}) {
  const { data, error } = await supabase
    .from('session_contract_substitutions')
    .insert({
      session_contract_id: params.contractId,
      original_slot_id: params.originalSlotId,
      replacement_tournament_name: params.replacementTournamentName,
      replacement_permitted_buy_ins: params.replacementPermittedBuyIns,
      reason: params.reason,
      passed_brm_validation: params.passedBrmValidation,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchLockedContractTournaments(contractId: string): Promise<SessionContractTournamentRow[]> {
  const { data, error } = await supabase
    .from('session_contract_tournaments')
    .select('*')
    .eq('session_contract_id', contractId)
    .order('slot_number', { ascending: true });
  if (error) throw error;
  return data || [];
}