import { supabase } from './supabase';
import { Database } from '../types/database';
import { fetchCurrentPokerWeek } from './sessionContract';

export type Severity = Database['public']['Enums']['severity_type'];

export interface EscalationUpdate {
  execution_action_id: string;
  old_stage: number;
  new_stage: number;
  satisfied_conditions: string[];
}

// "Recent" = last poker week, "Short-term" = last calendar month (§9).
// TBD: swap for the coach's actual poker_week boundary once a per-coach
// window length is exposed on brm_config_versions / escalation_rule_versions;
// 7/30-day rolling windows are a correct MVP approximation.
const RECENT_WINDOW_DAYS = 7;
const SHORT_TERM_WINDOW_DAYS = 30;

async function fetchTrackAndHistory(playerId: string, actionId: string) {
  const { data: track } = await supabase
    .from('escalation_tracks')
    .select('id, current_stage_index, last_occurrence_at')
    .eq('player_id', playerId)
    .eq('execution_action_id', actionId)
    .maybeSingle();

  const { data: occurrences, error } = await supabase
    .from('execution_action_occurrences')
    .select('id, occurred_at, session_id, sessions!inner(player_id)')
    .eq('execution_action_id', actionId)
    .eq('sessions.player_id', playerId)
    .order('occurred_at', { ascending: true });
  if (error) throw error;

  // TBD: coach_directives has no execution_action_id column in the current
  // schema, so directive-to-action linkage isn't modeled yet. For MVP any
  // directive counts as "referencing this action" — tighten once that FK
  // exists.
  const { data: directives } = await supabase
    .from('coach_directives')
    .select('id, created_at')
    .eq('player_id', playerId);

  const { data: interventions } = await supabase
    .from('intervention_assignments')
    .select('id, assigned_at, execution_action_id')
    .eq('player_id', playerId)
    .eq('execution_action_id', actionId);

  return { track, occurrences: occurrences || [], directives: directives || [], interventions: interventions || [] };
}

function withinDays(dateIso: string, days: number, referenceIso: string): boolean {
  const ref = new Date(referenceIso).getTime();
  const t = new Date(dateIso).getTime();
  return t < ref && ref - t <= days * 24 * 60 * 60 * 1000;
}

/**
 * Pure function: evaluates ONE occurrence given precomputed history flags.
 * Always takes the HIGHEST satisfied stage, never the first match (§12).
 */
export function evaluateEscalationTransition(params: {
  severity: Severity;
  currentStage: number;
  priorOccurrencesRecent: number;
  priorMinorAtStage2: boolean;
  priorMajorEver: boolean;
  priorCriticalEver: boolean;
  priorCriticalRecent: boolean;
  majorRepeatedAfterDirective: boolean;
  majorRepeatedAfterIntervention: boolean;
  criticalRepeatedAfterCoaching: boolean;
}): { newStage: number; satisfied: string[] } {
  const satisfied: string[] = [];
  const candidates: number[] = [params.currentStage === 0 ? 0 : params.currentStage];

  if (params.severity === 'MINOR') {
    if (params.currentStage === 0) { candidates.push(1); satisfied.push('first_minor_at_baseline'); }
    if (params.priorOccurrencesRecent > 0) { candidates.push(2); satisfied.push('repeat_minor_recent_window'); }
    if (params.priorMinorAtStage2) { candidates.push(3); satisfied.push('minor_persists_into_short_term'); }
  }

  if (params.severity === 'MAJOR') {
    if (!params.priorMajorEver) { candidates.push(3); satisfied.push('first_ever_major'); }
    if (params.priorOccurrencesRecent > 0) { candidates.push(4); satisfied.push('repeat_major_recent_window'); }
    if (params.majorRepeatedAfterDirective) { candidates.push(5); satisfied.push('major_after_coach_directive'); }
    if (params.majorRepeatedAfterIntervention) { candidates.push(6); satisfied.push('major_after_intervention'); }
  }

  if (params.severity === 'CRITICAL') {
    if (!params.priorCriticalEver) { candidates.push(5); satisfied.push('first_ever_critical'); }
    if (params.priorCriticalRecent) { candidates.push(6); satisfied.push('repeat_critical_recent_window'); }
    if (params.criticalRepeatedAfterCoaching) { candidates.push(7); satisfied.push('critical_after_coaching_or_intervention'); }
    if (params.currentStage >= 7) { candidates.push(8); satisfied.push('further_critical_after_stage3'); }
  }

  return { newStage: Math.max(...candidates), satisfied };
}

/**
 * Fetches history and evaluates ONE new occurrence. Pass the returned
 * new_stage back in as `runningStageOverride` when processing a second
 * occurrence of the SAME action later in the same session — that keeps
 * a multi-occurrence session correctly sequential (§12's "post-event
 * escalation stage" rule).
 */
