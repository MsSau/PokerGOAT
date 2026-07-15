import { supabase } from './supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface PokerWeek {
  id: string;
  player_id: string;
  start_timestamp: string;
  end_timestamp: string;
  boundary_config_id: string | null;
}

export interface WeeklyGamePlan {
  id: string;
  player_id: string;
  poker_week_id: string;
  framework_version_id: string | null;
  brm_assignment_id: string | null;
  status: 'DRAFT' | 'LOCKED';
  locked_at: string | null;
}

export interface WGPTournamentSlot {
  id: string;
  weekly_game_plan_id: string;
  slot_number: number;
  tournament_name: string;
  permitted_buy_ins: number;
  intended_buy_ins: number;
  planned_date: string | null;
}

export interface WGPConditionalTournament {
  id: string;
  weekly_game_plan_id: string;
  tournament_name: string;
  permitted_buy_ins: number;
  activation_condition: string;
}

export interface WeeklyBRMAssignment {
  id: string;
  player_id: string;
  poker_week_id: string;
  brm_level_id: string;
  session_stop_loss_snapshot: number;
  day_stop_loss_snapshot: number;
  week_stop_loss_snapshot: number;
  locked_at: string | null;
}

export interface SessionContractRow {
  id: string;
  player_id: string;
  weekly_game_plan_id: string;
  brm_assignment_id: string;
  framework_version_id: string;
  session_stop_loss: number;
  effective_session_loss_limit_at_creation: number;
  remaining_day_capacity_snapshot: number;
  remaining_week_capacity_snapshot: number;
  status: 'DRAFT' | 'VALIDATED' | 'LOCKED';
  locked_at: string | null;
  session_intention: string | null;
}

export interface CapacityState {
  remainingDayCapacity: number;
  remainingWeekCapacity: number;
  effectiveSessionLossLimit: number;
  blocked: boolean; // true => "Coach Configuration Required" (PRD §4)
}

// ============================================================================
// POKER WEEK / DAY RESOLUTION
// ============================================================================

export async function fetchCurrentPokerWeek(playerId: string): Promise<PokerWeek | null> {
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
async function computeTodayBoundaries(boundaryConfigId: string | null): Promise<{ start: Date; end: Date }> {
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

// ============================================================================
// LOCKED WEEKLY GAME PLAN + BRM ASSIGNMENT
// ============================================================================

export async function fetchLockedWeeklyGamePlan(
  playerId: string,
  pokerWeekId: string
): Promise<{
  plan: WeeklyGamePlan;
  tournaments: WGPTournamentSlot[];
  conditionals: WGPConditionalTournament[];
} | null> {
  const { data: plan, error: planErr } = await supabase
    .from('weekly_game_plans')
    .select('id, player_id, poker_week_id, framework_version_id, brm_assignment_id, status, locked_at')
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
): Promise<WeeklyBRMAssignment | null> {
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
    .eq('status', 'Active')
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
  pokerWeek: PokerWeek,
  brmAssignment: WeeklyBRMAssignment
): Promise<CapacityState> {
  const { start: dayStart, end: dayEnd } = await computeTodayBoundaries(pokerWeek.boundary_config_id);

  // Every session this poker week, via its locked contract -> weekly game plan
  const { data: contractsInWeek, error: cErr } = await supabase
    .from('session_contracts')
    .select('id, weekly_game_plans!inner(poker_week_id)')
    .eq('player_id', playerId)
    .eq('weekly_game_plans.poker_week_id', pokerWeek.id);
  if (cErr) throw cErr;

  const contractIds = (contractsInWeek || []).map((c: any) => c.id);
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

export async function fetchExistingContractForSession(
  playerId: string,
  weeklyGamePlanId: string
): Promise<SessionContractRow | null> {
  const { data, error } = await supabase
    .from('session_contracts')
    .select('*')
    .eq('player_id', playerId)
    .eq('weekly_game_plan_id', weeklyGamePlanId)
    .in('status', ['VALIDATED', 'LOCKED'])
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createValidatedSessionContract(params: {
  playerId: string;
  coachId: string;
  plan: WeeklyGamePlan;
  brmAssignment: WeeklyBRMAssignment;
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
// TBD: this should be one atomic Postgres function (mirroring
// perform_end_session's pattern) rather than two sequential client calls.
// Left as two calls for MVP; if the second insert fails, the contract is
// left LOCKED with no session — acceptable for MVP, flagged for hardening.
// ============================================================================

export async function lockContractAndStartSession(params: {
  playerId: string;
  contractId: string;
  preparationId?: string | null;
}): Promise<{ sessionId: string }> {
  const { error: lockErr } = await supabase
    .from('session_contracts')
    .update({ status: 'LOCKED', locked_at: new Date().toISOString() })
    .eq('id', params.contractId)
    .eq('status', 'VALIDATED'); // guard: only a VALIDATED contract can lock
  if (lockErr) throw lockErr;

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .insert({
      player_id: params.playerId,
      contract_id: params.contractId,
      preparation_id: params.preparationId ?? null,
      status: 'ACTIVE',
      start_time: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (sErr) throw sErr;

  return { sessionId: session.id };
}

// ============================================================================
// SUBSTITUTION — PRD §2.3, §5
// Original contract stays intact; substitution is appended, never edited in place.
// ============================================================================

export async function fetchSubstitutions(contractId: string) {
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

export async function fetchLockedContractTournaments(contractId: string) {
  const { data, error } = await supabase
    .from('session_contract_tournaments')
    .select('*')
    .eq('session_contract_id', contractId)
    .order('slot_number', { ascending: true });
  if (error) throw error;
  return data || [];
}