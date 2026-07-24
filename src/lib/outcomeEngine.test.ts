import { describe, it, expect } from 'vitest';
import { computeOutcomeMedal } from './outcomeEngine';

function params(overrides: Partial<Parameters<typeof computeOutcomeMedal>[0]> = {}) {
  return {
    brmCompliant: true,
    finalPnl: 100,
    hadFinalTable: false,
    itmRate: 0,
    hardGateViolation: false,
    ...overrides,
  };
}

describe('computeOutcomeMedal', () => {
  it('is NONE on a hard-gate violation even with a positive, BRM-compliant P&L', () => {
    expect(computeOutcomeMedal(params({ hardGateViolation: true, hadFinalTable: true }))).toBe('NONE');
  });

  it('is NONE when P&L is not positive, regardless of ITM/final-table performance', () => {
    expect(computeOutcomeMedal(params({ finalPnl: 0, hadFinalTable: true }))).toBe('NONE');
    expect(computeOutcomeMedal(params({ finalPnl: -50, itmRate: 1 }))).toBe('NONE');
  });

  it('is NONE when not BRM-compliant, even with a positive P&L', () => {
    expect(computeOutcomeMedal(params({ brmCompliant: false }))).toBe('NONE');
  });

  it('is GOLD for a positive, compliant session that reached a final table', () => {
    expect(computeOutcomeMedal(params({ hadFinalTable: true, itmRate: 0 }))).toBe('GOLD');
  });

  it('is SILVER for a positive, compliant session with ITM rate >= 0.5 but no final table', () => {
    expect(computeOutcomeMedal(params({ itmRate: 0.5 }))).toBe('SILVER');
  });

  it('is BRONZE for a positive, compliant session below the ITM/final-table thresholds', () => {
    expect(computeOutcomeMedal(params({ itmRate: 0.2 }))).toBe('BRONZE');
  });

  it('prioritizes GOLD over SILVER when both a final table and a high ITM rate are true', () => {
    expect(computeOutcomeMedal(params({ hadFinalTable: true, itmRate: 1 }))).toBe('GOLD');
  });
});