export async function computeEscalationUpdateForOccurrence(
  playerId: string,
  actionId: string,
  severity: Severity,
  occurredAtIso: string,
  runningStageOverride?: number,
): Promise<EscalationUpdate> {
  const { track, occurrences, directives, interventions } = await fetchTrackAndHistory(playerId, actionId);
  const currentStage = runningStageOverride ?? track?.current_stage_index ?? 0;

  const priorOccurrencesRecent = occurrences.filter((o) =>
    withinDays(o.occurred_at, RECENT_WINDOW_DAYS, occurredAtIso),
  ).length;
  const priorOccurrencesShortTerm = occurrences.filter((o) =>
    withinDays(o.occurred_at, SHORT_TERM_WINDOW_DAYS, occurredAtIso),
  ).length;

  const priorMinorAtStage2 = currentStage === 2 && priorOccurrencesShortTerm > 0;
  const priorMajorEver = currentStage >= 3;
  const priorCriticalEver = currentStage >= 5;
  const priorCriticalRecent = priorCriticalEver && priorOccurrencesRecent > 0;
  const priorDirective = directives.some((d) => d.created_at && new Date(d.created_at) < new Date(occurredAtIso));
  const priorIntervention = interventions.some((i) => i.assigned_at && new Date(i.assigned_at) < new Date(occurredAtIso));

  const { newStage, satisfied } = evaluateEscalationTransition({
    severity,
    currentStage,
    priorOccurrencesRecent,
    priorMinorAtStage2,
    priorMajorEver,
    priorCriticalEver,
    priorCriticalRecent,
    majorRepeatedAfterDirective: priorDirective && currentStage >= 3,
    majorRepeatedAfterIntervention: priorIntervention && currentStage >= 3,
    criticalRepeatedAfterCoaching: (priorDirective || priorIntervention) && currentStage >= 5,
  });

  return { execution_action_id: actionId, old_stage: currentStage, new_stage: newStage, satisfied_conditions: satisfied };
}

// De-escalation (§12 "De-escalation"): evaluated at the weekly review
// boundary — NOT per-occurrence like evaluateEscalationTransition above —
// aligned with the same cadence as BRM level locking (weeklyBrmAssignment.ts's
// createWeeklyBRMAssignment is the one call site, called once per player
// per Poker Week). Four consecutive poker days with zero occurrences of a
// specific Execution Action reduce that track's stage by exactly one,
// using the same total ordering escalation uses (e.g. Critical Stage 1 ->
// Major Stage 2 in ONE evaluation, never straight to Baseline in one jump).
//
// This function only ever removes one stage per call — it does NOT check
// how long the track has been quiet beyond the 4-day threshold. But
// because runDeescalationForPlayer runs every Poker Week and de-escalation
// never resets last_occurrence_at, a track that stays quiet keeps
// satisfying this same check on every subsequent weekly evaluation: one
// stage down this week, another stage down next week, and so on. Enough
// consecutive quiet weeks DO walk a track all the way down to Baseline
// (stage 0) — that just happens through repeated weekly evaluations
// stacking up, never through a single evaluation skipping stages.
const DEESCALATION_COMPLIANCE_DAYS = 4;

// A "poker day" runs from poker_day_boundary_time to the same time the next
// day, not midnight-to-midnight — same boundary config coach-configurable
// per poker_week_boundary_configs and already used for "today" windows in
// sessionContract.ts's computeTodayBoundaries. "Four consecutive poker days
// with zero occurrences" means four of these boundary-to-boundary windows
// have started since the last occurrence, not a raw 96-hour duration — so
// this counts discrete poker-day-index crossings rather than dividing
// elapsed milliseconds by 24h. Matches poker_week_boundary_configs'
// DEFAULT '10:00:00' when no coach config is resolved.
export const DEFAULT_POKER_DAY_BOUNDARY_TIME = '10:00:00';

function boundaryOffsetMs(boundaryTime: string): number {
  const [h, m, s] = boundaryTime.split(':').map(Number);
  return ((h * 60 + m) * 60 + (s || 0)) * 1000;
}

// Interprets boundaryTime as a UTC time-of-day (unlike computeTodayBoundaries,
// which reads it against the browser's local clock) so this stays a pure,
// deterministic function safe to unit test without timezone-dependent
// flakiness — the same MVP-approximation posture as this module's other
// day-window math (see RECENT_WINDOW_DAYS/SHORT_TERM_WINDOW_DAYS above).
function pokerDayIndex(iso: string, boundaryTime: string): number {
  return Math.floor((new Date(iso).getTime() - boundaryOffsetMs(boundaryTime)) / (24 * 60 * 60 * 1000));
}

