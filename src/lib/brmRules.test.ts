import { describe, it, expect } from 'vitest';
import { getSlotRulesForLevel, DEFAULT_SLOT_RULES } from './brmRules';

describe('getSlotRulesForLevel', () => {
  it('returns the configured slot rules for each documented level (1-5)', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(getSlotRulesForLevel(level)).toEqual(DEFAULT_SLOT_RULES[level]);
    }
  });

  it('returns null for levels 6-8, which the PRD explicitly leaves unconfigured', () => {
    expect(getSlotRulesForLevel(6)).toBeNull();
    expect(getSlotRulesForLevel(7)).toBeNull();
    expect(getSlotRulesForLevel(8)).toBeNull();
  });

  it('returns null for an out-of-range level rather than inventing a default', () => {
    expect(getSlotRulesForLevel(0)).toBeNull();
    expect(getSlotRulesForLevel(99)).toBeNull();
  });
});
