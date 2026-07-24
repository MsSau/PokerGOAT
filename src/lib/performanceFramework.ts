// src/lib/performanceFramework.ts
//
// Coach-side data access + mutations for the quarterly Performance
// Framework (PRD §3). Only the coach can create, edit, activate, or archive
// a framework; the player-facing ActiveFrameworkView stays strictly
// read-only and untouched by this module.
//
// Versioning model (matches the DB, not invented here): framework_versions
// carries a `tr_enforce_immutability_framework_versions` trigger that blocks
// any content change to a row once its is_activated = true — flipping
// is_activated itself is always allowed, everything else is not. So:
//   - a DRAFT framework's version has is_activated = false and can be
//     updated in place (updateDraftVersion) with no reason required;
//   - editing a framework that has already been activated cannot mutate
//     that version's row at all — it must insert a new version
//     (version_number + 1, is_activated = true, carrying the coach's
//     reason) and flip the previous version's is_activated to false. The
//     old version row is left completely untouched, immutable, and
//     inspectable forever — that row IS the audit record PRD §3 requires.

import { supabase } from './supabase';
import { PerformanceFramework, FrameworkVersion } from '../types';

export interface FrameworkWithCurrentVersion {
  framework: PerformanceFramework;
  currentVersion: FrameworkVersion;
}

export interface FrameworkEditableFields {
  primary_objective: string;
  start_date: string | null;
  end_date: string | null;
}

/** All frameworks (any status) owned by this coach, each paired with its current working/active version. */
export async function fetchFrameworksForCoach(coachId: string): Promise<FrameworkWithCurrentVersion[]> {
  const { data: frameworks, error: fwError } = await supabase
    .from('performance_frameworks')
    .select('*')
    .eq('coach_id', coachId);
  if (fwError) throw fwError;
  if (!frameworks || frameworks.length === 0) return [];

  const { data: versions, error: verError } = await supabase
    .from('framework_versions')
    .select('*')
    .in('framework_id', frameworks.map((f) => f.id))
    .order('version_number', { ascending: false });
  if (verError) throw verError;

  const currentByFramework = new Map<string, FrameworkVersion>();
  for (const v of versions || []) {
    const existing = currentByFramework.get(v.framework_id);
    if (!existing) {
      currentByFramework.set(v.framework_id, v);
    } else if (!existing.is_activated && v.is_activated) {
      // Prefer the activated version over a stray later draft, if both exist.
      currentByFramework.set(v.framework_id, v);
    }
  }

  return frameworks
    .map((framework) => {
      const currentVersion = currentByFramework.get(framework.id);
      return currentVersion ? { framework, currentVersion } : null;
    })
    .filter((x): x is FrameworkWithCurrentVersion => x !== null);
}

/** Full version history for one framework, newest first — the Version History tab. */
export async function fetchFrameworkVersions(frameworkId: string): Promise<FrameworkVersion[]> {
  const { data, error } = await supabase
    .from('framework_versions')
    .select('*')
    .eq('framework_id', frameworkId)
    .order('version_number', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Creates a new Draft framework with its first (unactivated, freely-editable) version. */
export async function createFramework(
  coachId: string,
  fields: FrameworkEditableFields,
): Promise<FrameworkWithCurrentVersion> {
  const { data: framework, error: fwError } = await supabase
    .from('performance_frameworks')
    .insert({ coach_id: coachId, status: 'DRAFT' })
    .select('*')
    .single();
  if (fwError) throw fwError;

  const { data: version, error: verError } = await supabase
    .from('framework_versions')
    .insert({
      framework_id: framework.id,
      version_number: 1,
      is_activated: false,
      primary_objective: fields.primary_objective,
      start_date: fields.start_date,
      end_date: fields.end_date,
    })
    .select('*')
    .single();
  if (verError) throw verError;

  return { framework, currentVersion: version };
}

/** In-place edit of a not-yet-activated (Draft) version — no reason required, nothing binding yet. */
export async function updateDraftVersion(versionId: string, fields: FrameworkEditableFields): Promise<FrameworkVersion> {
  const { data, error } = await supabase
    .from('framework_versions')
    .update({
      primary_objective: fields.primary_objective,
      start_date: fields.start_date,
      end_date: fields.end_date,
    })
    .eq('id', versionId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * Edits a framework that has already been activated at least once. Cannot
 * touch the current version's row (DB immutability trigger forbids it) —
 * inserts version N+1 with the coach's mandatory reason and flips the
 * previous version off.
 */
export async function reviseActivatedFramework(
  frameworkId: string,
  currentVersion: FrameworkVersion,
  fields: FrameworkEditableFields,
  reason: string,
): Promise<FrameworkVersion> {
  const { data: newVersion, error: insError } = await supabase
    .from('framework_versions')
    .insert({
      framework_id: frameworkId,
      version_number: currentVersion.version_number + 1,
      is_activated: true,
      change_reason: reason,
      primary_objective: fields.primary_objective,
      start_date: fields.start_date,
      end_date: fields.end_date,
    })
    .select('*')
    .single();
  if (insError) throw insError;

  // .select() + a length check, not just `if (error)` — an UPDATE that
  // matches zero rows (e.g. an RLS gap, or a stale/wrong id) succeeds with
  // no error in PostgREST, which is exactly how this silently corrupted
  // data before: two versions ended up is_activated = true simultaneously
  // and nothing failed until some unrelated later read (`.maybeSingle()`)
  // broke on "multiple rows returned". Fail loudly here instead.
  const { data: deactivated, error: updError } = await supabase
    .from('framework_versions')
    .update({ is_activated: false })
    .eq('id', currentVersion.id)
    .select('id');
  if (updError) throw updError;
  if (!deactivated || deactivated.length === 0) {
    throw new Error(`Failed to deactivate framework version ${currentVersion.id} — it may no longer exist or you may lack permission.`);
  }

  return newVersion;
}

/**
 * Activates a Draft framework: archives any other Active framework this
 * coach has (PRD implies exactly one Active framework at a time — every
 * consumer that reads "the" active framework assumes a single row), sets
 * this one Active, and flips its current version on.
 */
export async function activateFramework(coachId: string, frameworkId: string, versionId: string): Promise<void> {
  const { error: archiveError } = await supabase
    .from('performance_frameworks')
    .update({ status: 'ARCHIVED' })
    .eq('coach_id', coachId)
    .eq('status', 'ACTIVE')
    .neq('id', frameworkId);
  if (archiveError) throw archiveError;

  const { error: fwError } = await supabase
    .from('performance_frameworks')
    .update({ status: 'ACTIVE' })
    .eq('id', frameworkId);
  if (fwError) throw fwError;

  const { data: activated, error: verError } = await supabase
    .from('framework_versions')
    .update({ is_activated: true })
    .eq('id', versionId)
    .select('id');
  if (verError) throw verError;
  if (!activated || activated.length === 0) {
    throw new Error(`Failed to activate framework version ${versionId} — it may no longer exist or you may lack permission.`);
  }
}

export async function archiveFramework(frameworkId: string): Promise<void> {
  const { error } = await supabase.from('performance_frameworks').update({ status: 'ARCHIVED' }).eq('id', frameworkId);
  if (error) throw error;
}
