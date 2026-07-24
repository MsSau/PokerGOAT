// src/lib/behavioralProfileEngine.ts — PRD §9 "Behavioral Profile"
//
// Pure, deterministic computation of the six-dimension Behavioral Profile
// (state, trend-as-state, confidence, Evidence-Based Dimension Index) from
// evidence points already collected elsewhere (Execution dimension ratings,
// Preparation Medals, Outcome Medals). No AI, no invented numbers — every
// field here traces back to a real logged event.
//
// SCOPE (intentionally simplified for this pass, per CLAUDE.md's "deterministic
// engines vs AI" split): computes on-the-fly from live data, never persisted.
// The full PRD spec additionally calls for immutable Weekly/Framework-End
// snapshots and repetition/contextual/sequence/contradiction pattern
// detection — neither is implemented here; this module only produces the
// per-dimension state/trend/confidence/radar index used by the six-axis
// radar (§2.12).

import { Database } from '../types/database';

export type Dimension = Database['public']['Enums']['dimension_type'];

// Fixed order per §2.12 — "always the same clock position per axis."
export const BEHAVIORAL_PROFILE_DIMENSIONS: Dimension[] = [
  'PREPARATION',
  'DISCIPLINE_PROCESS',
  'TECHNICAL_PLAY',
  'MENTAL_GAME',
  'LEARNING_IMPROVEMENT',
  'OUTCOMES',
];

// Single shared source for human-readable dimension names — used by the
// Behavioral Profile UI and by endSession.ts's Verdict evidence text, so
// both never drift out of sync with each other.
export const DIMENSION_LABELS: Record<Dimension, string> = {
  PREPARATION: 'Preparation',
  DISCIPLINE_PROCESS: 'Discipline / Process',
  TECHNICAL_PLAY: 'Technical Play',
  MENTAL_GAME: 'Mental Game',
  LEARNING_IMPROVEMENT: 'Learning / Improvement',
  OUTCOMES: 'Results / Outcomes',
};

export type DimensionState =
  | 'IMPROVING'
  | 'STABLE'
  | 'DETERIORATING'
  | 'INSUFFICIENT_RECENT_DATA'
  | 'NOT_CURRENTLY_OBSERVABLE';

export type EvidenceWindow = 'RECENT' | 'SHORT_TERM' | 'LONG_TERM';

export interface EvidencePoint {
  occurredAt: string; // ISO timestamp
  score: number; // 0-3, higher = better (see scoreForRating/scoreForMedal)
  label: string; // the raw rating/medal this evidence point came from
}

export interface DimensionEvidenceHighlight {
  label: string;
  occurredAt: string;
}

export interface DimensionProfile {
  dimension: Dimension;
  state: DimensionState;
  confidence: number; // 0-1
  radarIndex: number | null; // 0-100, null only when there's zero evidence ever
  evidenceCount: number; // evidence points in the window actually used
  evidenceWindow: EvidenceWindow;
  strongestPositiveSignal: DimensionEvidenceHighlight | null;
  biggestConcern: DimensionEvidenceHighlight | null;
  recurringPatterns: string[]; // §9 "repetition patterns" — see detectRecurringPatterns
}

// §9 "Evidence windows: Recent = last poker week. Short-term = last calendar
// month." Quarter/Long-term aren't distinguished here — this module falls
// back only as far as Short-term before treating history as "long-term, but
// too sparse recently to call a trend."
const RECENT_WINDOW_DAYS = 7;
const SHORT_TERM_WINDOW_DAYS = 30;

// Need at least 2 evidence points to say anything about direction — a single
// data point is a level, not yet a trend.
const MIN_EVIDENCE_FOR_TREND = 2;

// Confidence reaches 1.0 once the window has this many evidence points.
// TBD/ASSUMPTION: the PRD doesn't specify this constant; matches this repo's
// existing pattern (e.g. brmRules.ts, executionEngine.ts) of hardcoding a
// documented default until a coach-configurable version exists.
const FULL_CONFIDENCE_EVIDENCE_COUNT = 5;

// Minimum swing in the 0-3 average between the window's first and second
// half before calling it Improving/Deteriorating rather than Stable.
const TREND_DELTA_THRESHOLD = 0.4;

// A run of the same label needs at least this many consecutive occurrences
// (in chronological order, within the window actually used) before it's
// called a recurring pattern rather than coincidence.
const MIN_RUN_FOR_PATTERN = 3;

