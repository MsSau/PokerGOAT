import { supabase } from './supabase';
import { Database } from '../types/database';
import {
  SessionId, TournamentId, TournamentEntryId, ExecutionActionId, BRMAssignmentId,
  asTournamentId, asTournamentEntryId, asExecutionActionId,
} from '../types/ids';

// ============================================================================
// TYPES
// ============================================================================

export type TournamentEntryRow = Database['public']['Tables']['tournament_entries']['Row'];

export type TournamentRow = Database['public']['Tables']['tournaments']['Row'] & {
  tournament_entries?: TournamentEntryRow[];
};

export interface ComplianceFlags {
  isUnauthorized: boolean;      // not in the locked Session Contract
  isUnplanned: boolean;         // not in the locked Weekly Game Plan (checked independently of the Session Contract match)
  exceededBuyIns: boolean;      // entry_sequence exceeds the contracted/BRM-permitted max for this slot (PRD §10: "Exceeded permitted buy-ins per tournament")
  exceededMaxBuyIn: boolean;    // this entry's buy-in amount exceeds the BRM-permitted per-tournament maximum (PRD §10: "Exceeded permitted tournament buy-ins")
  loggedAfterStopLoss: boolean; // Session/Day/Week capacity already consumed
}

// ============================================================================
// CANONICAL EXECUTION ACTION RESOLUTION
// PRD §10: taxonomy is coach-owned and versioned. We only ever attach
// occurrences to the currently-activated CANONICAL_ACTIVE action.
// ============================================================================

const actionCache = new Map<string, { id: ExecutionActionId; is_hard_gate: boolean } | null>();

async function getCanonicalExecutionAction(name: string) {
  if (actionCache.has(name)) return actionCache.get(name)!;

  const { data, error } = await supabase
    .from('execution_actions')
    .select('id, is_hard_gate, taxonomy_versions!inner(is_activated)')
    .eq('name', name)
    .eq('status', 'CANONICAL_ACTIVE')
    .eq('taxonomy_versions.is_activated', true)
    .maybeSingle();

  if (error) {
    console.error(`Failed to resolve execution action "${name}":`, error);
    actionCache.set(name, null);
    return null;
  }

  const result = data ? { id: asExecutionActionId(data.id), is_hard_gate: !!data.is_hard_gate } : null;
  actionCache.set(name, result);
  return result;
}

