// src/lib/taxonomy.ts
//
// Coach-side data access + mutations for the Execution Taxonomy (PRD §10 /
// §3.3): canonical Execution Actions grouped by the same four dimensions
// the player's mistake picker (2.6) and executionEngine.ts score against,
// plus the Proposed-actions approval queue.
//
// execution_actions rows are edited in place (no version-row-per-edit
// scheme like Framework/BRM) because the things that actually need to stay
// historically stable already snapshot themselves elsewhere: each
// execution_action_occurrence freezes its own hard_gate_triggered at
// occurrence time, and session_execution_assessments freezes its
// taxonomy_version_id at finalize time. Editing a canonical action's fields
// later doesn't retroactively rewrite either. change_reason still captures
// the coach's mandatory-reason-modal justification (PRD §3.3) for edits to
// an already-CANONICAL_ACTIVE action.

import { supabase } from './supabase';
import { ExecutionTaxonomy, TaxonomyVersion, ExecutionAction } from '../types';
import { Dimension } from './executionEngine';
import { Database } from '../types/database';
import { CoachId, TaxonomyVersionId, ExecutionActionId } from '../types/ids';

export type Severity = Database['public']['Enums']['severity_type'];

export interface ExecutionActionFields {
  name: string;
  dimension: Dimension;
  base_severity: Severity;
  description: string | null;
  detection_method: string | null;
  is_hard_gate: boolean;
}

export async function fetchOrCreateTaxonomy(coachId: CoachId): Promise<{ taxonomy: ExecutionTaxonomy; version: TaxonomyVersion }> {
  const { data: existing, error: fetchError } = await supabase
    .from('execution_taxonomies')
    .select('*')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  let taxonomy = existing;
  if (!taxonomy) {
    const { data: created, error: createError } = await supabase
      .from('execution_taxonomies')
      .insert({ coach_id: coachId })
      .select('*')
      .single();
    if (createError) throw createError;
    taxonomy = created;
  }

  const { data: activeVersion, error: verError } = await supabase
    .from('taxonomy_versions')
    .select('*')
    .eq('taxonomy_id', taxonomy.id)
    .eq('is_activated', true)
    .maybeSingle();
  if (verError) throw verError;

  if (activeVersion) return { taxonomy, version: activeVersion };

  const { data: newVersion, error: newVerError } = await supabase
    .from('taxonomy_versions')
    .insert({ taxonomy_id: taxonomy.id, version_number: 1, is_activated: true })
    .select('*')
    .single();
  if (newVerError) throw newVerError;

  return { taxonomy, version: newVersion };
}

/** Canonical + inactive actions belonging to this coach's active taxonomy version — the four dimension tabs. */
export async function fetchCanonicalActions(taxonomyVersionId: TaxonomyVersionId): Promise<ExecutionAction[]> {
  const { data, error } = await supabase
    .from('execution_actions')
    .select('*')
    .eq('taxonomy_version_id', taxonomyVersionId)
    .in('status', ['CANONICAL_ACTIVE', 'INACTIVE'])
    .order('dimension', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Player-proposed actions awaiting this coach's approval — the always-visible fifth "Proposed" tab. */
export async function fetchProposedActions(coachId: CoachId): Promise<ExecutionAction[]> {
  const { data: players, error: playersError } = await supabase.from('profiles').select('id').eq('coach_id', coachId).eq('role', 'PLAYER');
  if (playersError) throw playersError;
  const playerIds = (players || []).map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('execution_actions')
    .select('*')
    .eq('status', 'PLAYER_PROPOSED')
    .in('proposed_by', playerIds)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCanonicalAction(
  coachId: CoachId,
  taxonomyVersionId: TaxonomyVersionId,
  fields: ExecutionActionFields,
): Promise<ExecutionAction> {
  const { data, error } = await supabase
    .from('execution_actions')
    .insert({
      ...fields,
      taxonomy_version_id: taxonomyVersionId,
      status: 'CANONICAL_ACTIVE',
      approved_by: coachId,
      approved_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Edits an already-canonical action's fields — gated behind the mandatory-reason modal. */
export async function updateCanonicalAction(actionId: ExecutionActionId, fields: ExecutionActionFields, reason: string): Promise<ExecutionAction> {
  const { data, error } = await supabase
    .from('execution_actions')
    .update({ ...fields, change_reason: reason })
    .eq('id', actionId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function setActionActiveStatus(actionId: ExecutionActionId, isActive: boolean, reason: string): Promise<ExecutionAction> {
  const { data, error } = await supabase
    .from('execution_actions')
    .update({ status: isActive ? 'CANONICAL_ACTIVE' : 'INACTIVE', change_reason: reason })
    .eq('id', actionId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Approving a proposal requires the coach to set every scoring-relevant field — it never inherits defaults silently (PRD §3.3). */
export async function approveProposedAction(
  actionId: ExecutionActionId,
  coachId: CoachId,
  taxonomyVersionId: TaxonomyVersionId,
  fields: ExecutionActionFields,
): Promise<ExecutionAction> {
  const { data, error } = await supabase
    .from('execution_actions')
    .update({
      ...fields,
      taxonomy_version_id: taxonomyVersionId,
      status: 'CANONICAL_ACTIVE',
      approved_by: coachId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', actionId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function rejectProposedAction(actionId: ExecutionActionId): Promise<void> {
  const { error } = await supabase.from('execution_actions').update({ status: 'INACTIVE' }).eq('id', actionId);
  if (error) throw error;
}
