// src/lib/coachRoster.ts — data access for the coach's player roster
// (used by CoachShell's "player" tab and as the Weekly Coach Brief's
// player selector). Every value here is read from a real table/view —
// never a fabricated metric like the old mock's "process fidelity %".

import { supabase } from './supabase';
import { Database } from '../types/database';

export type RosterStatus = 'ESCALATED' | 'FLAGGED' | 'COMPLIANT';

export interface CoachRosterEntry {
  playerId: string;
  email: string;
  displayName: string;
  currentBankroll: number | null;
  brmLevelIndex: number | null;
  lastSessionAt: string | null;
  lastSessionStatus: Database['public']['Enums']['session_status'] | null;
  status: RosterStatus;
}

const FLAGGED_LOOKBACK_DAYS = 14;

export async function fetchCoachRoster(coachId: string): Promise<CoachRosterEntry[]> {
  const { data: players, error: pErr } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('coach_id', coachId)
    .eq('role', 'PLAYER');
  if (pErr) throw pErr;
  if (!players || players.length === 0) return [];

  const playerIds = players.map((p) => p.id);

  const [bankrollRes, brmRes, sessionsRes, escalationRes] = await Promise.all([
    supabase.from('player_current_bankroll').select('player_id, current_bankroll').in('player_id', playerIds),
    supabase
      .from('weekly_brm_assignments')
      .select('player_id, locked_at, brm_levels!inner(level_index)')
      .in('player_id', playerIds)
      .order('locked_at', { ascending: false }),
    supabase
      .from('sessions')
      .select('id, player_id, start_time, status')
      .in('player_id', playerIds)
      .order('start_time', { ascending: false }),
    supabase.from('escalation_tracks').select('player_id, current_stage_index').in('player_id', playerIds).gt('current_stage_index', 0),
  ]);
  if (bankrollRes.error) throw bankrollRes.error;
  if (brmRes.error) throw brmRes.error;
  if (sessionsRes.error) throw sessionsRes.error;
  if (escalationRes.error) throw escalationRes.error;

  const bankrollByPlayer = new Map((bankrollRes.data || []).map((r) => [r.player_id, r.current_bankroll]));

  // Most-recent-first order already applied by the query — first match per player wins.
  const brmLevelByPlayer = new Map<string, number | null>();
  for (const row of brmRes.data || []) {
    if (brmLevelByPlayer.has(row.player_id)) continue;
    const level = Array.isArray(row.brm_levels) ? row.brm_levels[0] : row.brm_levels;
    brmLevelByPlayer.set(row.player_id, level?.level_index ?? null);
  }

  const lastSessionByPlayer = new Map<string, { start_time: string | null; status: Database['public']['Enums']['session_status'] }>();
  const playerIdBySessionId = new Map<string, string>();
  for (const row of sessionsRes.data || []) {
    playerIdBySessionId.set(row.id, row.player_id);
    if (lastSessionByPlayer.has(row.player_id)) continue;
    lastSessionByPlayer.set(row.player_id, { start_time: row.start_time, status: row.status });
  }

  const sessionIds = (sessionsRes.data || []).map((s) => s.id);
  const cutoff = new Date(Date.now() - FLAGGED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const flaggedPlayers = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: occurrences, error: oErr } = await supabase
      .from('execution_action_occurrences')
      .select('session_id')
      .in('session_id', sessionIds)
      .gte('occurred_at', cutoff)
      .or('is_non_compliant.eq.true,hard_gate_triggered.eq.true');
    if (oErr) throw oErr;
    for (const row of occurrences || []) {
      const playerId = playerIdBySessionId.get(row.session_id);
      if (playerId) flaggedPlayers.add(playerId);
    }
  }

  const escalatedPlayers = new Set((escalationRes.data || []).map((r) => r.player_id));

  return players.map((p): CoachRosterEntry => {
    const lastSession = lastSessionByPlayer.get(p.id);
    const status: RosterStatus = escalatedPlayers.has(p.id) ? 'ESCALATED' : flaggedPlayers.has(p.id) ? 'FLAGGED' : 'COMPLIANT';
    return {
      playerId: p.id,
      email: p.email,
      displayName: p.email.split('@')[0],
      currentBankroll: bankrollByPlayer.get(p.id) ?? null,
      brmLevelIndex: brmLevelByPlayer.get(p.id) ?? null,
      lastSessionAt: lastSession?.start_time ?? null,
      lastSessionStatus: lastSession?.status ?? null,
      status,
    };
  });
}
