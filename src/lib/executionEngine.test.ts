import { describe, it, expect } from 'vitest';
import { scoreDimension, scoreAllDimensions, computeExecutionMedal, OccurrenceForScoring, DimensionResult } from './executionEngine';

function occurrence(overrides: Partial<OccurrenceForScoring> = {}): OccurrenceForScoring {
  return {
    execution_action_id: 'action-1',
    dimension: 'DISCIPLINE_PROCESS',
    base_severity: 'MINOR',
    is_hard_gate: false,
    post_event_escalation_stage: 0,
    ...overrides,
  };
}

describe('scoreDimension', () => {
  it('scores STRONG when there are no occurrences', () => {
    const result = scoreDimension('DISCIPLINE_PROCESS', []);
    expect(result).toEqual({ dimension: 'DISCIPLINE_PROCESS', score: 0, hardGate: false, rating: 'STRONG' });
  });

  it('always returns CRITICAL with score 0 when any occurrence is a hard gate, regardless of other occurrences', () => {
    const occurrences = [occurrence({ base_severity: 'MINOR' }), occurrence({ base_severity: 'CRITICAL', is_hard_gate: true })];
    const result = scoreDimension('DISCIPLINE_PROCESS', occurrences);
    expect(result).toEqual({ dimension: 'DISCIPLINE_PROCESS', score: 0, hardGate: true, rating: 'CRITICAL' });
  });

  it('sums MINOR/MAJOR/CRITICAL base points across occurrences', () => {
    const occurrences = [occurrence({ base_severity: 'MINOR' }), occurrence({ base_severity: 'MAJOR' })];
    // base MINOR = 1, base MAJOR = 4 -> total 5
    expect(scoreDimension('DISCIPLINE_PROCESS', occurrences).score).toBe(5);
  });

  it('adds a 2-point bonus per escalation stage on top of the base severity points', () => {
    const result = scoreDimension('DISCIPLINE_PROCESS', [occurrence({ base_severity: 'MINOR', post_event_escalation_stage: 3 })]);
    // base MINOR = 1, bonus = 2*3 = 6 -> total 7
    expect(result.score).toBe(7);
  });

  it.each([
    [0, 'STRONG'],
    [1, 'ACCEPTABLE'],
    [4, 'ACCEPTABLE'],
    [5, 'WEAK'],
    [9, 'WEAK'],
    [10, 'CRITICAL'],
    [20, 'CRITICAL'],
  ] as const)('classifies a total score of %i as %s', (score, expectedRating) => {
    // Each MINOR occurrence contributes exactly 1 point (base 1, stage-0
    // bonus 0), so `score` of them sums to `score` — a simple, realistic
    // way to hit an exact target score without fractional escalation stages.
    const occurrences = Array.from({ length: score }, () => occurrence({ base_severity: 'MINOR' }));
    const result = scoreDimension('DISCIPLINE_PROCESS', occurrences);
    expect(result.score).toBe(score);
    expect(result.rating).toBe(expectedRating);
  });
});

describe('scoreAllDimensions', () => {
  it('scores each of the 4 execution dimensions independently', () => {
    const occurrences = [
      occurrence({ dimension: 'DISCIPLINE_PROCESS', base_severity: 'CRITICAL' }),
      occurrence({ dimension: 'TECHNICAL_PLAY', base_severity: 'MINOR' }),
    ];
    const results = scoreAllDimensions(occurrences);
    expect(results.map((r) => r.dimension)).toEqual(['DISCIPLINE_PROCESS', 'TECHNICAL_PLAY', 'MENTAL_GAME', 'LEARNING_IMPROVEMENT']);
    expect(results.find((r) => r.dimension === 'DISCIPLINE_PROCESS')?.rating).toBe('CRITICAL'); // CRITICAL severity = 10pts
    expect(results.find((r) => r.dimension === 'TECHNICAL_PLAY')?.rating).toBe('ACCEPTABLE'); // MINOR severity = 1pt
    expect(results.find((r) => r.dimension === 'MENTAL_GAME')?.rating).toBe('STRONG'); // no occurrences
    expect(results.find((r) => r.dimension === 'LEARNING_IMPROVEMENT')?.rating).toBe('STRONG'); // no occurrences
  });

  it('excludes occurrences carrying a non-execution dimension (PREPARATION/OUTCOMES) rather than scoring them', () => {
    // PREPARATION is a valid dimension_type in the DB enum but is explicitly
    // out of scope for the Execution Profile (§10/§11) — a mis-tagged
    // occurrence must be dropped, not silently included in scoring.
    const occurrences = [occurrence({ dimension: 'PREPARATION' as any, base_severity: 'CRITICAL' })];
    const results = scoreAllDimensions(occurrences);
    for (const r of results) {
      expect(r.score).toBe(0);
      expect(r.rating).toBe('STRONG');
    }
  });
});

describe('computeExecutionMedal', () => {
  function results(overrides: Partial<Record<DimensionResult['dimension'], DimensionResult['rating']>>): DimensionResult[] {
    const dims: DimensionResult['dimension'][] = ['DISCIPLINE_PROCESS', 'TECHNICAL_PLAY', 'MENTAL_GAME', 'LEARNING_IMPROVEMENT'];
    return dims.map((dimension) => ({ dimension, score: 0, hardGate: false, rating: overrides[dimension] ?? 'STRONG' }));
  }

  it('is NONE whenever any dimension hard-gates, even if every other dimension is STRONG', () => {
    const r = results({});
    r[0] = { ...r[0], hardGate: true, rating: 'CRITICAL' };
    expect(computeExecutionMedal(r)).toBe('NONE');
  });

  it('is NONE whenever any dimension is CRITICAL', () => {
    expect(computeExecutionMedal(results({ MENTAL_GAME: 'CRITICAL' }))).toBe('NONE');
  });

  it('is GOLD when every dimension is STRONG or ACCEPTABLE with at least 3 STRONG', () => {
    expect(computeExecutionMedal(results({ LEARNING_IMPROVEMENT: 'ACCEPTABLE' }))).toBe('GOLD');
  });

  it('is not GOLD when fewer than 3 dimensions are STRONG, even if all are STRONG/ACCEPTABLE', () => {
    expect(
      computeExecutionMedal(results({ TECHNICAL_PLAY: 'ACCEPTABLE', MENTAL_GAME: 'ACCEPTABLE', LEARNING_IMPROVEMENT: 'ACCEPTABLE' })),
    ).toBe('SILVER');
  });

  it('is SILVER when at least 3 dimensions are STRONG/ACCEPTABLE and at most 1 is WEAK', () => {
    expect(computeExecutionMedal(results({ LEARNING_IMPROVEMENT: 'WEAK' }))).toBe('SILVER');
  });

  it('is BRONZE when up to 2 dimensions are WEAK', () => {
    expect(computeExecutionMedal(results({ MENTAL_GAME: 'WEAK', LEARNING_IMPROVEMENT: 'WEAK' }))).toBe('BRONZE');
  });

  it('is NONE when 3 or more dimensions are WEAK', () => {
    expect(
      computeExecutionMedal(results({ TECHNICAL_PLAY: 'WEAK', MENTAL_GAME: 'WEAK', LEARNING_IMPROVEMENT: 'WEAK' })),
    ).toBe('NONE');
  });
});
