import { Database } from '../types/database';

export type VerdictClassification = Database['public']['Enums']['verdict_classification'];
  
// Never reasons from financial outcome first — hard gate/repeat-offence
// severity and execution quality are evaluated before P&L sign (§13
// evidence hierarchy).
//
// §13's evidence hierarchy runs Framework → Preparation → Session Contract
// → Execution Profile → Violations/repeat-offences → Behavioral Profile →
// Outcomes. Coverage here:
//   - Execution Profile, Outcomes: direct (executionMedal, finalPnl).
//   - Violations (hard gates): direct (hardGateViolation).
//   - Repeat-offences: direct (hasCriticalEscalation — a track reaching
//     Critical Escalation Stage, §12, is treated as the same severity tier
//     as a hard gate, but tracked/evidenced separately so the two reasons
//     stay distinguishable in the Verdict's evidence bullets).
//   - Session Contract: not a separate input here by design — every
//     system-detectable Session Contract violation (unauthorized
//     tournament, exceeded buy-ins, playing after Stop Loss) is configured
//     as a CRITICAL/hard-gate DISCIPLINE_PROCESS action in the taxonomy, so
//     it already reaches hardGateViolation via the Execution Profile path.
//   - Preparation: direct, but narrow — a NONE Preparation Medal can only
//     ever withhold the "Professional Win" label (downgrading to
//     MIXED_SESSION), never independently cause a worse classification.
//     Mirrors executionEngine.ts's own principle ("a bad night's sleep must
//     never silently drag down Execution ratings") — same spirit, just
//     scoped to classification and one-directional.
//   - Active Performance Framework, Behavioral Profile trend: deliberately
//     excluded from classification entirely — surfaced to the player only
//     as AI Reflection context (verdictReflection.ts/server.ts), never as
//     an input here. Framework status doesn't describe this session's own
//     conduct, and Behavioral Profile trend is a rolling, cross-session
//     computation with no deterministic SQL port (perform_end_session has
//     no way to recompute it) — neither belongs in a per-session, purely
//     deterministic classification.
export function classifyVerdict(params: {
  hardGateViolation: boolean;
  hasCriticalEscalation: boolean;
  finalPnl: number;
  executionMedal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE';
  preparationMedal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE';
}): VerdictClassification {
  const positive = params.finalPnl > 0;
  const goodExecution = params.executionMedal === 'GOLD' || params.executionMedal === 'SILVER';
  const poorExecution = params.executionMedal === 'NONE';

  if (params.hardGateViolation || params.hasCriticalEscalation) return positive ? 'LUCKY_ESCAPE' : 'DESERVED_LOSS';
  if (poorExecution && positive) return 'LUCKY_ESCAPE';
  if (goodExecution && !positive) return 'PROFESSIONAL_LOSS';
  if (goodExecution && positive) return params.preparationMedal === 'NONE' ? 'MIXED_SESSION' : 'PROFESSIONAL_WIN';
  if (poorExecution && !positive) return 'DESERVED_LOSS';
  return 'MIXED_SESSION';
}

// Verdict Card structure's first element is just the classification name
// itself, shown in Display type (§13: "Verdict Headline... e.g. 'Deserved
// Loss'") — title case, not the raw enum label. Kept as its own function —
// not just used inline — so a coach override or future AI-generated variant
// headline has one place to plug in without touching classifyVerdict's
// deterministic logic.
export function buildHeadline(classification: VerdictClassification): string {
  return classification
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}