async function recordExecutionOccurrence(params: {
  actionName: string;
  sessionId: SessionId;
  tournamentId?: TournamentId | null;
  tournamentEntryId?: TournamentEntryId | null;
}) {
  const action = await getCanonicalExecutionAction(params.actionName);
  if (!action) {
    // Never block logging because taxonomy config is missing — just warn.
    console.warn(
      `Canonical action "${params.actionName}" is not CANONICAL_ACTIVE. ` +
      `Ask the coach to activate it on the Taxonomy screen. Occurrence not recorded.`
    );
    return null;
  }

  const { data, error } = await supabase
    .from('execution_action_occurrences')
    .insert({
      execution_action_id: action.id,
      session_id: params.sessionId,
      tournament_id: params.tournamentId ?? null,
      tournament_entry_id: params.tournamentEntryId ?? null,
      is_non_compliant: true,
      hard_gate_triggered: action.is_hard_gate,
      detected_via: 'SYSTEM_DETECTED',
      occurred_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function flagOccurrences(
  sessionId: SessionId,
  tournamentId: TournamentId,
  entryId: TournamentEntryId,
  flags: ComplianceFlags
) {
  const jobs: ReturnType<typeof recordExecutionOccurrence>[] = [];
  if (flags.isUnauthorized) {
    jobs.push(recordExecutionOccurrence({ actionName: 'Unauthorized tournament', sessionId, tournamentId, tournamentEntryId: entryId }));
  }
  if (flags.exceededBuyIns) {
    jobs.push(recordExecutionOccurrence({ actionName: 'Exceeded permitted buy-ins', sessionId, tournamentId, tournamentEntryId: entryId }));
  }
  if (flags.exceededMaxBuyIn) {
    jobs.push(recordExecutionOccurrence({ actionName: 'Exceeded permitted tournament buy-ins', sessionId, tournamentId, tournamentEntryId: entryId }));
  }
  if (flags.loggedAfterStopLoss) {
    jobs.push(recordExecutionOccurrence({ actionName: 'Playing after Stop Loss', sessionId, tournamentId, tournamentEntryId: entryId }));
  }
  await Promise.all(jobs);
}

// ============================================================================
// SESSION / CONTRACT CONTEXT
// ============================================================================

async function fetchActiveSessionContext(sessionId: SessionId) {
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, player_id, contract_id, status')
    .eq('id', sessionId)
    .single();
  if (sErr) throw sErr;

  if (session.status !== 'ACTIVE') {
    // fn_check_session_finalized also enforces this at the DB level once FINALIZED.
    throw new Error('Entries can only be logged while the session is ACTIVE.');
  }

  const { data: contract, error: cErr } = await supabase
    .from('session_contracts')
    .select(`
      id, session_stop_loss, effective_session_loss_limit_at_creation,
      remaining_day_capacity_snapshot, remaining_week_capacity_snapshot, brm_assignment_id,
      weekly_game_plan_id,
      session_contract_tournaments ( id, tournament_name, slot_number, permitted_buy_ins ),
      session_contract_conditional_tournaments ( id, tournament_name, permitted_buy_ins ),
      session_contract_substitutions ( id, original_slot_id, replacement_tournament_name, replacement_permitted_buy_ins )
    `)
    .eq('id', session.contract_id)
    .single();
  if (cErr) throw cErr;

  const maxTournamentBuyIn = await fetchMaxTournamentBuyIn(contract.brm_assignment_id as BRMAssignmentId);
  const wgpTournamentNames = await fetchWGPTournamentNames(contract.weekly_game_plan_id);

  return { session, contract, maxTournamentBuyIn, wgpTournamentNames };
}

// isUnplanned checks against the locked Weekly Game Plan (PRD §10) — a
// separate, higher-level source of truth from the Session Contract's own
// slots/conditionals (isUnauthorized). A tournament can be missing from one
// without being missing from the other, e.g. a substitution that's in this
// week's contract but was never in the WGP, so the two flags must be
// computed independently rather than one mirroring the other.
async function fetchWGPTournamentNames(weeklyGamePlanId: string | null): Promise<Set<string>> {
  if (!weeklyGamePlanId) return new Set();

  const [tournaments, conditionals] = await Promise.all([
    supabase.from('weekly_game_plan_tournaments').select('tournament_name').eq('weekly_game_plan_id', weeklyGamePlanId),
    supabase.from('weekly_game_plan_conditional_tournaments').select('tournament_name').eq('weekly_game_plan_id', weeklyGamePlanId),
  ]);
  if (tournaments.error) throw tournaments.error;
  if (conditionals.error) throw conditionals.error;

  const names = [...(tournaments.data || []), ...(conditionals.data || [])].map((t) => t.tournament_name.trim().toLowerCase());
  return new Set(names);
}

// The per-tournament monetary buy-in cap (PRD §4's "Max Buy-in/Tournament")
// lives on brm_levels, keyed off the Weekly BRM Assignment locked for this
// session's contract — unlike session_contract_tournaments' permitted_buy_ins
// (a *count*), there is no per-slot override for this, it's a flat BRM-level
// ceiling. Null means the coach hasn't configured registration rules for
// this level (e.g. Levels 6-8) — nothing to enforce in that case.
async function fetchMaxTournamentBuyIn(brmAssignmentId: BRMAssignmentId): Promise<number | null> {
  const { data, error } = await supabase
    .from('weekly_brm_assignments')
    .select('brm_levels(max_tournament_buy_in)')
    .eq('id', brmAssignmentId)
    .single();
  if (error) throw error;
  const level = data?.brm_levels as unknown as { max_tournament_buy_in: number | null } | null;
  return level?.max_tournament_buy_in ?? null;
}

// Session Loss Contribution = MAX(0, -Final Session Net P&L), computed only
// from tournaments that are finalized (net_return IS NOT NULL) — PRD §6.
async function computeSessionRealizedLossContribution(sessionId: SessionId): Promise<number> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('net_return')
    .eq('session_id', sessionId)
    .not('net_return', 'is', null);
  if (error) throw error;

  const netPnl = (data || []).reduce((sum, t) => sum + (t.net_return ?? 0), 0);
  return Math.max(0, -netPnl);
}

// MVP simplification: uses the Session Contract's capacity snapshots (taken
// at contract lock time) rather than re-querying every sibling session in
// the Poker Day/Week. A full cross-session BRM/Risk engine (Section 4/6)
// is a separate module — this gives a correct, deterministic "authorize or
// flag" signal for the logging screen itself.
type ActiveSessionContext = Awaited<ReturnType<typeof fetchActiveSessionContext>>;

async function computeRemainingCapacity(sessionId: SessionId, contract: ActiveSessionContext['contract']): Promise<number> {
  const realizedLoss = await computeSessionRealizedLossContribution(sessionId);
  const effectiveLimit = Math.min(
    contract.effective_session_loss_limit_at_creation,
    contract.remaining_day_capacity_snapshot ?? Infinity,
    contract.remaining_week_capacity_snapshot ?? Infinity
  );
  return effectiveLimit - realizedLoss;
}

// Matches against the contract's fixed slots, any conditional tournaments
// already activated onto it (session_contract_conditional_tournaments —
// populated either at Session Contract creation, via SessionContractView's
// pre-selection checkboxes, or live during play via activateConditionalTournament),
// and any recorded substitutions' replacement tournaments. PRD §5: the
// Session Contract "must reference ... applicable conditional tournaments",
// and §10 defines "Unauthorized tournament" as "not in the Session
// Contract" — an activated conditional or a recorded substitution IS in the
// Session Contract (an amendment to it, same as a conditional activation),
// so both must be recognized here, not just the original fixed slots.
// Whether a substitution's replacement itself passed its own BRM re-check
// is tracked separately on the substitution record (passed_brm_validation)
// — it doesn't affect whether the replacement counts as authorized here.
//
// A fixed slot that's since been substituted away is excluded from this
// match — the substitution documents that the player is no longer playing
// that slot's original tournament, so a brand-new buy-in under the
// original name is no longer treated as authorized by construction (an
// already-logged tournament under that name remains visible/playable in
// TournamentLog, just gated behind its own explicit confirm step there).
function findMatchedSlot(
  contractTournaments: ActiveSessionContext['contract']['session_contract_tournaments'],
  conditionalTournaments: ActiveSessionContext['contract']['session_contract_conditional_tournaments'],
  substitutions: ActiveSessionContext['contract']['session_contract_substitutions'],
  tournamentName: string
): { permitted_buy_ins: number } | undefined {
  const normalized = tournamentName.trim().toLowerCase();

  const matchedSubstitution = substitutions.find(
    (s) => s.replacement_tournament_name.trim().toLowerCase() === normalized
  );
  if (matchedSubstitution) {
    return { permitted_buy_ins: matchedSubstitution.replacement_permitted_buy_ins };
  }

  const substitutedSlotIds = new Set(substitutions.map((s) => s.original_slot_id).filter((id): id is string => !!id));
  return (
    contractTournaments.find((t) => !substitutedSlotIds.has(t.id) && t.tournament_name.trim().toLowerCase() === normalized) ??
    conditionalTournaments.find((t) => t.tournament_name.trim().toLowerCase() === normalized)
  );
}

// ============================================================================
// READ
// ============================================================================

export async function fetchSessionTournaments(sessionId: SessionId): Promise<TournamentRow[]> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*, tournament_entries(*)')
    .eq('session_id', sessionId)
    .order('tournament_number', { ascending: false });
  if (error) throw error;

  return (data || []).map((t) => ({
    ...t,
    tournament_entries: (t.tournament_entries || []).sort((a, b) => a.entry_sequence - b.entry_sequence),
  }));
}

// ============================================================================
// WRITE — new tournament (first buy-in)
// ============================================================================

export async function logNewTournamentEntry(params: {
  sessionId: SessionId;
  tournamentName: string;
  tournamentNumber?: string;
  buyInAmount: number;
}): Promise<{ tournament: TournamentRow; entry: TournamentEntryRow; flags: ComplianceFlags }> {
  const { contract, maxTournamentBuyIn, wgpTournamentNames } = await fetchActiveSessionContext(params.sessionId);
  const contractTournaments = contract.session_contract_tournaments || [];
  const conditionalTournaments = contract.session_contract_conditional_tournaments || [];
  const substitutions = contract.session_contract_substitutions || [];
  const matchedSlot = findMatchedSlot(contractTournaments, conditionalTournaments, substitutions, params.tournamentName);
  const isPlanned = wgpTournamentNames.has(params.tournamentName.trim().toLowerCase());

  const remainingCapacity = await computeRemainingCapacity(params.sessionId, contract);

  const flags: ComplianceFlags = {
    isUnauthorized: !matchedSlot,
    isUnplanned: !isPlanned,
    exceededBuyIns: !!matchedSlot && matchedSlot.permitted_buy_ins < 1,
    exceededMaxBuyIn: maxTournamentBuyIn !== null && params.buyInAmount > maxTournamentBuyIn,
    loggedAfterStopLoss: remainingCapacity <= 0,
  };

  // 1. Tournament (parent) — never blocked, always saved.
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .insert({
      session_id: params.sessionId,
      name: params.tournamentName.trim(),
      tournament_number: params.tournamentNumber || null,
      is_unplanned: flags.isUnplanned,
      is_unauthorized: flags.isUnauthorized,
    })
    .select()
    .single();
  if (tErr) throw tErr;

  // 2. First Tournament Entry
  const nonCompliant = flags.isUnauthorized || flags.exceededBuyIns || flags.exceededMaxBuyIn || flags.loggedAfterStopLoss;
  const { data: entry, error: eErr } = await supabase
    .from('tournament_entries')
    .insert({
      tournament_id: tournament.id,
      entry_sequence: 1,
      buy_in_amount: params.buyInAmount,
      investment: params.buyInAmount,
      return_amount: 0,
      status: nonCompliant ? 'NON_COMPLIANT' : 'COMPLETED',
    })
    .select()
    .single();
  if (eErr) throw eErr;

  await flagOccurrences(params.sessionId, asTournamentId(tournament.id), asTournamentEntryId(entry.id), flags);

  return { tournament, entry, flags };
}

// ============================================================================
// WRITE — re-entry / additional buy-in on an existing, not-yet-finalized tournament
// ============================================================================

export async function logReEntry(params: {
  sessionId: SessionId;
  tournamentId: TournamentId;
  buyInAmount: number;
}): Promise<{ entry: TournamentEntryRow; flags: ComplianceFlags }> {
  const { contract, maxTournamentBuyIn } = await fetchActiveSessionContext(params.sessionId);
  const contractTournaments = contract.session_contract_tournaments || [];
  const conditionalTournaments = contract.session_contract_conditional_tournaments || [];
  const substitutions = contract.session_contract_substitutions || [];

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, is_unauthorized, is_unplanned, net_return, tournament_entries(id, entry_sequence)')
    .eq('id', params.tournamentId)
    .single();
  if (tErr) throw tErr;

  if (tournament.net_return !== null) {
    throw new Error('This tournament is already finalized — log a new tournament instead.');
  }

  const nextSeq = (tournament.tournament_entries?.length || 0) + 1;
  const matchedSlot = findMatchedSlot(contractTournaments, conditionalTournaments, substitutions, tournament.name);
  const remainingCapacity = await computeRemainingCapacity(params.sessionId, contract);

  // isUnauthorized/isUnplanned are properties of the tournament as a whole
  // (fixed at its first entry), not re-evaluated per re-entry — carry the
  // values already persisted on the parent tournament row.
  const flags: ComplianceFlags = {
    isUnauthorized: !!tournament.is_unauthorized,
    isUnplanned: !!tournament.is_unplanned,
    exceededBuyIns: matchedSlot ? nextSeq > matchedSlot.permitted_buy_ins : true,
    exceededMaxBuyIn: maxTournamentBuyIn !== null && params.buyInAmount > maxTournamentBuyIn,
    loggedAfterStopLoss: remainingCapacity <= 0,
  };

  const nonCompliant = flags.isUnauthorized || flags.exceededBuyIns || flags.exceededMaxBuyIn || flags.loggedAfterStopLoss;
  const { data: entry, error: eErr } = await supabase
    .from('tournament_entries')
    .insert({
      tournament_id: params.tournamentId,
      entry_sequence: nextSeq,
      buy_in_amount: params.buyInAmount,
      investment: params.buyInAmount,
      return_amount: 0,
      status: nonCompliant ? 'NON_COMPLIANT' : 'COMPLETED',
    })
    .select()
    .single();
  if (eErr) throw eErr;

  await flagOccurrences(params.sessionId, params.tournamentId, asTournamentEntryId(entry.id), flags);

  return { entry, flags };
}

// ============================================================================
// WRITE — finalize a tournament's result (ITM, rank, winnings)
// Attributes cash return to the final/surviving entry; cost stays spread
// across every entry via `investment` — PRD §6.
// ============================================================================

export async function finalizeTournament(params: {
  tournamentId: TournamentId;
  winningsGross: number;
  bestRank?: number;
  worstRank?: number;
  itmYn: boolean;
  finalTableYn: boolean;
  comments?: string;
}): Promise<TournamentRow> {
  const { data: entries, error: entErr } = await supabase
    .from('tournament_entries')
    .select('id, investment, buy_in_amount, entry_sequence')
    .eq('tournament_id', params.tournamentId)
    .order('entry_sequence', { ascending: false });
  if (entErr) throw entErr;
  if (!entries || entries.length === 0) {
    throw new Error('Cannot finalize a tournament with no logged entries.');
  }

  const totalInvestment = entries.reduce((s, e) => s + (e.investment ?? e.buy_in_amount), 0);
  const netReturn = params.winningsGross - totalInvestment;

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .update({
      winnings_gross: params.winningsGross,
      net_return: netReturn,
      best_rank: params.bestRank ?? null,
      worst_rank: params.worstRank ?? null,
      itm_yn: params.itmYn,
      final_table_yn: params.finalTableYn,
      comments: params.comments ?? null,
    })
    .eq('id', params.tournamentId)
    .select()
    .single();
  if (tErr) throw tErr;

  const finalEntry = entries[0]; // highest entry_sequence = surviving entry
  const nowIso = new Date().toISOString();

  const { error: finErr } = await supabase
    .from('tournament_entries')
    .update({ return_amount: params.winningsGross, completion_timestamp: nowIso })
    .eq('id', finalEntry.id);
  if (finErr) throw finErr;

  const otherIds = entries.slice(1).map((e) => e.id);
  if (otherIds.length > 0) {
    const { error: othErr } = await supabase
      .from('tournament_entries')
      .update({ completion_timestamp: nowIso })
      .in('id', otherIds);
    if (othErr) throw othErr;
  }

  return tournament;
}
