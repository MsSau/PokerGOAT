import { describe, it, expect } from 'vitest';
import {
  computeDimensionProfile,
  computeBehavioralProfile,
  computeBehavioralCategory,
  scoreForRating,
  scoreForMedal,
  BEHAVIORAL_PROFILE_DIMENSIONS,
  EvidencePoint,
  DimensionProfile,
} from './behavioralProfileEngine';

const NOW = new Date('2026-07-17T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe('scoreForRating / scoreForMedal', () => {
  it('maps every label to the expected 0-3 score', () => {
    expect(scoreForRating('STRONG')).toBe(3);
    expect(scoreForRating('ACCEPTABLE')).toBe(2);
    expect(scoreForRating('WEAK')).toBe(1);
    expect(scoreForRating('CRITICAL')).toBe(0);
    expect(scoreForMedal('GOLD')).toBe(3);
    expect(scoreForMedal('SILVER')).toBe(2);
    expect(scoreForMedal('BRONZE')).toBe(1);
    expect(scoreForMedal('NONE')).toBe(0);
  });
});

describe('computeDimensionProfile', () => {
  it('returns NOT_CURRENTLY_OBSERVABLE with no evidence at all', () => {
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', [], NOW);
    expect(result.state).toBe('NOT_CURRENTLY_OBSERVABLE');
    expect(result.confidence).toBe(0);
    expect(result.radarIndex).toBeNull();
    expect(result.strongestPositiveSignal).toBeNull();
    expect(result.biggestConcern).toBeNull();
  });

  it('returns INSUFFICIENT_RECENT_DATA with a single evidence point', () => {
    const evidence: EvidencePoint[] = [{ occurredAt: daysAgo(1), score: 3, label: 'STRONG' }];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.state).toBe('INSUFFICIENT_RECENT_DATA');
    expect(result.evidenceCount).toBe(1);
    expect(result.radarIndex).toBe(100);
  });

  it('falls back to SHORT_TERM window when RECENT has under 2 points', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(20), score: 2, label: 'ACCEPTABLE' },
      { occurredAt: daysAgo(25), score: 2, label: 'ACCEPTABLE' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.evidenceWindow).toBe('SHORT_TERM');
    expect(result.evidenceCount).toBe(3);
  });

  it('classifies IMPROVING when the second half of the window scores materially higher', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(6), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(5), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(2), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.evidenceWindow).toBe('RECENT');
    expect(result.state).toBe('IMPROVING');
  });

  it('classifies DETERIORATING when the second half scores materially lower', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(6), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(5), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(2), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(1), score: 0, label: 'CRITICAL' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.state).toBe('DETERIORATING');
  });

  it('classifies STABLE when the window score barely moves', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(6), score: 2, label: 'ACCEPTABLE' },
      { occurredAt: daysAgo(5), score: 2, label: 'ACCEPTABLE' },
      { occurredAt: daysAgo(2), score: 2, label: 'ACCEPTABLE' },
      { occurredAt: daysAgo(1), score: 2, label: 'ACCEPTABLE' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.state).toBe('STABLE');
  });

  it('never flags a concern when every point in the window is already the max score', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(3), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.biggestConcern).toBeNull();
    expect(result.strongestPositiveSignal).toEqual({ label: 'STRONG', occurredAt: daysAgo(1) });
  });

  it('never surfaces a positive signal when every point in the window is the floor score', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(3), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(1), score: 0, label: 'CRITICAL' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW);
    expect(result.strongestPositiveSignal).toBeNull();
    expect(result.biggestConcern).toEqual({ label: 'CRITICAL', occurredAt: daysAgo(1) });
  });

  it('scales confidence with evidence count up to the full-confidence cap', () => {
    const two: EvidencePoint[] = [daysAgo(2), daysAgo(1)].map((d) => ({ occurredAt: d, score: 2, label: 'ACCEPTABLE' }));
    const five: EvidencePoint[] = [daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)].map((d) => ({
      occurredAt: d,
      score: 2,
      label: 'ACCEPTABLE',
    }));
    const ten: EvidencePoint[] = Array.from({ length: 10 }, (_, i) => ({
      occurredAt: daysAgo(i + 1),
      score: 2,
      label: 'ACCEPTABLE',
    }));
    expect(computeDimensionProfile('DISCIPLINE_PROCESS', two, NOW).confidence).toBeCloseTo(0.4);
    expect(computeDimensionProfile('DISCIPLINE_PROCESS', five, NOW).confidence).toBe(1);
    expect(computeDimensionProfile('DISCIPLINE_PROCESS', ten, NOW).confidence).toBe(1);
  });
});

