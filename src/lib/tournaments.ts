import { supabase } from './supabase';
import { Database } from '../types/database';

// ============================================================================
// TYPES
// ============================================================================

export type TournamentEntryRow = Database['public']['Tables']['tournament_entries']['Row'];

export type TournamentRow = Database['public']['Tables']['tournaments']['Row'] & {
  tournament_entries?: TournamentEntryRow[];
};

export interface ComplianceFlags {
  isUnauthorized: boolean;      // not in the locked Session Contract
  isUnplanned: boolean;         // not in the locked Weekly Game Plan (MVP: mirrors isUnauthorized — see note at bottom)
  exceededBuyIns: boolean;      // entry_sequence exceeds the contracted/BRM-permitted max for this slot (PRD §10: "Exceeded permitted buy-ins per tournament")
  exceededMaxBuyIn: boolean;    // this entry's buy-in amount exceeds the BRM-permitted per-tournament maximum (PRD §10: "Exceeded permitted tournament buy-ins")
  loggedAfterStopLoss: boolean; // Session/Day/Week capacity already consumed
}

// ============================================================================
// CANONICAL EXECUTION ACTION RESOLUTION
// PRD §10: taxonomy is coach-owned and versioned. We only ever attach
// occurrences to the currently-activated CANONICAL_ACTIVE action.
// ============================================================================

const actionCache = new Map<string, { id: string; is_hard_gate: boolean } | null>();

export async function getCanonicalExecutionAction(name: string) {
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

  const result = data ? { id: data.id, is_hard_gate: !!data.is_hard_gate } : null;
  actionCache.set(name, result);
  return result;
}

async function recordExecutionOccurrence(params: {
  actionName: string;
  sessionId: string;
  tournamentId?: string | null;
  tournamentEntryId?: string | null;
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
  sessionId: string,
  tournamentId: string,
  entryId: string,
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

async function fetchActiveSessionContext(sessionId: string) {
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
      session_contract_tournaments ( id, tournament_name, slot_number, permitted_buy_ins )
    `)
    .eq('id', session.contract_id)
    .single();
  if (cErr) throw cErr;

  const maxTournamentBuyIn = await fetchMaxTournamentBuyIn(contract.brm_assignment_id);

  return { session, contract, maxTournamentBuyIn };
}

// The per-tournament monetary buy-in cap (PRD §4's "Max Buy-in/Tournament")
// lives on brm_levels, keyed off the Weekly BRM Assignment locked for this
// session's contract — unlike session_contract_tournaments' permitted_buy_ins
// (a *count*), there is no per-slot override for this, it's a flat BRM-level
// ceiling. Null means the coach hasn't configured registration rules for
// this level (e.g. Levels 6-8) — nothing to enforce in that case.
async function fetchMaxTournamentBuyIn(brmAssignmentId: string): Promise<number | null> {
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
async function computeSessionRealizedLossContribution(sessionId: string): Promise<number> {
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

async function computeRemainingCapacity(sessionId: string, contract: ActiveSessionContext['contract']): Promise<number> {
  const realizedLoss = await computeSessionRealizedLossContribution(sessionId);
  const effectiveLimit = Math.min(
    contract.effective_session_loss_limit_at_creation,
    contract.remaining_day_capacity_snapshot ?? Infinity,
    contract.remaining_week_capacity_snapshot ?? Infinity
  );
  return effectiveLimit - realizedLoss;
}

function findMatchedSlot(contractTournaments: ActiveSessionContext['contract']['session_contract_tournaments'], tournamentName: string) {
  return contractTournaments.find(
    (t) => t.tournament_name.trim().toLowerCase() === tournamentName.trim().toLowerCase()
  );
}

// ============================================================================
// READ
// ============================================================================

export async function fetchSessionTournaments(sessionId: string): Promise<TournamentRow[]> {
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
  sessionId: string;
  tournamentName: string;
  tournamentNumber?: string;
  buyInAmount: number;
}): Promise<{ tournament: TournamentRow; entry: TournamentEntryRow; flags: ComplianceFlags }> {
  const { contract, maxTournamentBuyIn } = await fetchActiveSessionContext(params.sessionId);
  const contractTournaments = contract.session_contract_tournaments || [];
  const matchedSlot = findMatchedSlot(contractTournaments, params.tournamentName);

  const remainingCapacity = await computeRemainingCapacity(params.sessionId, contract);

  const flags: ComplianceFlags = {
    isUnauthorized: !matchedSlot,
    isUnplanned: !matchedSlot,
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

  await flagOccurrences(params.sessionId, tournament.id, entry.id, flags);

  return { tournament, entry, flags };
}

// ============================================================================
// WRITE — re-entry / additional buy-in on an existing, not-yet-finalized tournament
// ============================================================================

export async function logReEntry(params: {
  sessionId: string;
  tournamentId: string;
  buyInAmount: number;
}): Promise<{ entry: TournamentEntryRow; flags: ComplianceFlags }> {
  const { contract, maxTournamentBuyIn } = await fetchActiveSessionContext(params.sessionId);
  const contractTournaments = contract.session_contract_tournaments || [];

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, is_unauthorized, net_return, tournament_entries(id, entry_sequence)')
    .eq('id', params.tournamentId)
    .single();
  if (tErr) throw tErr;

  if (tournament.net_return !== null) {
    throw new Error('This tournament is already finalized — log a new tournament instead.');
  }

  const nextSeq = (tournament.tournament_entries?.length || 0) + 1;
  const matchedSlot = findMatchedSlot(contractTournaments, tournament.name);
  const remainingCapacity = await computeRemainingCapacity(params.sessionId, contract);

  const flags: ComplianceFlags = {
    isUnauthorized: !!tournament.is_unauthorized,
    isUnplanned: !!tournament.is_unauthorized,
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

  await flagOccurrences(params.sessionId, params.tournamentId, entry.id, flags);

  return { entry, flags };
}

// ============================================================================
// WRITE — finalize a tournament's result (ITM, rank, winnings)
// Attributes cash return to the final/surviving entry; cost stays spread
// across every entry via `investment` — PRD §6.
// ============================================================================

export async function finalizeTournament(params: {
  tournamentId: string;
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