export function scoreForRating(rating: string): number {
  switch (rating) {
    case 'STRONG': return 3;
    case 'ACCEPTABLE': return 2;
    case 'WEAK': return 1;
    case 'CRITICAL': return 0;
    default: return 0;
  }
}

export function scoreForMedal(medal: string): number {
  switch (medal) {
    case 'GOLD': return 3;
    case 'SILVER': return 2;
    case 'BRONZE': return 1;
    case 'NONE': return 0;
    default: return 0;
  }
}

function average(points: EvidencePoint[]): number {
  return points.reduce((sum, p) => sum + p.score, 0) / points.length;
}

function extreme(points: EvidencePoint[], mode: 'max' | 'min'): DimensionEvidenceHighlight | null {
  if (points.length === 0) return null;
  const targetScore = mode === 'max' ? Math.max(...points.map((p) => p.score)) : Math.min(...points.map((p) => p.score));
  // Nothing positive to highlight (max is the floor score) / nothing
  // concerning to flag (min is the ceiling score).
  if (mode === 'max' && targetScore === 0) return null;
  if (mode === 'min' && targetScore === 3) return null;

  const matches = points.filter((p) => p.score === targetScore);
  const mostRecent = matches.reduce((a, b) => (new Date(a.occurredAt) > new Date(b.occurredAt) ? a : b));
  return { label: mostRecent.label, occurredAt: mostRecent.occurredAt };
}

// §9 "Detect: repetition patterns" — the only one of the four pattern types
// (repetition/contextual/sequence/contradiction) derivable purely from a
// single dimension's own evidence stream; the other three need cross-
// dimension or cross-session context this module doesn't have. Two shapes:
// the longest consecutive same-label run, and a window that's uniformly
// negative or uniformly positive. `points` must already be chronologically
// sorted (ascending) — the same windowEvidence computeDimensionProfile uses
// for everything else, so a pattern description always matches what the
// rest of the profile is reporting.
function detectRecurringPatterns(points: EvidencePoint[]): string[] {
  if (points.length < MIN_RUN_FOR_PATTERN) return [];
  const patterns: string[] = [];

  let runLabel = points[0].label;
  let runLength = 1;
  let bestLabel = runLabel;
  let bestLength = 1;
  for (let i = 1; i < points.length; i++) {
    if (points[i].label === runLabel) {
      runLength++;
    } else {
      runLabel = points[i].label;
      runLength = 1;
    }
    if (runLength > bestLength) {
      bestLength = runLength;
      bestLabel = runLabel;
    }
  }
  if (bestLength >= MIN_RUN_FOR_PATTERN) {
    patterns.push(`${bestLabel} rated ${bestLength} times in a row`);
  }

  if (points.every((p) => p.score <= 1)) {
    patterns.push(`Every evidence point in this window rated Weak or Critical (${points.length} of ${points.length})`);
  } else if (points.every((p) => p.score >= 2)) {
    patterns.push(`Every evidence point in this window rated Acceptable or Strong (${points.length} of ${points.length})`);
  }

  return patterns;
}

