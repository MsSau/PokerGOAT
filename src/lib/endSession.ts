import { supabase } from './supabase';
import { computeEscalationUpdateForOccurrence, EscalationUpdate, Severity } from './escalationEngine';
import { computeOutcomeMedal } from './outcomeEngine';
import { classifyVerdict, buildHeadline} from './verdictEngine';
import { scoreAllDimensions, computeExecutionMedal, OccurrenceForScoring, Dimension, EXECUTION_DIMENSIONS } from './executionEngine';

// remove: const ALL_DIMENSIONS: Dimension[] = [...]  ← delete this line entirely
const ALL_DIMENSIONS: Dimension[] = ['DISCIPLINE_PROCESS', 'TECHNICAL_PLAY', 'MENTAL_GAME', 'LEARNING_IMPROVEMENT'];

export interface TournamentFinish {
  tournamentId: string;
  winningsGross: number;
  bestRank?: number;
  worstRank?: number;
  itmYn: boolean;
  finalTableYn: boolean;
  comments?: string;
}
export interface MistakeTagInput { executionActionId: string; tournamentId?: string; }

export interface EndSessionResult {
  sessionId: string;
  verdictId: string;
  executionAssessmentId: string;
  outcomeAssessmentId: string;
  executionMedal: string;
  outcomeMedal: string;
  verdictClassification: string;
  verdictHeadline: string;
  dimensionResults: { dimension: string; rating: string }[];
}

