// src/lib/preparationEngine.ts — PRD §7 "Preparation Engine"
//
// Pure, deterministic Preparation Medal scoring. Sleep and Meditation are the
// two primary readiness signals; Physical Readiness / Mental Priming /
// Impulse Control are "supporting components" that only matter once both
// primary signals already clear their threshold (Gold vs Silver split).
//
// TBD/ASSUMPTION: the schema already models a coach-configurable rule engine
// for this (preparation_rule_sets/versions/rules — signal_type/operator/
// threshold_value/medal_impact rows), mirroring brm_config_versions/brm_levels.
// But nothing in this codebase seeds or edits those rows yet (no coach-side
// rules UI exists), so — exactly like brmRules.ts's documented stance on BRM
// slot rules — this module hardcodes the PRD's documented defaults directly.
// A future coach-configurable rules UI should replace this module's internals
// without changing its signature, the same way brmRules.ts is written to be
// swapped out later.

import { Database } from '../types/database';

export type PreparationMedal = Database['public']['Enums']['medal_type'];
export type PhysicalReadiness = 'NONE' | 'LIGHT' | 'FULL';

const SLEEP_HOURS_TARGET = 7;
const MEDITATION_MINUTES_TARGET = 20;
const GOLD_MIN_SUPPORTING_COMPONENTS = 2;

export interface SupportingComponentsInput {
  physicalReadiness: PhysicalReadiness | null;
  mentalPriming: boolean | null;
  impulseControlSmoking: boolean | null;
  impulseControlPmo: boolean | null;
  impulseControlRecovery: boolean | null;
}

// Three independently-completable supporting components, read directly off
// the PRD's "Default core preparation inputs" bullet list:
//   1. Physical Readiness engaged (Light or Full, not None)
//   2. Mental Priming completed (Purpose Review done)
//   3. Impulse Control clean (no smoking, no PMO, adequate rest/recovery)
// The PRD doesn't give an exact counting formula for "supporting components,"
// so grouping Impulse Control's 3 sub-checks into one component (rather than
// counting each separately) keeps "at least 2 of 3" meaningful instead of
// trivially easy to hit.
export function countSupportingComponents(input: SupportingComponentsInput): number {
  let count = 0;
  if (input.physicalReadiness === 'LIGHT' || input.physicalReadiness === 'FULL') count++;
  if (input.mentalPriming === true) count++;
  if (input.impulseControlSmoking === false && input.impulseControlPmo === false && input.impulseControlRecovery === true) {
    count++;
  }
  return count;
}

export interface PreparationMedalInput {
  sleepHours: number | null;
  meditationMinutes: number | null;
  supportingComponentsCompleted: number;
}

// PRD §7 "Default Preparation Medal":
//   Gold:     Sleep >=7h AND Meditation >=20min AND >=2 supporting components
//   Silver:   Sleep >=7h AND Meditation >=20min AND <2 supporting components
//   Bronze:   Exactly one of Sleep or Meditation below target
//   No Medal: Both Sleep and Meditation below target
export function computePreparationMedal(input: PreparationMedalInput): PreparationMedal {
  const sleepMet = input.sleepHours !== null && input.sleepHours >= SLEEP_HOURS_TARGET;
  const meditationMet = input.meditationMinutes !== null && input.meditationMinutes >= MEDITATION_MINUTES_TARGET;

  if (sleepMet && meditationMet) {
    return input.supportingComponentsCompleted >= GOLD_MIN_SUPPORTING_COMPONENTS ? 'GOLD' : 'SILVER';
  }
  if (sleepMet !== meditationMet) return 'BRONZE';
  return 'NONE';
}