export function computeDimensionProfile(
  dimension: Dimension,
  allEvidence: EvidencePoint[],
  now: Date = new Date(),
  forcedWindow?: EvidenceWindow,
): DimensionProfile {
  const sorted = [...allEvidence].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  if (sorted.length === 0) {
    return {
      dimension,
      state: 'NOT_CURRENTLY_OBSERVABLE',
      confidence: 0,
      radarIndex: null,
      evidenceCount: 0,
      evidenceWindow: 'LONG_TERM',
      strongestPositiveSignal: null,
      biggestConcern: null,
      recurringPatterns: [],
    };
  }

  const recentCutoff = now.getTime() - RECENT_WINDOW_DAYS * 86400000;
  const shortTermCutoff = now.getTime() - SHORT_TERM_WINDOW_DAYS * 86400000;
  const recent = sorted.filter((e) => new Date(e.occurredAt).getTime() >= recentCutoff);
  const shortTerm = sorted.filter((e) => new Date(e.occurredAt).getTime() >= shortTermCutoff);

  // A caller (e.g. a coach picking an explicit evidence window in the UI)
  // can pin the window directly instead of the auto-cascade below — still
  // per-dimension evidence, just no longer "widen only if the tighter
  // window is too thin."
  let window: EvidenceWindow;
  let windowEvidence: EvidencePoint[];
  if (forcedWindow) {
    window = forcedWindow;
    windowEvidence = forcedWindow === 'RECENT' ? recent : forcedWindow === 'SHORT_TERM' ? shortTerm : sorted;
  } else if (recent.length >= MIN_EVIDENCE_FOR_TREND) {
    window = 'RECENT';
    windowEvidence = recent;
  } else if (shortTerm.length >= MIN_EVIDENCE_FOR_TREND) {
    window = 'SHORT_TERM';
    windowEvidence = shortTerm;
  } else {
    window = 'LONG_TERM';
    windowEvidence = sorted;
  }

  const confidence = Math.min(1, windowEvidence.length / FULL_CONFIDENCE_EVIDENCE_COUNT);
  const radarIndex = windowEvidence.length > 0 ? Math.round((average(windowEvidence) / 3) * 100) : null;
  const strongestPositiveSignal = extreme(windowEvidence, 'max');
  const biggestConcern = extreme(windowEvidence, 'min');
  const recurringPatterns = detectRecurringPatterns(windowEvidence);

  if (windowEvidence.length < MIN_EVIDENCE_FOR_TREND) {
    return {
      dimension,
      state: windowEvidence.length === 0 ? 'NOT_CURRENTLY_OBSERVABLE' : 'INSUFFICIENT_RECENT_DATA',
      confidence,
      radarIndex,
      evidenceCount: windowEvidence.length,
      evidenceWindow: window,
      strongestPositiveSignal,
      biggestConcern,
      recurringPatterns,
    };
  }

  const mid = Math.floor(windowEvidence.length / 2);
  const firstHalf = windowEvidence.slice(0, mid);
  const secondHalf = windowEvidence.slice(mid);
  const delta = average(secondHalf) - average(firstHalf);

  const state: DimensionState =
    delta > TREND_DELTA_THRESHOLD ? 'IMPROVING' : delta < -TREND_DELTA_THRESHOLD ? 'DETERIORATING' : 'STABLE';

  return {
    dimension,
    state,
    confidence,
    radarIndex,
    evidenceCount: windowEvidence.length,
    evidenceWindow: window,
    strongestPositiveSignal,
    biggestConcern,
    recurringPatterns,
  };
}

export function computeBehavioralProfile(
  evidenceByDimension: Partial<Record<Dimension, EvidencePoint[]>>,
  now: Date = new Date(),
  forcedWindow?: EvidenceWindow,
): DimensionProfile[] {
  return BEHAVIORAL_PROFILE_DIMENSIONS.map((dim) => computeDimensionProfile(dim, evidenceByDimension[dim] ?? [], now, forcedWindow));
}

// §9 "Behavioral categories are dynamic coaching states, not permanent
// personality labels ... can change every day if evidence says so." Derived
// entirely from the six DimensionProfiles already computed above — no new
// evidence source, no invented signal. A player may have one Primary and
// one Secondary state; if no rule clears its evidence bar, both are null
// rather than forcing a guess ("never claim more than the evidence
// supports").
//
// TBD/ASSUMPTION (not specified by the PRD, same posture as this file's
// other hardcoded defaults): the 50/67 radarIndex cut points, the 0.4
// minimum confidence a dimension needs before it's allowed to feed a
// category rule, and the specific dimension combinations per category below
// are this module's own deterministic approximation of the PRD's seven
// example archetypes, not a spec the PRD writes out numerically.
export type BehavioralCategory =
  | 'TILT_CHASER'
  | 'LUCKY_RULE_BREAKER'
  | 'GREED_LEAKER'
  | 'KNOWLEDGE_EXECUTION_GAP'
  | 'IMPROVING_PROFESSIONAL'
  | 'DISCIPLINED_GRINDER'
  | 'STAGNANT_GRINDER';

export const BEHAVIORAL_CATEGORY_LABELS: Record<BehavioralCategory, string> = {
  TILT_CHASER: 'Tilt Chaser',
  LUCKY_RULE_BREAKER: 'Lucky Rule-Breaker',
  GREED_LEAKER: 'Greed Leaker',
  KNOWLEDGE_EXECUTION_GAP: 'Knowledge–Execution Gap',
  IMPROVING_PROFESSIONAL: 'Improving Professional',
  DISCIPLINED_GRINDER: 'Disciplined Grinder',
  STAGNANT_GRINDER: 'Stagnant Grinder',
};

export interface BehavioralCategoryResult {
  primary: BehavioralCategory | null;
  secondary: BehavioralCategory | null;
}

const CATEGORY_STRONG_THRESHOLD = 67; // radarIndex floor for "consistently Acceptable-or-better"
const CATEGORY_WEAK_THRESHOLD = 50; // radarIndex ceiling for "worse than solidly Acceptable"
const MIN_CONFIDENCE_FOR_CATEGORY = 0.4; // same floor as a 2-point RECENT window elsewhere in this file

