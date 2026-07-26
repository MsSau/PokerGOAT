// src/lib/escalationConfig.ts
//
// Coach-side data access for the Behavioral Escalation Engine screen (PRD
// §12 / §3.3): the fixed 8-stage ladder (rendered as a single horizontal
// ladder per §3.3, never per-severity lists), each player's live
// Escalation Tracks, and the coach's mandatory-reason override path.
//
// Deliberately does NOT touch escalationEngine.ts — that module's stage
// transition logic (evaluateEscalationTransition, computeEscalationUpdateForOccurrence)
// is the deterministic engine PRD §17.5 requires and stays untouched here.
// This module only reads the tracks/events that engine produces and adds
// the one coach-facing write PRD §12 explicitly calls for: "coach can
// override any stage transition or de-escalation with a mandatory reason
// ... an override creates a new event referencing the one it supersedes, it
// does not edit history."
//
// The compliance-window length and base point weights/thresholds PRD §12
// also calls "coach-configurable" have no corresponding columns anywhere in
// the schema yet (escalation_rule_versions carries no content, only
// is_activated/version_number) — they're intentionally not exposed as
// editable here rather than wiring up settings nothing would ever read.

import { supabase } from './supabase';
import { EscalationTrack, EscalationEvent, EscalationRuleVersion } from '../types';
import { CoachId, EscalationTrackId } from '../types/ids';

export interface LadderStage {
  index: number;
  label: string;
  tier: 'BASELINE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
}

export const ESCALATION_LADDER: LadderStage[] = [
  { index: 0, label: 'Baseline', tier: 'BASELINE' },
  { index: 1, label: 'Minor Stage 1', tier: 'MINOR' },
  { index: 2, label: 'Minor Stage 2', tier: 'MINOR' },
  { index: 3, label: 'Major Stage 1', tier: 'MAJOR' },
  { index: 4, label: 'Major Stage 2', tier: 'MAJOR' },
  { index: 5, label: 'Critical Stage 1', tier: 'CRITICAL' },
  { index: 6, label: 'Critical Stage 2', tier: 'CRITICAL' },
  { index: 7, label: 'Critical Stage 3', tier: 'CRITICAL' },
  { index: 8, label: 'Critical Stage 4', tier: 'CRITICAL' },
];

export const MANDATORY_REVIEW_STAGE = 8;

export function stageLabel(index: number): string {
  return ESCALATION_LADDER.find((s) => s.index === index)?.label ?? `Stage ${index}`;
}

export interface EscalationTrackWithContext extends EscalationTrack {
  action_name: string;
  action_dimension: string;
  player_email: string;
}

/** Every active (stage > 0) track across the coach's roster, highest stage first. */
export async function fetchTracksForCoach(coachId: CoachId): Promise<EscalationTrackWithContext[]> {
  const { data: players, error: playersError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('coach_id', coachId)
    .eq('role', 'PLAYER');
  if (playersError) throw playersError;
  const playerIds = (players || []).map((p) => p.id);
  if (playerIds.length === 0) return [];
  const emailById = new Map((players || []).map((p) => [p.id, p.email]));

  const { data: tracks, error } = await supabase
    .from('escalation_tracks')
    .select('*')
    .in('player_id', playerIds)
    .gt('current_stage_index', 0)
    .order('current_stage_index', { ascending: false });
  if (error) throw error;
  if (!tracks || tracks.length === 0) return [];

  const actionIds = [...new Set(tracks.map((t) => t.execution_action_id))];
  const { data: actions, error: actionsError } = await supabase
    .from('execution_actions')
    .select('id, name, dimension')
    .in('id', actionIds);
  if (actionsError) throw actionsError;
  const actionById = new Map((actions || []).map((a) => [a.id, a]));

  return tracks.map((t) => ({
    ...t,
    action_name: actionById.get(t.execution_action_id)?.name ?? 'Unknown action',
    action_dimension: actionById.get(t.execution_action_id)?.dimension ?? '',
    player_email: emailById.get(t.player_id) ?? 'Unknown player',
  }));
}

/** Immutable audit trail for one track, newest first. */
export async function fetchEventsForTrack(trackId: EscalationTrackId): Promise<EscalationEvent[]> {
  const { data, error } = await supabase
    .from('escalation_events')
    .select('*')
    .eq('track_id', trackId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** escalation_rule_versions ships empty and unscoped — lazily seed the single shared v1 the first time it's needed. */
export async function fetchOrCreateActiveRuleVersion(): Promise<EscalationRuleVersion> {
  const { data: existing, error } = await supabase
    .from('escalation_rule_versions')
    .select('*')
    .eq('is_activated', true)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from('escalation_rule_versions')
    .insert({ version_number: 1, is_activated: true })
    .select('*')
    .single();
  if (createError) throw createError;
  return created;
}

export async function overrideEscalationStage(track: EscalationTrack, newStage: number, reason: string): Promise<void> {
  const ruleVersion = await fetchOrCreateActiveRuleVersion();

  const { data: latestEvent, error: latestError } = await supabase
    .from('escalation_events')
    .select('id')
    .eq('track_id', track.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const { error: insertError } = await supabase.from('escalation_events').insert({
    track_id: track.id,
    old_stage: track.current_stage_index,
    new_stage: newStage,
    rule_version_id: ruleVersion.id,
    satisfied_conditions: ['coach_override'],
    reason,
    is_override: true,
    supersedes_event_id: latestEvent?.id ?? null,
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('escalation_tracks')
    .update({ current_stage_index: newStage })
    .eq('id', track.id);
  if (updateError) throw updateError;
}
