export type OutcomeMedal = 'Gold' | 'Silver' | 'Bronze' | 'None';

export function computeOutcomeMedal(params: {
  brmCompliant: boolean;
  finalPnl: number;
  hadFinalTable: boolean;
  itmRate: number; // 0..1
  hardGateViolation: boolean;
}): OutcomeMedal {
  const positive = params.finalPnl > 0;
  // "No Medal" if not positive OR hard-gate — evaluated before anything else (§8).
  if (params.hardGateViolation || !positive || !params.brmCompliant) return 'None';
  if (params.hadFinalTable) return 'Gold';
  if (params.itmRate >= 0.5) return 'Silver';
  return 'Bronze';
}