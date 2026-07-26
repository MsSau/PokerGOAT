import { describe, it, expect } from 'vitest';
import { computeCurrentPokerWeekWindow } from './weeklyBrmAssignment';

describe('computeCurrentPokerWeekWindow', () => {
  it('finds the most recent Monday 10:00 boundary when now is midweek', () => {
    // Wednesday 2026-07-22 15:00 local
    const now = new Date(2026, 6, 22, 15, 0, 0);
    const { start, end } = computeCurrentPokerWeekWindow(1, '10:00:00', now);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(20); // Monday 2026-07-20
    expect(start.getHours()).toBe(10);
    expect(end.getDate()).toBe(27); // exactly 7 days later
  });

  it('rolls back to the PREVIOUS week when now is exactly on boundary day but before boundary time', () => {
    // Monday 2026-07-20 09:00 — the boundary crossing for this week hasn't happened yet
    const now = new Date(2026, 6, 20, 9, 0, 0);
    const { start } = computeCurrentPokerWeekWindow(1, '10:00:00', now);
    expect(start.getDate()).toBe(13); // the Monday before
  });

  it('rolls forward to THIS week when now is exactly on boundary day at/after boundary time', () => {
    // Monday 2026-07-20 10:00 exactly
    const now = new Date(2026, 6, 20, 10, 0, 0);
    const { start } = computeCurrentPokerWeekWindow(1, '10:00:00', now);
    expect(start.getDate()).toBe(20);
    expect(start.getHours()).toBe(10);
  });

  it('always returns a window spanning exactly 7 days', () => {
    const now = new Date(2026, 6, 24, 3, 0, 0);
    const { start, end } = computeCurrentPokerWeekWindow(3, '14:30:00', now);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('supports a non-Monday boundary day (e.g. Thursday = 4)', () => {
    // Sunday 2026-07-26
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const { start } = computeCurrentPokerWeekWindow(4, '09:00:00', now);
    expect(start.getDate()).toBe(23); // Thursday 2026-07-23
    expect(start.getHours()).toBe(9);
  });
});
