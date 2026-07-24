// src/lib/interventions.ts
//
// Data access + mutations for the Intervention Engine (PRD §16). Coach-side:
// the coach-owned intervention library — each item carrying a single
// min_escalation_stage (no severity tier: that duplicated a classification
// Execution Actions already carry via base_severity, without ever being
// cross-checked against it — dropped in
// 20260722020000_drop_intervention_library_severity_tier.sql) — and manual
// assignment, keyed off the player's live escalation tracks rather than a
// bare list of every Execution Action (see AssignmentsSection in
// InterventionsConfigView.tsx: the "Active Track" dropdown is populated
// from escalationConfig.ts's fetchTracksForCoach, and the Intervention
// dropdown is filtered to items whose min_escalation_stage is at or below
// that track's current stage). Player-side: reading their own assigned
// interventions and marking one complete with a note the coach can read
// (fetchAssignmentsForPlayer / markAssignmentCompletedByPlayer below) —
// RLS only allows the player to move their own row from ASSIGNED to
// COMPLETED (see 20260722000000_player_complete_interventions.sql);
// assigning and cancelling remain coach-only.
//
// Load Management (PRD §16's per-severity-tier cooldowns/concurrency
// caps/autonomy mode) and the per-action Eligibility mapping this module
// used to expose are both retired — see PokerGOAT_PRD.md "## 22. Feature
// Updates", 2026-07-22 entries. Load Management is disabled at the
// application layer only: intervention_policies remains in the schema
// untouched, but nothing here reads or writes it anymore, and
// createManualAssignment hardcodes autonomy_mode_at_assignment to the
// PRD's own stated MVP default ('RECOMMEND_ONLY') instead of looking up a
// configured policy. Eligibility's per-(library item, Execution Action)
// mapping table (intervention_eligibility_mappings) was dropped entirely —
// a library item's min_escalation_stage now applies regardless of which
// action triggered it.
//
// The coach's effectiveness-rating review (intervention_effectiveness_reviews)
// is disabled the same way: the table stays untouched, but createEffectivenessReview
// and the "Log Review" mini-form on the Assignments screen are both removed —
// the UI let a coach type an arbitrary rating string while the column actually
// carries a CHECK constraint to 'EFFECTIVE'/'PARTIAL'/'INEFFECTIVE', and nothing
// ever read the rows back once submitted anyway.
//
// The full AI-driven flow PRD §16 describes (Load Management backlog,
// AI Personalization, Recommend-Only surfacing) isn't wired up anywhere in
// this codebase — nothing populates intervention_candidates. Rather than
// build a coach review queue for a table nothing ever fills, this module
// exposes the part that's real and coach-authoritative either way per PRD
// ("the coach retains final authority"): direct manual assignment from the
// coach-approved library, with escalation_stage_at_assignment captured from
// the player's live track at the moment of assignment.

import { supabase } from './supabase';
import { InterventionLibraryItem, InterventionAssignment } from '../types';

// --- Library -----------------------------------------------------------

export interface LibraryItemFields {
  name: string;
  description: string | null;
  requirements: string | null;
  min_escalation_stage: number;
}

