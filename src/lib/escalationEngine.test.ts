import { describe, it, expect } from 'vitest';
import { evaluateEscalationTransition, evaluateDeescalation, pokerDaysElapsed } from './escalationEngine';

function baseParams(overrides: Partial<Parameters<typeof evaluateEscalationTransition>[0]> = {}) {
  return {
    severity: 'MINOR' as const,
    currentStage: 0,
    priorOccurrencesRecent: 0,
    priorMinorAtStage2: false,
    priorMajorEver: false,
    priorCriticalEver: false,
    priorCriticalRecent: false,
    majorRepeatedAfterDirective: false,
    majorRepeatedAfterIntervention: false,
    criticalRepeatedAfterCoaching: false,
    ...overrides,
  };
}

describe('evaluateEscalationTransition — MINOR severity', () => {
  it('moves Baseline -> Stage 1 on the first-ever MINOR occurrence', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(baseParams());
    expect(newStage).toBe(1);
    expect(satisfied).toEqual(['first_minor_at_baseline']);
  });

  it('moves to Stage 2 on a repeat MINOR within the recent window', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ currentStage: 1, priorOccurrencesRecent: 1 }),
    );
    expect(newStage).toBe(2);
    expect(satisfied).toEqual(['repeat_minor_recent_window']);
  });

  it('moves to Stage 3 when a Stage-2 MINOR persists into the short-term window', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ currentStage: 2, priorMinorAtStage2: true }),
    );
    expect(newStage).toBe(3);
    expect(satisfied).toEqual(['minor_persists_into_short_term']);
  });

  it('never regresses stage: an isolated MINOR at a high current stage stays at that stage', () => {
    const { newStage } = evaluateEscalationTransition(baseParams({ currentStage: 5 }));
    expect(newStage).toBe(5);
  });
});

describe('evaluateEscalationTransition — always takes the HIGHEST satisfied stage, never first match', () => {
  it('jumps straight to the highest candidate when several MINOR conditions are satisfied at once', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ currentStage: 0, priorOccurrencesRecent: 1, priorMinorAtStage2: true }),
    );
    // first_minor_at_baseline (1), repeat_minor_recent_window (2), and
    // minor_persists_into_short_term (3) all fire — result must be 3, not 1.
    expect(newStage).toBe(3);
    expect(satisfied).toContain('first_minor_at_baseline');
    expect(satisfied).toContain('repeat_minor_recent_window');
    expect(satisfied).toContain('minor_persists_into_short_term');
  });

  it('jumps to Stage 6 when a MAJOR satisfies every MAJOR condition at once', () => {
    const { newStage } = evaluateEscalationTransition(
      baseParams({
        severity: 'MAJOR',
        currentStage: 3,
        priorMajorEver: false,
        priorOccurrencesRecent: 1,
        majorRepeatedAfterDirective: true,
        majorRepeatedAfterIntervention: true,
      }),
    );
    expect(newStage).toBe(6);
  });
});

describe('evaluateEscalationTransition — MAJOR severity', () => {
  it('moves to Stage 3 on the first-ever MAJOR', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'MAJOR', currentStage: 0, priorMajorEver: false }),
    );
    expect(newStage).toBe(3);
    expect(satisfied).toEqual(['first_ever_major']);
  });

  it('moves to Stage 4 on a repeat MAJOR within the recent window', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'MAJOR', currentStage: 3, priorMajorEver: true, priorOccurrencesRecent: 1 }),
    );
    expect(newStage).toBe(4);
    expect(satisfied).toEqual(['repeat_major_recent_window']);
  });

  it('moves to Stage 5 when a MAJOR repeats after a coach directive', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'MAJOR', currentStage: 4, priorMajorEver: true, majorRepeatedAfterDirective: true }),
    );
    expect(newStage).toBe(5);
    expect(satisfied).toEqual(['major_after_coach_directive']);
  });

  it('moves to Stage 6 when a MAJOR repeats after an intervention', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'MAJOR', currentStage: 5, priorMajorEver: true, majorRepeatedAfterIntervention: true }),
    );
    expect(newStage).toBe(6);
    expect(satisfied).toEqual(['major_after_intervention']);
  });
});

