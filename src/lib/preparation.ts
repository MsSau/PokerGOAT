// src/lib/preparation.ts — data access for the Preparation Engine (PRD §7).
// Deterministic scoring itself lives in preparationEngine.ts; this module is
// pure Supabase I/O plus wiring that scoring into a stored record.

import { supabase } from './supabase';
import { Database } from '../types/database';
import { computePreparationMedal, countSupportingComponents, PhysicalReadiness } from './preparationEngine';

export type PreparationRecordRow = Database['public']['Tables']['preparation_records']['Row'];

// preparation_rule_sets/preparation_rule_versions are coach/system-owned —
// RLS grants only SELECT (no INSERT policy), matching the same pattern
// documented in weeklyGamePlan.ts for Poker Weeks and Weekly BRM Assignments.
// Row creation is out-of-repo/manual for this MVP slice; if none exists yet
// we correctly block Preparation Check-in submission rather than fabricate
// a rule_version_id client-side (preparation_records.rule_version_id is a
// NOT NULL FK).
async function fetchActivePreparationRuleVersionId(coachId: string): Promise<string | null> {
  const { data: ruleSet } = await supabase
    .from('preparation_rule_sets')
    .select('id')
    .eq('coach_id', coachId)
    .maybeSingle();
  if (!ruleSet) return null;

  const { data: version } = await supabase
    .from('preparation_rule_versions')
    .select('id')
    .eq('rule_set_id', ruleSet.id)
    .eq('is_activated', true)
    .maybeSingle();
  return version?.id ?? null;
}

export interface PreparationCheckInInput {
  sleepHours: number | null;
  meditationMinutes: number | null;
  physicalReadiness: PhysicalReadiness | null;
  mentalPriming: boolean | null;
  impulseControlSmoking: boolean | null;
  impulseControlPmo: boolean | null;
  impulseControlRecovery: boolean | null;
  optionalNote: string | null;
  preGameRitualCompleted: boolean;
  // Pre-Game Ritual's three free-text prompts (Intent, Identity line,
  // Process definition) — only present when the ritual was completed and
  // the player actually typed something; null/omitted otherwise.
  ritualIntent?: string | null;
  ritualIdentityLine?: string | null;
  ritualProcessDefinition?: string | null;
}

// Computes the Preparation Medal from the check-in inputs and stores both
// the raw signals and the medal together — "store raw preparation data
// separately from the Medal" (§7) means never overwrite/discard the raw
// inputs, not that they live in a different table.
export async function createPreparationRecord(
  playerId: string,
  coachId: string,
  input: PreparationCheckInInput,
): Promise<PreparationRecordRow> {
  const ruleVersionId = await fetchActivePreparationRuleVersionId(coachId);
  if (!ruleVersionId) {
    throw new Error('No active Preparation rule set configured. Ask your coach to set one up.');
  }

  const supportingComponentsCompleted = countSupportingComponents({
    physicalReadiness: input.physicalReadiness,
    mentalPriming: input.mentalPriming,
    impulseControlSmoking: input.impulseControlSmoking,
    impulseControlPmo: input.impulseControlPmo,
    impulseControlRecovery: input.impulseControlRecovery,
  });
  const medal = computePreparationMedal({
    sleepHours: input.sleepHours,
    meditationMinutes: input.meditationMinutes,
    supportingComponentsCompleted,
  });

  const { data, error } = await supabase
    .from('preparation_records')
    .insert({
      player_id: playerId,
      rule_version_id: ruleVersionId,
      sleep_hours: input.sleepHours,
      meditation_minutes: input.meditationMinutes,
      physical_readiness: input.physicalReadiness,
      mental_priming: input.mentalPriming,
      impulse_control_smoking: input.impulseControlSmoking,
      impulse_control_pmo: input.impulseControlPmo,
      impulse_control_recovery: input.impulseControlRecovery,
      optional_note: input.optionalNote,
      pre_game_ritual_completed: input.preGameRitualCompleted,
      ritual_intent: input.ritualIntent ?? null,
      ritual_identity_line: input.ritualIdentityLine ?? null,
      ritual_process_definition: input.ritualProcessDefinition ?? null,
      medal_tier: medal,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchLatestPreparationRecord(playerId: string): Promise<PreparationRecordRow | null> {
  const { data, error } = await supabase
    .from('preparation_records')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// A Preparation Check-in authorizes exactly one session (perform_start_session
// enforces this server-side via a unique index on sessions.preparation_id).
// This is what Start Session gates on: the player's latest check-in, but only
// if it hasn't already been consumed by an earlier session today.
export async function fetchAvailablePreparationRecord(playerId: string): Promise<PreparationRecordRow | null> {
  const latest = await fetchLatestPreparationRecord(playerId);
  if (!latest) return null;

  const { data: linkedSession, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('preparation_id', latest.id)
    .maybeSingle();
  if (error) throw error;

  return linkedSession ? null : latest;
}