// ---------------------------------------------------------------------------
// The literal "End Session" button — Player action, PRD §2 "start and
// manually end sessions". Stops the clock; review + finalization is a
// separate step (below), matching session_status: ACTIVE → REVIEW_PENDING
// → FINALIZED.
// ---------------------------------------------------------------------------
export async function stopSessionForReview(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'REVIEW_PENDING', end_time: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('status', 'ACTIVE'); // guard: only a live session can be stopped
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The full "Session completion and post-session review" flow (§2.7–2.10).
// Every write happens inside the atomic perform_end_session RPC; everything
// above it here is pure client-side computation feeding that call.
// ---------------------------------------------------------------------------
export async function endSession(params: {
  sessionId: string;
  playerId: string;
  tournamentFinishes: TournamentFinish[];
  mistakeTags: MistakeTagInput[];
  reflectionNote?: string;
}): Promise<EndSessionResult> {
  const { sessionId, playerId, tournamentFinishes, mistakeTags } = params;

  // 1. Occurrences already recorded live during play (system-detected —
  //    §5 "Truthful Logging"), still missing their escalation stage.
  const { data: existingOccurrences, error: occErr } = await supabase
    .from('execution_action_occurrences')
    .select('id, execution_action_id, tournament_id, occurred_at')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });
  if (occErr) throw occErr;

  // 2. Resolve dimension / severity / hard-gate for every action referenced.
  const actionIds = Array.from(new Set([
    ...(existingOccurrences || []).map((o) => o.execution_action_id),
    ...mistakeTags.map((m) => m.executionActionId),
  ]));
  const { data: actions, error: actErr } = await supabase
    .from('execution_actions')
    .select('id, dimension, base_severity, is_hard_gate')
    .in('id', actionIds.length ? actionIds : ['00000000-0000-0000-0000-000000000000']);
  if (actErr) throw actErr;
  const actionMap = new Map((actions || []).map((a) => [a.id, a]));

  // 3. Chronological timeline: real occurred_at for logged-during-play
  //    occurrences, "now" for freshly-tagged mistakes (always last).
  const nowIso = new Date().toISOString();
  const timeline = [
    ...(existingOccurrences || []).map((o) => ({ actionId: o.execution_action_id, occurredAt: o.occurred_at })),
    ...mistakeTags.map((m) => ({ actionId: m.executionActionId, occurredAt: nowIso })),
  ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  // 4. Walk the timeline, computing escalation transitions sequentially
  //    per action (repeat occurrences of the same action in one session
  //    must stack, using each other's post-event stage as the next input).
  const runningStage = new Map<string, number>();
  const escalationUpdates: EscalationUpdate[] = [];
  const scoringOccurrences: OccurrenceForScoring[] = [];

  for (const item of timeline) {
    const action = actionMap.get(item.actionId);
    if (!action) continue; // never block end-of-session on a taxonomy resolution gap
    const severity = action.base_severity as Severity;
    const priorStage = runningStage.get(item.actionId);

    const update = await computeEscalationUpdateForOccurrence(playerId, item.actionId, severity, item.occurredAt, priorStage);
    runningStage.set(item.actionId, update.new_stage);
    escalationUpdates.push(update);

    scoringOccurrences.push({
      execution_action_id: item.actionId,
      dimension: action.dimension as Dimension,
      base_severity: severity,
      is_hard_gate: !!action.is_hard_gate,
      post_event_escalation_stage: update.new_stage,
    });
  }

  // 5. Execution Profile & Medal (§11).
  const dimensionResults = scoreAllDimensions(scoringOccurrences, EXECUTION_DIMENSIONS);
  const executionMedal = computeExecutionMedal(dimensionResults);
  const executionHardGate = dimensionResults.some((d) => d.hardGate);

  // 6. Net Session P&L (§6) — gross winnings from newly-finalized tournaments
  //    minus total investment across every entry logged this session.
  const grossFromNewFinishes = tournamentFinishes.reduce((s, t) => s + t.winningsGross, 0);
  const { data: entryRows } = await supabase
    .from('tournaments')
    .select('id, tournament_entries(investment)')
    .eq('session_id', sessionId);
  const totalInvestment = (entryRows || []).reduce(
    (s: number, t: any) => s + (t.tournament_entries || []).reduce((a: number, e: any) => a + (e.investment || 0), 0), 0,
  );
  const netPnl = grossFromNewFinishes - totalInvestment;

  const itmCount = tournamentFinishes.filter((t) => t.itmYn).length;
  const itmRate = tournamentFinishes.length ? itmCount / tournamentFinishes.length : 0;
  const hadFinalTable = tournamentFinishes.some((t) => t.finalTableYn);

  // 7. Outcome Medal (§8) — BRM compliance = no NON_COMPLIANT entries this session.
  const { data: nonCompliant } = await supabase
    .from('tournament_entries')
    .select('id, tournaments!inner(session_id)')
    .eq('tournaments.session_id', sessionId)
    .eq('status', 'NON_COMPLIANT');
  const brmCompliant = (nonCompliant || []).length === 0;
  const outcomeHardGate = !brmCompliant;

  const outcomeMedal = computeOutcomeMedal({
    brmCompliant, finalPnl: netPnl, hadFinalTable, itmRate, hardGateViolation: outcomeHardGate,
  });

  // 8. Verdict classification (§13).
  const verdictClassification = classifyVerdict({
    hardGateViolation: executionHardGate || outcomeHardGate,
    finalPnl: netPnl,
    executionMedal,
  });
  const verdictHeadline = buildHeadline(verdictClassification);

  // 9. Evidence seed — plain, evidence-anchored; AI prose layer (§17.5)
  //    speaks FROM this, never invents it.
  const verdictEvidence = [
    {
      section: 'Where You Failed the Standard',
      claim_text: executionHardGate
        ? 'A hard-gate Execution Action occurred this session, overriding all other scoring.'
        : `${dimensionResults.filter((d) => d.rating === 'WEAK' || d.rating === 'CRITICAL').length} dimension(s) rated WEAK or CRITICAL.`,
      confidence_level: 'High',
      evidence_entity_type: 'session_execution_assessment',
      evidence_entity_id: null,
    },
    {
      section: 'Outcome Reality Check',
      claim_text: `Net session P&L was ${netPnl >= 0 ? 'positive' : 'negative'}; BRM compliance was ${brmCompliant ? 'maintained' : 'broken'}.`,
      confidence_level: 'High',
      evidence_entity_type: 'session_outcome_assessment',
      evidence_entity_id: null,
    },
  ];

  const { data: priorities } = await supabase
    .from('coaching_priorities')
    .select('id, description, status')
    .eq('player_id', playerId)
    .eq('status', 'ACTIVE');

  // 10. The single atomic write.
  const { data, error } = await supabase.rpc('perform_end_session', {
    p_session_id: sessionId,
    p_tournament_finishes: Object.fromEntries(
      tournamentFinishes.map((t) => [t.tournamentId, {
        winnings_gross: t.winningsGross,
        best_rank: t.bestRank ?? null,
        worst_rank: t.worstRank ?? null,
        itm_yn: t.itmYn,
        final_table_yn: t.finalTableYn,
        comments: t.comments ?? null,
      }]),
    ),
    p_mistake_tags: mistakeTags.map((m) => ({
      execution_action_id: m.executionActionId,
      tournament_id: m.tournamentId ?? null,
    })),
    p_escalation_updates: escalationUpdates,
    p_execution_hard_gate_triggered: executionHardGate,
    p_execution_medal: executionMedal,
    p_dimension_ratings: dimensionResults.map((d) => ({ dimension: d.dimension, rating: d.rating })),
    p_final_pnl: netPnl,
    p_outcome_brm_compliant: brmCompliant,
    p_outcome_hard_gate_triggered: outcomeHardGate,
    p_outcome_medal: outcomeMedal,
    p_verdict_classification: verdictClassification,
    p_verdict_headline: verdictHeadline,
    p_verdict_evidence: verdictEvidence,
    p_coaching_priorities_snapshot: priorities || [],
    p_behavioral_snapshot_id: null,
  });
  if (error) throw error;

  return {
    sessionId,
    verdictId: data.verdict_id,
    executionAssessmentId: data.execution_assessment_id,
    outcomeAssessmentId: data.outcome_assessment_id,
    executionMedal,
    outcomeMedal,
    verdictClassification,
    verdictHeadline,
    dimensionResults: dimensionResults.map((d) => ({ dimension: d.dimension, rating: d.rating })),
  };
}