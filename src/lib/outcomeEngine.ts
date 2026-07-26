import { Database } from '../types/database';

export type OutcomeMedal = Database['public']['Enums']['medal_type'];

export function computeOutcomeMedal(params: {
  brmCompliant: boolean;
  finalPnl: number;
  hadFinalTable: boolean;
  itmRate: number; // 0..1
  hardGateViolation: boolean;
}): OutcomeMedal {
  const positive = params.finalPnl > 0;
  // "No Medal" if not positive OR hard-gate — evaluated before anything else (§8).
  if (params.hardGateViolation || !positive || !params.brmCompliant) return 'NONE';
  if (params.hadFinalTable) return 'GOLD';
  if (params.itmRate >= 0.5) return 'SILVER';
  return 'BRONZE';
}