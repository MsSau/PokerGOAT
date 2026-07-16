import { supabase } from './supabase';

export type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL';

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
  const priorDirective = directives.some((d) => new Date(d.created_at) < new Date(occurredAtIso));
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