// p can be undefined here: callers may pass a partial/empty profile list
// (e.g. the UI's very first render, before any data has loaded) — every
// CATEGORY_RULES branch below short-circuits on reliable(p.SOME_DIMENSION)
// before touching that dimension's fields, so this guard is what keeps a
// missing dimension from throwing instead of just failing to match.
function reliable(p: DimensionProfile | undefined): p is DimensionProfile {
  return !!p && p.radarIndex !== null && p.confidence >= MIN_CONFIDENCE_FOR_CATEGORY;
}

type ProfileByDimension = Partial<Record<Dimension, DimensionProfile>>;

// Evaluated in priority order — Principle 3/4 ("good results must never
// excuse poor discipline") puts the process/outcome and process/mental
// contradictions ahead of the purely positive or purely neutral labels, so
// a hot outcome streak riding on broken process is flagged as Primary
// before "Improving Professional" or "Disciplined Grinder" ever get a look.
const CATEGORY_RULES: { category: BehavioralCategory; matches: (p: ProfileByDimension) => boolean }[] = [
  {
    category: 'TILT_CHASER',
    matches: (p) =>
      reliable(p.MENTAL_GAME) &&
      p.MENTAL_GAME.state === 'DETERIORATING' &&
      reliable(p.DISCIPLINE_PROCESS) &&
      (p.DISCIPLINE_PROCESS.state === 'DETERIORATING' || p.DISCIPLINE_PROCESS.radarIndex! < CATEGORY_WEAK_THRESHOLD),
  },
  {
    category: 'LUCKY_RULE_BREAKER',
    matches: (p) =>
      reliable(p.DISCIPLINE_PROCESS) &&
      p.DISCIPLINE_PROCESS.radarIndex! < CATEGORY_WEAK_THRESHOLD &&
      reliable(p.OUTCOMES) &&
      p.OUTCOMES.radarIndex! >= CATEGORY_STRONG_THRESHOLD,
  },
  {
    category: 'GREED_LEAKER',
    matches: (p) =>
      reliable(p.OUTCOMES) &&
      p.OUTCOMES.state === 'DETERIORATING' &&
      reliable(p.MENTAL_GAME) &&
      p.MENTAL_GAME.radarIndex! < CATEGORY_WEAK_THRESHOLD &&
      reliable(p.DISCIPLINE_PROCESS) &&
      p.DISCIPLINE_PROCESS.state !== 'IMPROVING',
  },
  {
    category: 'KNOWLEDGE_EXECUTION_GAP',
    matches: (p) =>
      reliable(p.TECHNICAL_PLAY) &&
      p.TECHNICAL_PLAY.radarIndex! >= CATEGORY_STRONG_THRESHOLD &&
      reliable(p.DISCIPLINE_PROCESS) &&
      p.DISCIPLINE_PROCESS.radarIndex! < CATEGORY_WEAK_THRESHOLD,
  },
  {
    category: 'IMPROVING_PROFESSIONAL',
    matches: (p) => {
      const reliableProfiles = Object.values(p).filter(reliable);
      const improving = reliableProfiles.filter((d) => d.state === 'IMPROVING').length;
      const deteriorating = reliableProfiles.filter((d) => d.state === 'DETERIORATING').length;
      return improving >= 3 && deteriorating === 0;
    },
  },
  {
    category: 'DISCIPLINED_GRINDER',
    matches: (p) =>
      reliable(p.DISCIPLINE_PROCESS) &&
      p.DISCIPLINE_PROCESS.radarIndex! >= CATEGORY_STRONG_THRESHOLD &&
      p.DISCIPLINE_PROCESS.state !== 'DETERIORATING',
  },
  {
    category: 'STAGNANT_GRINDER',
    matches: (p) => {
      const reliableProfiles = Object.values(p).filter(reliable);
      return reliableProfiles.length >= 3 && reliableProfiles.every((d) => d.state === 'STABLE');
    },
  },
];

export function computeBehavioralCategory(profiles: DimensionProfile[]): BehavioralCategoryResult {
  const byDim = Object.fromEntries(profiles.map((p) => [p.dimension, p])) as ProfileByDimension;
  const matched = CATEGORY_RULES.filter((r) => r.matches(byDim)).map((r) => r.category);
  return { primary: matched[0] ?? null, secondary: matched[1] ?? null };
}