export async function fetchLibrary(coachId: string): Promise<InterventionLibraryItem[]> {
  const { data, error } = await supabase
    .from('intervention_library')
    .select('*')
    .eq('coach_id', coachId)
    .order('min_escalation_stage', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createLibraryItem(coachId: string, fields: LibraryItemFields): Promise<InterventionLibraryItem> {
  const { data, error } = await supabase.from('intervention_library').insert({ ...fields, coach_id: coachId }).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateLibraryItem(id: string, fields: LibraryItemFields): Promise<InterventionLibraryItem> {
  const { data, error } = await supabase.from('intervention_library').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function setLibraryItemActive(id: string, isActive: boolean): Promise<InterventionLibraryItem> {
  const { data, error } = await supabase.from('intervention_library').update({ is_active: isActive }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

// --- Assignments -----------------------------------------------------------

export interface AssignmentWithContext extends InterventionAssignment {
  player_email: string;
  action_name: string;
  library_item_name: string;
}

export async function fetchAssignmentsForCoach(coachId: string): Promise<AssignmentWithContext[]> {
  const { data: players, error: playersError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('coach_id', coachId)
    .eq('role', 'PLAYER');
  if (playersError) throw playersError;
  const playerIds = (players || []).map((p) => p.id);
  if (playerIds.length === 0) return [];
  const emailById = new Map((players || []).map((p) => [p.id, p.email]));

  const { data: assignments, error } = await supabase
    .from('intervention_assignments')
    .select('*')
    .in('player_id', playerIds)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  if (!assignments || assignments.length === 0) return [];

  const actionIds = [...new Set(assignments.map((a) => a.execution_action_id))];
  const libraryIds = [...new Set(assignments.map((a) => a.library_item_id))];
  const [actionsRes, libraryRes] = await Promise.all([
    supabase.from('execution_actions').select('id, name').in('id', actionIds),
    supabase.from('intervention_library').select('id, name').in('id', libraryIds),
  ]);
  if (actionsRes.error) throw actionsRes.error;
  if (libraryRes.error) throw libraryRes.error;
  const actionNameById = new Map((actionsRes.data || []).map((a) => [a.id, a.name]));
  const libraryNameById = new Map((libraryRes.data || []).map((l) => [l.id, l.name]));

  return assignments.map((a) => ({
    ...a,
    player_email: emailById.get(a.player_id) ?? 'Unknown player',
    action_name: actionNameById.get(a.execution_action_id) ?? 'Unknown action',
    library_item_name: libraryNameById.get(a.library_item_id) ?? 'Unknown intervention',
  }));
}

/** Manual coach assignment — captures the player's live escalation stage at this moment. Load Management is disabled, so autonomy_mode_at_assignment is always the PRD's own stated MVP default rather than a looked-up policy. */
export async function createManualAssignment(
  coachId: string,
  playerId: string,
  executionActionId: string,
  libraryItem: InterventionLibraryItem,
): Promise<InterventionAssignment> {
  const { data: track, error: trackError } = await supabase
    .from('escalation_tracks')
    .select('current_stage_index')
    .eq('player_id', playerId)
    .eq('execution_action_id', executionActionId)
    .maybeSingle();
  if (trackError) throw trackError;

  const { data, error } = await supabase
    .from('intervention_assignments')
    .insert({
      player_id: playerId,
      execution_action_id: executionActionId,
      library_item_id: libraryItem.id,
      escalation_stage_at_assignment: track?.current_stage_index ?? 0,
      autonomy_mode_at_assignment: 'RECOMMEND_ONLY',
      assigned_by: coachId,
      status: 'ASSIGNED',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setAssignmentStatus(id: string, status: 'COMPLETED' | 'CANCELLED'): Promise<InterventionAssignment> {
  const { data, error } = await supabase
    .from('intervention_assignments')
    .update({ status, completed_at: status === 'COMPLETED' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// --- Player-facing read + completion --------------------------------------

export interface PlayerAssignment extends InterventionAssignment {
  action_name: string;
  library_item_name: string;
  library_item_description: string | null;
  library_item_requirements: string | null;
}

/** Count of this player's currently-ASSIGNED interventions — cheap enough for a nav-rail badge, unlike fetchAssignmentsForPlayer's full joined history. */
export async function countActiveAssignmentsForPlayer(playerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('intervention_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .eq('status', 'ASSIGNED');
  if (error) throw error;
  return count ?? 0;
}

/** Every intervention ever assigned to this player, newest first — includes the library item's own description/requirements so the player knows what's being asked of them. */
export async function fetchAssignmentsForPlayer(playerId: string): Promise<PlayerAssignment[]> {
  const { data: assignments, error } = await supabase
    .from('intervention_assignments')
    .select('*')
    .eq('player_id', playerId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  if (!assignments || assignments.length === 0) return [];

  const actionIds = [...new Set(assignments.map((a) => a.execution_action_id))];
  const libraryIds = [...new Set(assignments.map((a) => a.library_item_id))];
  const [actionsRes, libraryRes] = await Promise.all([
    supabase.from('execution_actions').select('id, name').in('id', actionIds),
    supabase.from('intervention_library').select('id, name, description, requirements').in('id', libraryIds),
  ]);
  if (actionsRes.error) throw actionsRes.error;
  if (libraryRes.error) throw libraryRes.error;
  const actionNameById = new Map((actionsRes.data || []).map((a) => [a.id, a.name]));
  const libraryById = new Map((libraryRes.data || []).map((l) => [l.id, l]));

  return assignments.map((a) => {
    const lib = libraryById.get(a.library_item_id);
    return {
      ...a,
      action_name: actionNameById.get(a.execution_action_id) ?? 'Unknown action',
      library_item_name: lib?.name ?? 'Unknown intervention',
      library_item_description: lib?.description ?? null,
      library_item_requirements: lib?.requirements ?? null,
    };
  });
}

/**
 * Player marks their own currently-ASSIGNED intervention complete, with an
 * optional note the coach can read alongside it. RLS ("Players complete own
 * assignments") only allows this exact ASSIGNED -> COMPLETED transition on
 * a row the player owns — a player can never assign, cancel, or reopen one.
 */
export async function markAssignmentCompletedByPlayer(assignmentId: string, playerNotes: string | null): Promise<InterventionAssignment> {
  const { data, error } = await supabase
    .from('intervention_assignments')
    .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), player_notes: playerNotes })
    .eq('id', assignmentId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
