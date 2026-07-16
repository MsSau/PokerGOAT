// src/lib/brmRules.ts
//
// TBD / ASSUMPTION (PRD Section 4 & 20): tournament slot count and per-slot
// buy-in caps are not modeled as structured rows in the current schema —
// brm_levels only stores the two dollar limits (max_tournament_buy_in,
// max_session_exposure). Until a coach-editable slot-rules table exists,
// this module mirrors the PRD's documented defaults for BRM Levels 1-5.
// Levels 6-8 are intentionally left unconfigured per the PRD's explicit
// instruction not to invent values for them.

export interface SlotRule {
    slotNumber: number;
    maxBuyIns: number;
  }
  
  export const DEFAULT_SLOT_RULES: Record<number, SlotRule[]> = {
    1: [{ slotNumber: 1, maxBuyIns: 2 }],
    2: [
      { slotNumber: 1, maxBuyIns: 2 },
      { slotNumber: 2, maxBuyIns: 1 },
      { slotNumber: 3, maxBuyIns: 2 },
      { slotNumber: 4, maxBuyIns: 2 },
      { slotNumber: 5, maxBuyIns: 2 },
    ],
    3: [
      { slotNumber: 1, maxBuyIns: 2 },
      { slotNumber: 2, maxBuyIns: 2 },
    ],
    4: [
      { slotNumber: 1, maxBuyIns: 2 },
      { slotNumber: 2, maxBuyIns: 2 },
      { slotNumber: 3, maxBuyIns: 2 },
    ],
    5: [
      { slotNumber: 1, maxBuyIns: 2 },
      { slotNumber: 2, maxBuyIns: 2 },
      { slotNumber: 3, maxBuyIns: 2 },
    ],
  };
  
  export function getSlotRulesForLevel(levelIndex: number): SlotRule[] | null {
    return DEFAULT_SLOT_RULES[levelIndex] ?? null;
  }