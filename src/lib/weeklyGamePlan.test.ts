import { describe, it, expect } from 'vitest';
import { validateWeeklyGamePlan, WGPContext } from './weeklyGamePlan';
import { getSlotRulesForLevel } from './brmRules';
import { WeeklyBRMAssignmentRow } from './sessionContract';
import { BRMLevel, FrameworkVersion } from '../types';

const FRAMEWORK_VERSION: FrameworkVersion = {
  id: 'fw-version-1',
  framework_id: 'fw-1',
  version_number: 1,
  primary_objective: 'Build a stable, disciplined quarter',
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  is_activated: true,
  created_at: '2026-01-01T00:00:00Z',
  change_reason: null,
};

// validateWeeklyGamePlan only reads `.locked_at` off the BRM assignment, so
// the fixture only needs to satisfy that field plus the type shape.
const LOCKED_BRM_ASSIGNMENT = { locked_at: '2026-01-01T00:00:00Z' } as WeeklyBRMAssignmentRow;

const BRM_LEVEL_1: BRMLevel = {
  id: 'brm-level-1',
  version_id: 'brm-version-1',
  level_index: 1,
  max_tournament_buy_in: 5000,
  max_session_exposure: 10000,
};

function validContext(overrides: Partial<WGPContext> = {}): WGPContext {
  return {
    pokerWeek: null,
    brmAssignment: LOCKED_BRM_ASSIGNMENT,
    brmLevel: BRM_LEVEL_1,
    frameworkVersion: FRAMEWORK_VERSION,
    slotRules: getSlotRulesForLevel(1),
    ...overrides,
  };
}

const VALID_DAY = { planned_date: '2026-01-05', planned_session_allocation: 1 };
const VALID_TOURNAMENT = { slot_number: 1, intended_buy_ins: 2, planned_date: '2026-01-05', session: 1 as const }; // BRM Level 1, Slot 1 permits max 2

describe('validateWeeklyGamePlan', () => {
  it('passes with no issues for a plan that fits its BRM Level 1 slot rules', () => {
    expect(validateWeeklyGamePlan([VALID_DAY], [VALID_TOURNAMENT], validContext())).toEqual([]);
  });

  it('flags a missing active Performance Framework', () => {
    const issues = validateWeeklyGamePlan([], [], validContext({ frameworkVersion: null }));
    expect(issues.map((i) => i.field)).toContain('framework');
  });

  it('flags a missing Weekly BRM Assignment', () => {
    const issues = validateWeeklyGamePlan([], [], validContext({ brmAssignment: null }));
    expect(issues.map((i) => i.field)).toContain('brm');
  });

  it('flags a Weekly BRM Assignment that has not locked yet', () => {
    const issues = validateWeeklyGamePlan([], [], validContext({ brmAssignment: { locked_at: null } as WeeklyBRMAssignmentRow }));
    expect(issues.map((i) => i.field)).toContain('brm');
  });

  it('flags a playing day allocated more than 2 sessions', () => {
    const issues = validateWeeklyGamePlan(
      [{ planned_date: '2026-01-05', planned_session_allocation: 3 }],
      [],
      validContext(),
    );
    expect(issues.some((i) => i.message.includes('maximum two sessions per poker day'))).toBe(true);
  });

  it('flags a playing day allocated fewer than 1 session', () => {
    const issues = validateWeeklyGamePlan(
      [{ planned_date: '2026-01-05', planned_session_allocation: 0 }],
      [],
      validContext(),
    );
    expect(issues.some((i) => i.message.includes('at least 1'))).toBe(true);
  });

  it('flags when the BRM level has no configured slot rules (coach has not set them up)', () => {
    // Levels 6-8 are intentionally left unconfigured per the PRD.
    const issues = validateWeeklyGamePlan(
      [],
      [],
      validContext({ brmLevel: { ...BRM_LEVEL_1, level_index: 6 }, slotRules: getSlotRulesForLevel(6) }),
    );
    expect(issues.some((i) => i.field === 'slots')).toBe(true);
  });

  it('flags more distinct tournament tables in ONE session than the BRM level permits', () => {
    // BRM Level 1 permits exactly 1 concurrent table — both tournaments
    // below are the same day/session, i.e. two tables at once.
    const issues = validateWeeklyGamePlan(
      [],
      [
        { slot_number: 1, intended_buy_ins: 1, planned_date: '2026-01-05', session: 1 },
        { slot_number: 2, intended_buy_ins: 1, planned_date: '2026-01-05', session: 1 },
      ],
      validContext(),
    );
    expect(issues.some((i) => i.field.startsWith('slots-'))).toBe(true);
  });

  it('does NOT flag distinct tournaments planned across different sessions/days, even when their combined week-wide slot count would exceed a single session\'s limit', () => {
    // Slot rules are a per-session ("at once") limit, not a week-wide
    // total (PRD §10 "Exceeded Simultaneous Table Limits") — four separate
    // one-table sittings must not be treated as four tables at once, even
    // though BRM Level 1 only permits 1 concurrent table.
    const issues = validateWeeklyGamePlan(
      [],
      [
        { slot_number: 1, intended_buy_ins: 1, planned_date: '2026-01-05', session: 1 },
        { slot_number: 2, intended_buy_ins: 1, planned_date: '2026-01-05', session: 2 },
        { slot_number: 3, intended_buy_ins: 1, planned_date: '2026-01-06', session: 1 },
        { slot_number: 4, intended_buy_ins: 1, planned_date: '2026-01-07', session: 1 },
      ],
      validContext(),
    );
    expect(issues.some((i) => i.field.startsWith('slots-'))).toBe(false);
  });

  it('flags a tournament in a slot number the BRM level does not permit', () => {
    const issues = validateWeeklyGamePlan(
      [],
      [{ slot_number: 99, intended_buy_ins: 1, planned_date: '2026-01-05', session: 1 }],
      validContext(),
    );
    expect(issues.some((i) => i.message.includes('is not permitted at BRM Level'))).toBe(true);
  });

  it('flags a tournament whose intended buy-ins exceed the slot\'s BRM-permitted maximum', () => {
    // BRM Level 1, Slot 1 permits a max of 2 buy-ins.
    const issues = validateWeeklyGamePlan(
      [],
      [{ slot_number: 1, intended_buy_ins: 3, planned_date: '2026-01-05', session: 1 }],
      validContext(),
    );
    expect(issues.some((i) => i.message.includes('exceeds BRM Level'))).toBe(true);
  });
});