describe('evaluateEscalationTransition — CRITICAL severity', () => {
  it('moves to Stage 5 on the first-ever CRITICAL', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'CRITICAL', currentStage: 0, priorCriticalEver: false }),
    );
    expect(newStage).toBe(5);
    expect(satisfied).toEqual(['first_ever_critical']);
  });

  it('moves to Stage 6 on a repeat CRITICAL within the recent window', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'CRITICAL', currentStage: 5, priorCriticalEver: true, priorCriticalRecent: true }),
    );
    expect(newStage).toBe(6);
    expect(satisfied).toEqual(['repeat_critical_recent_window']);
  });

  it('moves to Stage 7 when a CRITICAL repeats after coaching/intervention', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'CRITICAL', currentStage: 6, priorCriticalEver: true, criticalRepeatedAfterCoaching: true }),
    );
    expect(newStage).toBe(7);
    expect(satisfied).toEqual(['critical_after_coaching_or_intervention']);
  });

  it('moves to Stage 8 for any further CRITICAL once already at/past Stage 7', () => {
    const { newStage, satisfied } = evaluateEscalationTransition(
      baseParams({ severity: 'CRITICAL', currentStage: 7, priorCriticalEver: true }),
    );
    expect(newStage).toBe(8);
    expect(satisfied).toEqual(['further_critical_after_stage3']);
  });
});

describe('evaluateDeescalation', () => {
  const NOW = '2026-07-21T10:00:00.000Z';

  it('does nothing at Baseline, regardless of how long it has been quiet', () => {
    expect(evaluateDeescalation(0, '2026-01-01T00:00:00.000Z', NOW)).toBe(0);
  });

  it('does nothing for an active track with no recorded last occurrence', () => {
    expect(evaluateDeescalation(3, null, NOW)).toBe(3);
  });

  it('steps down by exactly one stage once the compliance window clears (>=4 days quiet)', () => {
    expect(evaluateDeescalation(2, '2026-07-17T10:00:00.000Z', NOW)).toBe(1);
  });

  it('never steps down more than one stage in a single evaluation, no matter how long it has been quiet', () => {
    expect(evaluateDeescalation(5, '2026-01-01T00:00:00.000Z', NOW)).toBe(4);
  });

  it('leaves the stage unchanged while still inside the compliance window', () => {
    expect(evaluateDeescalation(2, '2026-07-19T10:00:00.000Z', NOW)).toBe(2);
  });

  it('crosses into the 4th poker day exactly at the boundary time, not a raw 96-hour duration', () => {
    // Last occurrence at 2026-07-17T10:00 UTC (default boundary 10:00 UTC):
    // the 4th consecutive quiet poker day begins at 2026-07-21T10:00 exactly.
    expect(evaluateDeescalation(2, '2026-07-17T10:00:00.000Z', '2026-07-21T09:59:59.999Z')).toBe(2); // still inside poker-day 3
    expect(evaluateDeescalation(2, '2026-07-17T10:00:00.000Z', '2026-07-21T10:00:00.000Z')).toBe(1); // poker-day 4 has begun
  });

  it('uses the configured poker-day boundary time, not midnight', () => {
    // Same from/to pair, two different boundary times, two different
    // poker-day-crossing counts: with a 10:00 boundary the 23:00 occurrence
    // and the following 01:00 "now" fall only 3 poker days apart (both are
    // on the "wrong side" of 10:00 relative to a naive calendar-day count);
    // with a midnight boundary they're a full 4 calendar days apart.
    const from = '2026-07-17T23:00:00.000Z';
    const to = '2026-07-21T01:00:00.000Z';
    expect(evaluateDeescalation(2, from, to, '10:00:00')).toBe(2);
    expect(evaluateDeescalation(2, from, to, '00:00:00')).toBe(1);
  });
});

describe('pokerDaysElapsed', () => {
  it('counts zero within the same poker day', () => {
    expect(pokerDaysElapsed('2026-07-17T11:00:00.000Z', '2026-07-17T23:00:00.000Z', '10:00:00')).toBe(0);
  });

  it('counts one poker day crossed just after the boundary time', () => {
    expect(pokerDaysElapsed('2026-07-17T09:00:00.000Z', '2026-07-17T10:00:00.000Z', '10:00:00')).toBe(1);
  });

  it('defaults to the schema default boundary time (10:00:00) when none is given', () => {
    expect(pokerDaysElapsed('2026-07-17T09:00:00.000Z', '2026-07-17T10:00:00.000Z')).toBe(1);
  });
});
