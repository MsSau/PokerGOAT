// ⚠️ verify exact verdict_classification enum labels before deploying.
export type VerdictClassification =
  | 'PROFESSIONAL_WIN' | 'PROFESSIONAL_LOSS' | 'LUCKY_ESCAPE'
  | 'DESERVED_LOSS' | 'MIXED_SESSION' | 'INSUFFICIENT_EVIDENCE';
  
// Never reasons from financial outcome first — hard gate and execution
// quality are evaluated before P&L sign (§13 evidence hierarchy).
export function classifyVerdict(params: {
  hardGateViolation: boolean;
  finalPnl: number;
  executionMedal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE';
}): VerdictClassification {
  const positive = params.finalPnl > 0;
  const goodExecution = params.executionMedal === 'GOLD' || params.executionMedal === 'SILVER';
  const poorExecution = params.executionMedal === 'NONE';

  if (params.hardGateViolation) return positive ? 'LUCKY_ESCAPE' : 'DESERVED_LOSS';
  if (poorExecution && positive) return 'LUCKY_ESCAPE';
  if (goodExecution && !positive) return 'PROFESSIONAL_LOSS';
  if (goodExecution && positive) return 'PROFESSIONAL_WIN';
  if (poorExecution && !positive) return 'DESERVED_LOSS';
  return 'MIXED_SESSION';
}

// Verdict Card structure's first element is just the classification name
// itself, shown in Display type (§13: "Verdict Headline... e.g. 'Deserved
// Loss'"). Kept as its own function — not just used inline — so a coach
// override or future AI-generated variant headline has one place to plug in
// without touching classifyVerdict's deterministic logic.
export function buildHeadline(classification: VerdictClassification): string {
    return classification;}