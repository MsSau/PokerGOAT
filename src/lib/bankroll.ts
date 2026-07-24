// src/lib/bankroll.ts — PRD §4 "Bankroll Accounting":
//   Current Bankroll = Opening Capital + Cumulative Poker Net P&L
//                       + Capital Deposits − Capital Withdrawals + Adjustments
// The player_current_bankroll view already computes this from
// bankroll_ledger_entries + session_outcome_assessments; this module is the
// player-facing read/write surface over it.
//
// Deviation from PRD, explicitly requested: the PRD's own UI spec (§2.1)
// says never to show cumulative bankroll prominently on the dashboard, and
// says nothing about a player self-logging capital movements at all (only
// a coach maintains the ledger). The player dashboard now does both, behind
// a show/hide toggle. Players may only ever append DEPOSIT/WITHDRAWAL rows
// (see 20260721030000_players_log_capital_movements.sql) — OPENING_CAPITAL
// and ADJUSTMENT remain coach-only entry types, enforced by RLS, not just
// by this module choosing not to expose them.

import { supabase } from './supabase';
import { Database } from '../types/database';
import { fetchCurrentPokerWeek } from './sessionContract';

export type CapitalMovementType = Extract<Database['public']['Enums']['ledger_entry_type'], 'DEPOSIT' | 'WITHDRAWAL'>;

export interface CapitalMovement {
  id: string;
  entryType: Database['public']['Enums']['ledger_entry_type'];
  amount: number;
  note: string | null;
  createdAt: string | null;
}

export async function fetchCurrentBankroll(playerId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('player_current_bankroll')
    .select('current_bankroll')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data?.current_bankroll ?? null;
}

export async function fetchRecentCapitalMovements(playerId: string, limit = 5): Promise<CapitalMovement[]> {
  const { data, error } = await supabase
    .from('bankroll_ledger_entries')
    .select('id, entry_type, amount, note, created_at')
    .eq('player_id', playerId)
    .in('entry_type', ['DEPOSIT', 'WITHDRAWAL'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    entryType: row.entry_type,
    amount: row.amount,
    note: row.note,
    createdAt: row.created_at,
  }));
}

// "Week Net" dashboard card — net P&L (can be positive or negative) across
// every FINALIZED session in the player's CURRENT Poker Week. Live/dynamic
// by construction: it's a plain query over session_outcome_assessments, so
// it always reflects whatever has been finalized so far, right after every
// session (no caching, no separate write path).
//
// This is deliberately NOT a new bankroll_ledger_entries row. Session P&L
// already flows into player_current_bankroll continuously (it sums
// session_outcome_assessments directly — see this file's header comment),
// so it's already "inculcated" into the bankroll at every moment, including
// at the Poker Week boundary: createWeeklyBRMAssignment (weeklyBrmAssignment.ts)
// snapshots bankroll_balance_at_assignment from that same live bankroll when
// the new week's assignment locks, which by then already includes the
// just-finished week's net P&L. Writing a second ledger entry here would
// double-count it.
//
// Resolves "this Poker Week" the same way computeCapacity does (sessionContract.ts):
// via the session's locked contract -> weekly_game_plan -> poker_week_id chain,
// not a raw start_time comparison, so this always agrees with the Weekly
// Budget Left figure shown alongside it.
export async function fetchCurrentWeekNetPnl(playerId: string): Promise<number> {
  const pokerWeek = await fetchCurrentPokerWeek(playerId);
  if (!pokerWeek) return 0;

  const { data: contractsInWeek, error: cErr } = await supabase
    .from('session_contracts')
    .select('id, weekly_game_plans!inner(poker_week_id)')
    .eq('player_id', playerId)
    .eq('weekly_game_plans.poker_week_id', pokerWeek.id);
  if (cErr) throw cErr;

  const contractIds = (contractsInWeek || []).map((c) => c.id);
  if (contractIds.length === 0) return 0;

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .in('contract_id', contractIds)
    .eq('status', 'FINALIZED');
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  if (sessionIds.length === 0) return 0;

  const { data: outcomes, error: oErr } = await supabase
    .from('session_outcome_assessments')
    .select('final_session_net_pnl')
    .in('session_id', sessionIds)
    .eq('is_current', true);
  if (oErr) throw oErr;

  return (outcomes || []).reduce((sum, o) => sum + (o.final_session_net_pnl ?? 0), 0);
}

export async function recordCapitalMovement(
  playerId: string,
  entryType: CapitalMovementType,
  amount: number,
  note?: string
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.');
  }
  const { error } = await supabase.from('bankroll_ledger_entries').insert({
    player_id: playerId,
    recorded_by: playerId,
    entry_type: entryType,
    amount,
    note: note?.trim() || null,
  });
  if (error) throw error;
}