describe('computeBehavioralProfile', () => {
  it('returns exactly the six PRD dimensions, in fixed order', () => {
    const result = computeBehavioralProfile({}, NOW);
    expect(result.map((r) => r.dimension)).toEqual(BEHAVIORAL_PROFILE_DIMENSIONS);
    expect(BEHAVIORAL_PROFILE_DIMENSIONS).toEqual([
      'PREPARATION',
      'DISCIPLINE_PROCESS',
      'TECHNICAL_PLAY',
      'MENTAL_GAME',
      'LEARNING_IMPROVEMENT',
      'OUTCOMES',
    ]);
  });

  it('keeps each dimension independent of the others', () => {
    const result = computeBehavioralProfile(
      {
        PREPARATION: [{ occurredAt: daysAgo(1), score: 3, label: 'GOLD' }],
        OUTCOMES: [],
      },
      NOW,
    );
    const prep = result.find((r) => r.dimension === 'PREPARATION')!;
    const outcomes = result.find((r) => r.dimension === 'OUTCOMES')!;
    const technical = result.find((r) => r.dimension === 'TECHNICAL_PLAY')!;
    expect(prep.evidenceCount).toBe(1);
    expect(outcomes.state).toBe('NOT_CURRENTLY_OBSERVABLE');
    expect(technical.state).toBe('NOT_CURRENTLY_OBSERVABLE');
  });
});

describe('computeDimensionProfile with a forced evidence window', () => {
  const evidence: EvidencePoint[] = [
    { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
    { occurredAt: daysAgo(20), score: 1, label: 'WEAK' },
    { occurredAt: daysAgo(25), score: 1, label: 'WEAK' },
  ];

  it('pins the window instead of auto-cascading, even when RECENT alone is too thin', () => {
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW, 'RECENT');
    expect(result.evidenceWindow).toBe('RECENT');
    expect(result.evidenceCount).toBe(1);
    expect(result.state).toBe('INSUFFICIENT_RECENT_DATA');
  });

  it('forces SHORT_TERM even though RECENT alone has enough points to auto-select', () => {
    const recentEnough: EvidencePoint[] = [
      { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(2), score: 3, label: 'STRONG' },
      { occurredAt: daysAgo(25), score: 0, label: 'CRITICAL' },
    ];
    const auto = computeDimensionProfile('DISCIPLINE_PROCESS', recentEnough, NOW);
    expect(auto.evidenceWindow).toBe('RECENT');

    const forced = computeDimensionProfile('DISCIPLINE_PROCESS', recentEnough, NOW, 'SHORT_TERM');
    expect(forced.evidenceWindow).toBe('SHORT_TERM');
    expect(forced.evidenceCount).toBe(3);
  });

  it('forces LONG_TERM to use full history regardless of recency', () => {
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW, 'LONG_TERM');
    expect(result.evidenceWindow).toBe('LONG_TERM');
    expect(result.evidenceCount).toBe(3);
  });

  it('reports NOT_CURRENTLY_OBSERVABLE (not NaN) when the forced window has zero evidence', () => {
    const oldOnly: EvidencePoint[] = [{ occurredAt: daysAgo(25), score: 2, label: 'ACCEPTABLE' }];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', oldOnly, NOW, 'RECENT');
    expect(result.evidenceWindow).toBe('RECENT');
    expect(result.evidenceCount).toBe(0);
    expect(result.state).toBe('NOT_CURRENTLY_OBSERVABLE');
    expect(result.radarIndex).toBeNull();
  });
});

describe('recurring patterns', () => {
  it('flags a consecutive same-label run of 3 or more', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(4), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(3), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(2), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(1), score: 3, label: 'STRONG' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW, 'LONG_TERM');
    expect(result.recurringPatterns).toContain('CRITICAL rated 3 times in a row');
  });

  it('flags a uniformly negative window', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(3), score: 1, label: 'WEAK' },
      { occurredAt: daysAgo(2), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(1), score: 1, label: 'WEAK' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW, 'LONG_TERM');
    expect(result.recurringPatterns.some((p) => p.includes('Weak or Critical'))).toBe(true);
  });

  it('reports no patterns with fewer than 3 evidence points', () => {
    const evidence: EvidencePoint[] = [
      { occurredAt: daysAgo(2), score: 0, label: 'CRITICAL' },
      { occurredAt: daysAgo(1), score: 0, label: 'CRITICAL' },
    ];
    const result = computeDimensionProfile('DISCIPLINE_PROCESS', evidence, NOW, 'LONG_TERM');
    expect(result.recurringPatterns).toEqual([]);
  });
});