/** Number of poker-day boundaries crossed between two timestamps (>=0 when toIso is after fromIso). */
export function pokerDaysElapsed(fromIso: string, toIso: string, boundaryTime: string = DEFAULT_POKER_DAY_BOUNDARY_TIME): number {
  return pokerDayIndex(toIso, boundaryTime) - pokerDayIndex(fromIso, boundaryTime);
}

export function evaluateDeescalation(
  currentStage: number,
  lastOccurrenceAtIso: string | null,
  nowIso: string,
  pokerDayBoundaryTime: string = DEFAULT_POKER_DAY_BOUNDARY_TIME,
): number {
  if (currentStage <= 0 || !lastOccurrenceAtIso) return currentStage;
  const pokerDaysQuiet = pokerDaysElapsed(lastOccurrenceAtIso, nowIso, pokerDayBoundaryTime);
  return pokerDaysQuiet >= DEESCALATION_COMPLIANCE_DAYS ? currentStage - 1 : currentStage;
}

// Resolves the player's currently-active poker-day boundary time the same
// way sessionContract.ts's computeTodayBoundaries does (via their current
// Poker Week's boundary_config_id) — duplicated in miniature here (single
// column, no "today" window construction) rather than exporting that
// private helper, since createWeeklyBRMAssignment (this function's one
// caller) always creates/resolves the current Poker Week just before
// calling runDeescalationForPlayer, so a current week is expected to exist.
async function resolvePokerDayBoundaryTime(playerId: string): Promise<string> {
  const week = await fetchCurrentPokerWeek(playerId);
  if (!week?.boundary_config_id) return DEFAULT_POKER_DAY_BOUNDARY_TIME;

  const { data, error } = await supabase
    .from('poker_week_boundary_configs')
    .select('poker_day_boundary_time')
    .eq('id', week.boundary_config_id)
    .maybeSingle();
  if (error) throw error;
  return data?.poker_day_boundary_time ?? DEFAULT_POKER_DAY_BOUNDARY_TIME;
}

export interface DeescalationOutcome {
  track_id: string;
  execution_action_id: string;
  old_stage: number;
  new_stage: number;
}

// escalation_events.rule_version_id is NOT NULL, and escalation_rule_versions
// ships empty/unscoped — same "lazily seed the single shared v1" fallback
// escalationConfig.ts's fetchOrCreateActiveRuleVersion uses for its own
// coach-override writes. Duplicated in miniature here (id only, not the
// full row) rather than importing that coach-facing module into this
// deterministic engine, keeping this module's dependency direction
// one-way (config/UI modules depend on the engine, never the reverse).
async function fetchOrCreateActiveEscalationRuleVersionId(): Promise<string> {
  const { data: existing, error } = await supabase
    .from('escalation_rule_versions')
    .select('id')
    .eq('is_activated', true)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('escalation_rule_versions')
    .insert({ version_number: 1, is_activated: true })
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

/**
 * Runs the de-escalation check across every one of a player's active
 * tracks (current_stage_index > 0). Any track whose compliance window
 * clears gets its stage stepped down by exactly one and an immutable
 * Escalation Event recorded (§12) — the same append-only, never-edit-
 * history pattern escalation itself and coach overrides both use. Returns
 * only the tracks that actually changed.
 */
export async function runDeescalationForPlayer(playerId: string, nowIso: string = new Date().toISOString()): Promise<DeescalationOutcome[]> {
  const { data: tracks, error } = await supabase
    .from('escalation_tracks')
    .select('id, execution_action_id, current_stage_index, last_occurrence_at')
    .eq('player_id', playerId)
    .gt('current_stage_index', 0);
  if (error) throw error;
  if (!tracks || tracks.length === 0) return [];

  const pokerDayBoundaryTime = await resolvePokerDayBoundaryTime(playerId);
  const outcomes: DeescalationOutcome[] = [];
  let ruleVersionId: string | null = null;

  for (const track of tracks) {
    const newStage = evaluateDeescalation(track.current_stage_index, track.last_occurrence_at, nowIso, pokerDayBoundaryTime);
    if (newStage === track.current_stage_index) continue;

    ruleVersionId ??= await fetchOrCreateActiveEscalationRuleVersionId();

    const { error: eventError } = await supabase.from('escalation_events').insert({
      track_id: track.id,
      rule_version_id: ruleVersionId,
      old_stage: track.current_stage_index,
      new_stage: newStage,
      satisfied_conditions: ['deescalation_compliance_window'],
    });
    if (eventError) throw eventError;

    const { error: updateError } = await supabase
      .from('escalation_tracks')
      .update({ current_stage_index: newStage })
      .eq('id', track.id);
    if (updateError) throw updateError;

    outcomes.push({
      track_id: track.id,
      execution_action_id: track.execution_action_id,
      old_stage: track.current_stage_index,
      new_stage: newStage,
    });
  }

  return outcomes;
}