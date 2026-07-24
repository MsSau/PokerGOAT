import { Database } from '../types/database';

// Matches the full dimension_type enum (6 labels) since execution_actions.dimension
// and behavioral_dimension_assessments.dimension share this Postgres type.
export type Dimension = Database['public']['Enums']['dimension_type'];

// The Execution Profile (§10/§11) scores exactly these 4. PREPARATION and
// OUTCOMES are scored elsewhere — Preparation Medal (§7) and Outcome Medal
// (§8) respectively — and must never enter this calculation, or a losing
// session's P&L or a bad night's sleep would silently drag down Execution
// ratings, violating Principle 3 (process ≠ outcome).
export const EXECUTION_DIMENSIONS: Dimension[] = [
  'DISCIPLINE_PROCESS',
  'TECHNICAL_PLAY',
  'MENTAL_GAME',
  'LEARNING_IMPROVEMENT',
];
export type Rating = 'STRONG' | 'ACCEPTABLE' | 'WEAK' | 'CRITICAL';
export type Medal = Database['public']['Enums']['medal_type'];
const BASE_POINTS: Record<string, number> = { MINOR: 1, MAJOR: 4, CRITICAL: 10 };

export interface OccurrenceForScoring {
  execution_action_id: string;
  dimension: Dimension;
  base_severity: Database['public']['Enums']['severity_type'];
  is_hard_gate: boolean;
  post_event_escalation_stage: number;
}

export interface DimensionResult {
  dimension: Dimension;
  score: number;
  hardGate: boolean;
  rating: Rating;
}

export function scoreDimension(dimension: Dimension, occurrences: OccurrenceForScoring[]): DimensionResult {
  const hardGate = occurrences.some((o) => o.is_hard_gate);
  if (hardGate) return { dimension, score: 0, hardGate: true, rating: 'CRITICAL' };

  const score = occurrences.reduce((sum, o) => {
    const base = BASE_POINTS[o.base_severity] ?? 0;
    const bonus = 2 * o.post_event_escalation_stage;
    return sum + base + bonus;
  }, 0);

  let rating: Rating;
  if (score >= 10) rating = 'CRITICAL';
  else if (score >= 5) rating = 'WEAK';
  else if (score >= 1) rating = 'ACCEPTABLE';
  else rating = 'STRONG';

  return { dimension, score, hardGate: false, rating };
}

// Guards against a coach mis-tagging an Execution Action with a
// Behavioral-Profile-only dimension (§10 governance: taxonomy is
// coach-configured, so this can happen through human error, not just
// application logic). Filters them out before scoring rather than
// silently scoring garbage or throwing mid-session.
export function scoreAllDimensions(
  all: OccurrenceForScoring[],
  dims: Dimension[] = EXECUTION_DIMENSIONS,
): DimensionResult[] {
  const invalid = all.filter((o) => !EXECUTION_DIMENSIONS.includes(o.dimension));
  if (invalid.length > 0) {
    console.warn(
      `${invalid.length} Execution Action occurrence(s) carry a non-execution dimension ` +
      `(PREPARATION/OUTCOMES) — excluded from Execution Profile scoring. Check taxonomy config.`,
      invalid.map((o) => o.execution_action_id),
    );
  }
  return dims.map((dim) => scoreDimension(dim, all.filter((o) => o.dimension === dim)));
}

export function computeExecutionMedal(results: DimensionResult[]): Medal {
  const anyHardGate = results.some((r) => r.hardGate);
  const anyCritical = results.some((r) => r.rating === 'CRITICAL');
  if (anyHardGate || anyCritical) return 'NONE';

  const strongCount = results.filter((r) => r.rating === 'STRONG').length;
  const weakCount = results.filter((r) => r.rating === 'WEAK').length;
  const strongOrAcceptable = results.filter((r) => r.rating === 'STRONG' || r.rating === 'ACCEPTABLE').length;

  if (strongOrAcceptable === results.length && strongCount >= 3) return 'GOLD';
  if (strongOrAcceptable >= 3 && weakCount <= 1) return 'SILVER';
  if (weakCount <= 2) return 'BRONZE';
  return 'NONE';
}