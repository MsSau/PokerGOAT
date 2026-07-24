import { describe, it, expect } from 'vitest';
import { classifyVerdict, buildHeadline } from './verdictEngine';

function params(overrides: Partial<Parameters<typeof classifyVerdict>[0]> = {}) {
  return {
    hardGateViolation: false,
    hasCriticalEscalation: false,
    finalPnl: 0,
    executionMedal: 'NONE' as const,
    preparationMedal: 'GOLD' as const, // neutral default — never NONE unless a test overrides it
    ...overrides,
  };
}

describe('classifyVerdict', () => {
  it('is evaluated on hard gate before P&L sign — a hard gate with a winning P&L is a LUCKY_ESCAPE, not a win', () => {
    expect(classifyVerdict(params({ hardGateViolation: true, finalPnl: 500, executionMedal: 'GOLD' }))).toBe('LUCKY_ESCAPE');
  });

  it('is DESERVED_LOSS on a hard gate with a losing P&L', () => {
    expect(classifyVerdict(params({ hardGateViolation: true, finalPnl: -100 }))).toBe('DESERVED_LOSS');
  });

  it('is LUCKY_ESCAPE when execution was poor (NONE) but P&L was positive', () => {
    expect(classifyVerdict(params({ executionMedal: 'NONE', finalPnl: 200 }))).toBe('LUCKY_ESCAPE');
  });

  it('is PROFESSIONAL_LOSS when execution was good (GOLD/SILVER) but P&L was not positive', () => {
    expect(classifyVerdict(params({ executionMedal: 'GOLD', finalPnl: -50 }))).toBe('PROFESSIONAL_LOSS');
    expect(classifyVerdict(params({ executionMedal: 'SILVER', finalPnl: 0 }))).toBe('PROFESSIONAL_LOSS');
  });

  it('is PROFESSIONAL_WIN when execution was good (GOLD/SILVER) and P&L was positive', () => {
    expect(classifyVerdict(params({ executionMedal: 'GOLD', finalPnl: 300 }))).toBe('PROFESSIONAL_WIN');
    expect(classifyVerdict(params({ executionMedal: 'SILVER', finalPnl: 1 }))).toBe('PROFESSIONAL_WIN');
  });

  it('is DESERVED_LOSS when execution was poor (NONE) and P&L was not positive', () => {
    expect(classifyVerdict(params({ executionMedal: 'NONE', finalPnl: -100 }))).toBe('DESERVED_LOSS');
  });

  it('is MIXED_SESSION for a BRONZE execution medal, win or lose (neither good nor poor)', () => {
    expect(classifyVerdict(params({ executionMedal: 'BRONZE', finalPnl: 100 }))).toBe('MIXED_SESSION');
    expect(classifyVerdict(params({ executionMedal: 'BRONZE', finalPnl: -100 }))).toBe('MIXED_SESSION');
  });

  it('treats a Critical Escalation Stage the same as a hard gate — same severity tier, evaluated before P&L sign', () => {
    expect(classifyVerdict(params({ hasCriticalEscalation: true, finalPnl: 500, executionMedal: 'GOLD' }))).toBe('LUCKY_ESCAPE');
    expect(classifyVerdict(params({ hasCriticalEscalation: true, finalPnl: -100 }))).toBe('DESERVED_LOSS');
  });

  it('downgrades a would-be PROFESSIONAL_WIN to MIXED_SESSION when Preparation Medal is NONE', () => {
    expect(classifyVerdict(params({ executionMedal: 'GOLD', finalPnl: 300, preparationMedal: 'NONE' }))).toBe('MIXED_SESSION');
  });

  it('never lets Preparation Medal make a non-winning session look worse — only withholds the win label', () => {
    expect(classifyVerdict(params({ executionMedal: 'GOLD', finalPnl: -50, preparationMedal: 'NONE' }))).toBe('PROFESSIONAL_LOSS');
    expect(classifyVerdict(params({ executionMedal: 'NONE', finalPnl: -100, preparationMedal: 'NONE' }))).toBe('DESERVED_LOSS');
    expect(classifyVerdict(params({ hardGateViolation: true, finalPnl: -100, preparationMedal: 'NONE' }))).toBe('DESERVED_LOSS');
  });
});

describe('buildHeadline', () => {
  it('title-cases the classification into the Verdict Headline (§13 example: "Deserved Loss")', () => {
    expect(buildHeadline('PROFESSIONAL_WIN')).toBe('Professional Win');
    expect(buildHeadline('DESERVED_LOSS')).toBe('Deserved Loss');
    expect(buildHeadline('MIXED_SESSION')).toBe('Mixed Session');
    expect(buildHeadline('INSUFFICIENT_EVIDENCE')).toBe('Insufficient Evidence');
  });
});