describe('computeBehavioralCategory', () => {
  const strong = (dimension: DimensionProfile['dimension'], overrides: Partial<DimensionProfile> = {}): DimensionProfile => ({
    dimension,
    state: 'STABLE',
    confidence: 1,
    radarIndex: 100,
    evidenceCount: 5,
    evidenceWindow: 'RECENT',
    strongestPositiveSignal: null,
    biggestConcern: null,
    recurringPatterns: [],
    ...overrides,
  });

  it('does not throw and returns nulls for an empty profile list (e.g. the UI before data has loaded)', () => {
    expect(() => computeBehavioralCategory([])).not.toThrow();
    expect(computeBehavioralCategory([])).toEqual({ primary: null, secondary: null });
  });

  it('does not throw and returns nulls when only some dimensions are present', () => {
    const partial = [strong('MENTAL_GAME', { state: 'DETERIORATING', radarIndex: 20 })];
    expect(() => computeBehavioralCategory(partial)).not.toThrow();
    expect(computeBehavioralCategory(partial)).toEqual({ primary: null, secondary: null });
  });

  it('returns null primary/secondary when no rule clears its evidence bar', () => {
    const thin = BEHAVIORAL_PROFILE_DIMENSIONS.map((d) => strong(d, { confidence: 0, radarIndex: null }));
    const result = computeBehavioralCategory(thin);
    expect(result.primary).toBeNull();
    expect(result.secondary).toBeNull();
  });

  it('flags Lucky Rule-Breaker for weak process + strong outcomes ahead of a neutral fallback', () => {
    const profiles = BEHAVIORAL_PROFILE_DIMENSIONS.map((d) => strong(d));
    const withOverride = profiles.map((p) =>
      p.dimension === 'DISCIPLINE_PROCESS'
        ? strong(p.dimension, { radarIndex: 20, state: 'STABLE' })
        : p.dimension === 'OUTCOMES'
          ? strong(p.dimension, { radarIndex: 90 })
          : p,
    );
    const result = computeBehavioralCategory(withOverride);
    expect(result.primary).toBe('LUCKY_RULE_BREAKER');
  });

  it('flags Tilt Chaser ahead of Lucky Rule-Breaker when both mental game and discipline are deteriorating', () => {
    const profiles = BEHAVIORAL_PROFILE_DIMENSIONS.map((d) => strong(d));
    const withOverride = profiles.map((p) =>
      p.dimension === 'MENTAL_GAME'
        ? strong(p.dimension, { radarIndex: 20, state: 'DETERIORATING' })
        : p.dimension === 'DISCIPLINE_PROCESS'
          ? strong(p.dimension, { radarIndex: 20, state: 'DETERIORATING' })
          : p.dimension === 'OUTCOMES'
            ? strong(p.dimension, { radarIndex: 90 })
            : p,
    );
    const result = computeBehavioralCategory(withOverride);
    expect(result.primary).toBe('TILT_CHASER');
  });

  it('flags Disciplined Grinder for consistently strong, non-deteriorating process', () => {
    const profiles = BEHAVIORAL_PROFILE_DIMENSIONS.map((d) => strong(d, { radarIndex: 80, state: 'STABLE' }));
    const result = computeBehavioralCategory(profiles);
    expect(result.primary).toBe('DISCIPLINED_GRINDER');
  });

  it('flags Improving Professional when at least three reliable dimensions are improving and none are deteriorating', () => {
    const profiles = BEHAVIORAL_PROFILE_DIMENSIONS.map((d, i) =>
      strong(d, { state: i < 3 ? 'IMPROVING' : 'STABLE', radarIndex: 60 }),
    );
    const result = computeBehavioralCategory(profiles);
    expect(result.primary).toBe('IMPROVING_PROFESSIONAL');
  });

  it('flags Stagnant Grinder when reliable dimensions are all STABLE with no standout', () => {
    const profiles = BEHAVIORAL_PROFILE_DIMENSIONS.map((d) => strong(d, { radarIndex: 55, state: 'STABLE' }));
    const result = computeBehavioralCategory(profiles);
    expect(result.primary).toBe('STAGNANT_GRINDER');
  });
});
