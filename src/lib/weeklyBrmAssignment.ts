// src/lib/weeklyBrmAssignment.ts
//
// Coach-driven creation of a player's Weekly BRM Assignment — the piece of
// PRD §4/§5 infrastructure that was entirely missing: poker_weeks and
// weekly_brm_assignments had SELECT-only RLS (see the migration alongside
// this module), so nothing could ever create either row. That's why the
// Player's Plan tab has been failing with "No locked Weekly BRM Assignment
// for this Poker Week" — resolveWGPContext (weeklyGamePlan.ts) was correct
// to block; there was just never a way to satisfy it.
//
// PRD §4: "BRM Level is assigned at the Poker Week boundary using the
// bankroll state at that boundary; changes to bankroll during the week do
// not change the active Weekly BRM Assignment." So this locks in a
// snapshot — never something to edit later, only ever a new row for a
// later Poker Week.

import { supabase } from './supabase';
import { fetchCurrentPokerWeek } from './sessionContract';
import { fetchBRMConfigForCoach, fetchBRMVersions, currentBRMVersion } from './brmConfig';
import { runDeescalationForPlayer } from './escalationEngine';

export interface PokerWeekWindow {
  start: Date;
  end: Date;
}

// PRD §5: "a poker week runs Monday 10:00 AM to the following Monday 10:00
// AM... coach-configurable." boundaryDayOfWeek uses ISO weekday numbering
// (1 = Monday ... 7 = Sunday), matching poker_week_boundary_configs'
// boundary_day_of_week column and its DEFAULT 1. Pure + testable: walks
// back at most 7 days from `now` to find the most recent boundary
// crossing, then the window runs exactly 7 days from there.
export function computeCurrentPokerWeekWindow(boundaryDayOfWeek: number, boundaryTime: string, now: Date = new Date()): PokerWeekWindow {
  const [h, m, s] = boundaryTime.split(':').map(Number);
  for (let back = 0; back < 8; back++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() - back);
    candidate.setHours(h, m, s || 0, 0);
    const isoDay = candidate.getDay() === 0 ? 7 : candidate.getDay();
    if (isoDay === boundaryDayOfWeek && candidate.getTime() <= now.getTime()) {
      const end = new Date(candidate);
      end.setDate(end.getDate() + 7);
      return { start: candidate, end };
    }
  }
  // Unreachable — every 7-day lookback window contains one matching
  // weekday — but fail closed to "starts now" rather than throw.
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return { start: now, end };
}

async function resolveBoundaryConfig(coachId: string): Promise<{ id: string; boundaryDayOfWeek: number; boundaryTime: string } | null> {
  const { data, error } = await supabase
    .from('poker_week_boundary_configs')
    .select('id, boundary_day_of_week, boundary_time')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, boundaryDayOfWeek: data.boundary_day_of_week, boundaryTime: data.boundary_time };
}

async function fetchOrCreateCurrentPokerWeek(coachId: string, playerId: string): Promise<{ id: string }> {
  const existing = await fetchCurrentPokerWeek(playerId);
  if (existing) return { id: existing.id };

  const [{ data: profile, error: profileErr }, boundaryConfig] = await Promise.all([
    supabase.from('profiles').select('timezone').eq('id', playerId).single(),
    resolveBoundaryConfig(coachId),
  ]);
  if (profileErr) throw profileErr;

  const window = computeCurrentPokerWeekWindow(boundaryConfig?.boundaryDayOfWeek ?? 1, boundaryConfig?.boundaryTime ?? '10:00:00');

  const { data: created, error: createErr } = await supabase
    .from('poker_weeks')
    .insert({
      player_id: playerId,
      player_timezone_snapshot: profile.timezone,
      start_timestamp: window.start.toISOString(),
      end_timestamp: window.end.toISOString(),
      boundary_config_id: boundaryConfig?.id ?? null,
    })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return { id: created.id };
}

export interface WeeklyBRMAssignmentPreview {
  bankrollBandId: string;
  levelIndex: number;
  brmLevelId: string | null; // null if the coach hasn't configured this level's registration rules yet (PRD: don't invent values for Levels 6-8)
  brmConfigVersionId: string;
  currentBankroll: number;
  sessionStopLoss: number;
  dayStopLoss: number;
  weekStopLoss: number;
  maxTournamentBuyIn: number | null;
  maxSessionExposure: number | null;
}

/**
 * Resolves which bankroll band/BRM level the player's CURRENT bankroll
 * falls into under the coach's active BRM configuration. Returns null when
 * there's no active config or no band covers the bankroll at all — the
 * PRD §4 "Coach Configuration Required" case.
 */
