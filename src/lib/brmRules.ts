// src/lib/brmRules.ts
//
// Tournament slot rules (max buy-ins per BRM-permitted slot number) are
// coach-configurable, versioned alongside the rest of a coach's BRM
// configuration (brm_level_slot_rules, one row per brm_level_id + slot
// number — see brmConfig.ts and the 20260721020000 migration). Live
// resolution (what WeeklyGamePlanView actually validates against) always
// goes through fetchSlotRulesForBRMLevel() below, scoped to the specific
// brm_levels row a Weekly BRM Assignment is pinned to.
//
// DEFAULT_SLOT_RULES/getSlotRulesForLevel remain as pure, hardcoded
// fallbacks — PRD Section 4's shipped defaults, used only to prefill a
// brand-new BRM configuration's slot rules (mirroring DEFAULT_BRM_ROWS' role
// for bankroll bands/levels in brmConfig.ts), never as a live source. Levels
// 6-8 are intentionally left unconfigured per the PRD's explicit instruction
// not to invent values for them.

import { supabase } from './supabase';

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

/** Live, coach-configured slot rules for one specific brm_levels row. Null if the coach hasn't configured any yet. */
export async function fetchSlotRulesForBRMLevel(brmLevelId: string): Promise<SlotRule[] | null> {
  const { data, error } = await supabase
    .from('brm_level_slot_rules')
    .select('*')
    .eq('brm_level_id', brmLevelId)
    .order('slot_number', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data.map((r) => ({ slotNumber: r.slot_number, maxBuyIns: r.max_buy_ins }));
}