export async function previewWeeklyBRMAssignment(coachId: string, playerId: string): Promise<WeeklyBRMAssignmentPreview | null> {
  const config = await fetchBRMConfigForCoach(coachId);
  if (!config) return null;
  const versions = await fetchBRMVersions(config.id);
  const active = currentBRMVersion(versions);
  if (!active) return null;

  const [bankrollRes, bandsRes] = await Promise.all([
    supabase.from('player_current_bankroll').select('current_bankroll').eq('player_id', playerId).maybeSingle(),
    supabase.from('brm_bankroll_bands').select('*').eq('version_id', active.id).order('level_index', { ascending: true }),
  ]);
  if (bankrollRes.error) throw bankrollRes.error;
  if (bandsRes.error) throw bandsRes.error;

  const currentBankroll = bankrollRes.data?.current_bankroll ?? 0;
  const bands = bandsRes.data || [];
  const band =
    bands.find((b) => currentBankroll >= b.min_bankroll && currentBankroll < b.max_bankroll) ??
    (bands.length > 0 && currentBankroll >= bands[bands.length - 1].max_bankroll ? bands[bands.length - 1] : null);
  if (!band) return null;

  const { data: level, error: levelErr } = await supabase
    .from('brm_levels')
    .select('id, max_tournament_buy_in, max_session_exposure')
    .eq('version_id', active.id)
    .eq('level_index', band.level_index)
    .maybeSingle();
  if (levelErr) throw levelErr;

  return {
    bankrollBandId: band.id,
    levelIndex: band.level_index,
    brmLevelId: level?.id ?? null,
    brmConfigVersionId: active.id,
    currentBankroll,
    sessionStopLoss: band.session_stop_loss,
    dayStopLoss: band.day_stop_loss,
    weekStopLoss: band.week_stop_loss,
    maxTournamentBuyIn: level?.max_tournament_buy_in ?? null,
    maxSessionExposure: level?.max_session_exposure ?? null,
  };
}

/** True once the player's CURRENT Poker Week (if any) already has a locked BRM assignment. */
export async function hasCurrentWeekAssignment(playerId: string): Promise<boolean> {
  const pokerWeek = await fetchCurrentPokerWeek(playerId);
  if (!pokerWeek) return false;
  const { data, error } = await supabase
    .from('weekly_brm_assignments')
    .select('id')
    .eq('player_id', playerId)
    .eq('poker_week_id', pokerWeek.id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function fetchOpeningCapital(playerId: string): Promise<number> {
  const { data, error } = await supabase.from('bankroll_ledger_entries').select('amount').eq('player_id', playerId).eq('entry_type', 'OPENING_CAPITAL');
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + r.amount, 0);
}

/** Creates (and implicitly locks — locked_at defaults to now() at the DB level) the player's Weekly BRM Assignment for the current Poker Week, creating that Poker Week first if it doesn't exist yet. */
export async function createWeeklyBRMAssignment(
  coachId: string,
  playerId: string,
  preview: WeeklyBRMAssignmentPreview,
  reason: string,
): Promise<void> {
  if (!preview.brmLevelId) {
    throw new Error(`BRM Level ${preview.levelIndex} registration rules are not yet configured. Coach Configuration Required.`);
  }

  const pokerWeek = await fetchOrCreateCurrentPokerWeek(coachId, playerId);

  const { data: existing, error: existErr } = await supabase
    .from('weekly_brm_assignments')
    .select('id')
    .eq('player_id', playerId)
    .eq('poker_week_id', pokerWeek.id)
    .maybeSingle();
  if (existErr) throw existErr;
  if (existing) {
    throw new Error('This player already has a locked BRM assignment for the current Poker Week.');
  }

  const openingCapital = await fetchOpeningCapital(playerId);

  const { error } = await supabase.from('weekly_brm_assignments').insert({
    player_id: playerId,
    poker_week_id: pokerWeek.id,
    brm_config_version_id: preview.brmConfigVersionId,
    bankroll_band_id: preview.bankrollBandId,
    brm_level_id: preview.brmLevelId,
    bankroll_balance_at_assignment: preview.currentBankroll,
    opening_capital_at_assignment: openingCapital,
    session_stop_loss_snapshot: preview.sessionStopLoss,
    day_stop_loss_snapshot: preview.dayStopLoss,
    week_stop_loss_snapshot: preview.weekStopLoss,
    change_reason: reason,
  });
  if (error) throw error;

  // §12 "De-escalation": evaluated at the weekly review boundary, aligned
  // with this same cadence. Never blocks the BRM lock itself — a player's
  // Weekly BRM Assignment is the trust-critical action here; a track
  // simply staying at its current stage for one more week if this fails is
  // self-correcting at the next weekly evaluation, unlike the assignment
  // lock itself, which cannot be silently retried.
  try {
    await runDeescalationForPlayer(playerId);
  } catch (err) {
    console.warn('[createWeeklyBRMAssignment] de-escalation pass failed', err);
  }
}
