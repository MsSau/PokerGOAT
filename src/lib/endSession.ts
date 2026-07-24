import { supabase } from './supabase';
import { computeEscalationUpdateForOccurrence, Severity } from './escalationEngine';
import { computeOutcomeMedal } from './outcomeEngine';
import { classifyVerdict, buildHeadline} from './verdictEngine';
import { scoreAllDimensions, computeExecutionMedal, OccurrenceForScoring, DimensionResult, Dimension, EXECUTION_DIMENSIONS } from './executionEngine';
import { scoreForRating, DIMENSION_LABELS } from './behavioralProfileEngine';
import { fetchBehavioralProfile } from './behavioralProfile';
import { formatCurrency } from './utils';
import { requestVerdictProse } from './verdictProse';
import { requestVerdictReflection } from './verdictReflection';

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

// Verdict Card §2.10 item 6 — "one forward-looking line." A hard gate always
// takes priority (it's the most severe possible evidence); otherwise names
// whichever dimension scored lowest, using the same 0-3 rating scale
// scoreForRating already defines elsewhere (CRITICAL=0 ... STRONG=3), tied
// by dimensionResults' fixed EXECUTION_DIMENSIONS order (Array.prototype.sort
// is stable).
function buildNextStandard(results: DimensionResult[], hardGateTriggered: boolean): string {
  if (hardGateTriggered) {
    return 'Standard for next session: complete the session without triggering a hard-gate Execution Action.';
  }
  const worst = [...results].sort((a, b) => scoreForRating(a.rating) - scoreForRating(b.rating))[0];
  if (!worst || worst.rating === 'STRONG') {
    return 'Standard for next session: sustain this level of process discipline.';
  }
  return `Standard for next session: bring ${DIMENSION_LABELS[worst.dimension]} back to Acceptable or better.`;
}

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

// The reverse of stopSessionForReview — lets the player back out of review
// to fix/add entries in TournamentLog before finalizing (SessionReview.tsx's
// confirm-entries step). Only reachable while still REVIEW_PENDING; once
// perform_end_session has run (status FINALIZED), both the RLS policy this
// relies on and fn_check_session_finalized's trigger block it outright, same
// as every other direct mutation of a finalized session.
export async function resumeSessionForEditing(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'ACTIVE', end_time: null })
    .eq('id', sessionId)
    .eq('status', 'REVIEW_PENDING');
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
  const { sessionId, playerId, tournamentFinishes, mistakeTags, reflectionNote } = params;

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
    .select('id, name, dimension, base_severity, is_hard_gate')
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
  //    This is a client-side PREVIEW only — perform_end_session recomputes
  //    escalation server-side from committed rows and is the authoritative
  //    result (see the RPC call below); this pass exists purely so the
  //    evidence bullets/verdict-prose step below have dimension ratings and
  //    hard-gate names to describe before that RPC call has happened yet.
  const runningStage = new Map<string, number>();
  const scoringOccurrences: OccurrenceForScoring[] = [];

  for (const item of timeline) {
    const action = actionMap.get(item.actionId);
    if (!action) continue; // never block end-of-session on a taxonomy resolution gap
    const severity = action.base_severity as Severity;
    const priorStage = runningStage.get(item.actionId);

    const update = await computeEscalationUpdateForOccurrence(playerId, item.actionId, severity, item.occurredAt, priorStage);
    runningStage.set(item.actionId, update.new_stage);

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

  // §12's "Critical Escalation Stage" (5-8 on the ordered ladder) — tracked
  // as its own severity signal for classifyVerdict below (§13's "Violations
  // and repeat offences" tier), distinct from executionHardGate even though
  // it's evaluated from the same walk, so the Verdict's evidence can say
  // *which* reason applied.
  const hasCriticalEscalation = scoringOccurrences.some((o) => o.post_event_escalation_stage >= 5);

  // 6. Net Session P&L (§6) — gross winnings across every tournament in this
  //    session, whichever finalized it (some may have already been finalized
  //    live during play via TournamentLog, not just the ones in this review's
  //    tournamentFinishes) — minus total investment across every entry logged
  //    this session.
  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('id, net_return, winnings_gross, itm_yn, final_table_yn, comments, tournament_entries(investment)')
    .eq('session_id', sessionId);
  const finishById = new Map(tournamentFinishes.map((t) => [t.tournamentId, t]));

  let grossTotal = 0;
  let itmCount = 0;
  let finalizedCount = 0;
  let hadFinalTable = false;
  for (const t of allTournaments || []) {
    if (t.net_return !== null) {
      // Already finalized live during play — use the stored result.
      grossTotal += t.winnings_gross || 0;
      if (t.itm_yn) itmCount++;
      if (t.final_table_yn) hadFinalTable = true;
      finalizedCount++;
    } else {
      const finish = finishById.get(t.id);
      if (!finish) continue; // still unfinalized and not part of this review pass (shouldn't happen)
      grossTotal += finish.winningsGross;
      if (finish.itmYn) itmCount++;
      if (finish.finalTableYn) hadFinalTable = true;
      finalizedCount++;
    }
  }
  const totalInvestment = (allTournaments || []).reduce(
    (s, t) => s + (t.tournament_entries || []).reduce((a, e) => a + (e.investment || 0), 0), 0,
  );
  const netPnl = grossTotal - totalInvestment;
  const itmRate = finalizedCount ? itmCount / finalizedCount : 0;

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

  // 7.5. Session/Preparation context — resolved once here (rather than at
  // the reflection pass further down, which used to fetch this itself)
  // since Preparation Medal now also feeds classification below. The other
  // fields on these two rows (session_intention, optional_note, ritual_*,
  // framework_version_id, weekly_game_plan_id) aren't needed for
  // classification, but are fetched in the same round trip since they're on
  // the same rows, and reused later for the AI reflection pass.
  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('contract_id, preparation_id')
    .eq('id', sessionId)
    .maybeSingle();

  let preparationMedal: 'GOLD' | 'SILVER' | 'BRONZE' | 'NONE' = 'GOLD'; // neutral default — never penalize classification on a lookup gap (e.g. a legacy session predating mandatory preparation)
  let preparationNote: string | null = null;
  let ritualIntent: string | null = null;
  let ritualIdentityLine: string | null = null;
  let ritualProcessDefinition: string | null = null;
  if (sessionRow?.preparation_id) {
    const { data: prepRow } = await supabase
      .from('preparation_records')
      .select('medal_tier, optional_note, ritual_intent, ritual_identity_line, ritual_process_definition')
      .eq('id', sessionRow.preparation_id)
      .maybeSingle();
    if (prepRow?.medal_tier) preparationMedal = prepRow.medal_tier;
    preparationNote = prepRow?.optional_note ?? null;
    ritualIntent = prepRow?.ritual_intent ?? null;
    ritualIdentityLine = prepRow?.ritual_identity_line ?? null;
    ritualProcessDefinition = prepRow?.ritual_process_definition ?? null;
  }

  let sessionIntention: string | null = null;
  let frameworkStatus: string | null = null;
  if (sessionRow?.contract_id) {
    const { data: contractRow } = await supabase
      .from('session_contracts')
      .select('session_intention, framework_version_id, weekly_game_plan_id')
      .eq('id', sessionRow.contract_id)
      .maybeSingle();
    sessionIntention = contractRow?.session_intention ?? null;

    // Active Performance Framework — deliberately excluded from
    // classification (verdictEngine.ts's own header comment explains why);
    // this is gathered only to hand to the AI Reflection pass below as
    // context, never to classifyVerdict.
    const frameworkParts: string[] = [];
    if (contractRow?.framework_version_id) {
      const { data: fw } = await supabase
        .from('framework_versions')
        .select('primary_objective')
        .eq('id', contractRow.framework_version_id)
        .maybeSingle();
      if (fw?.primary_objective) frameworkParts.push(`Framework objective: ${fw.primary_objective}`);
    }
    if (contractRow?.weekly_game_plan_id) {
      const { data: wgp } = await supabase
        .from('weekly_game_plans')
        .select('weekly_intention, weekly_focus')
        .eq('id', contractRow.weekly_game_plan_id)
        .maybeSingle();
      if (wgp?.weekly_intention) frameworkParts.push(`Weekly Intention: ${wgp.weekly_intention}`);
      if (wgp?.weekly_focus) frameworkParts.push(`Weekly Focus: ${wgp.weekly_focus}`);
    }
    frameworkStatus = frameworkParts.length > 0 ? frameworkParts.join('. ') : null;
  }

  // 8. Verdict classification (§13).
  const verdictClassification = classifyVerdict({
    hardGateViolation: executionHardGate || outcomeHardGate,
    hasCriticalEscalation,
    finalPnl: netPnl,
    executionMedal,
    preparationMedal,
  });
  const verdictHeadline = buildHeadline(verdictClassification);
  // Mirrors classifyVerdict's own internal branch conditions, purely so the
  // evidence bullets below can tell whether Preparation actually changed
  // anything (only true in the one branch that withholds PROFESSIONAL_WIN) —
  // classifyVerdict itself stays a pure function returning just the
  // classification, not a reasons list.
  const preparationDowngraded =
    preparationMedal === 'NONE' &&
    (executionMedal === 'GOLD' || executionMedal === 'SILVER') &&
    netPnl > 0;

  // 9. Evidence — plain, evidence-anchored, deterministic text (§17.5: "no
  //    AI call in this pass", same posture as coachBrief.ts's template
  //    sections). One row per bullet for the three bullet-list sections
  //    (§2.10 items 2-4); Outcome Reality Check and Next Standard are each a
  //    single explicit line, per their own PRD description.
  const actionNameById = new Map((actions || []).map((a) => [a.id, a.name]));
  const verdictEvidence: {
    section: string;
    claim_text: string;
    confidence_level: string;
    evidence_entity_type: string;
    evidence_entity_id: string | null;
  }[] = [];

  // What You Did Well — one bullet per dimension that earned Strong/Acceptable.
  const wentWellDims = dimensionResults.filter((d) => d.rating === 'STRONG' || d.rating === 'ACCEPTABLE');
  if (wentWellDims.length === 0) {
    verdictEvidence.push({
      section: 'WHAT_WENT_WELL',
      claim_text: 'No dimension scored Strong or Acceptable this session.',
      confidence_level: 'HIGH',
      evidence_entity_type: 'session_execution_assessment',
      evidence_entity_id: null,
    });
  } else {
    for (const d of wentWellDims) {
      verdictEvidence.push({
        section: 'WHAT_WENT_WELL',
        claim_text: `${DIMENSION_LABELS[d.dimension]} rated ${d.rating}.`,
        confidence_level: 'HIGH',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
  }

  // Where You Failed the Standard — one bullet per named hard-gate
  // occurrence, one per Weak/Critical dimension, plus (when they apply) a
  // repeat-offence/Critical Escalation bullet and a Preparation-gap bullet
  // (§13's Violations/repeat-offences and Preparation evidence tiers).
  const hardGateOccurrences = scoringOccurrences.filter((o) => o.is_hard_gate);
  const failedDims = dimensionResults.filter((d) => d.rating === 'WEAK' || d.rating === 'CRITICAL');
  if (hardGateOccurrences.length === 0 && failedDims.length === 0 && !hasCriticalEscalation && !preparationDowngraded) {
    verdictEvidence.push({
      section: 'WHERE_FAILED',
      claim_text: 'No Execution Action violations or below-standard dimensions this session.',
      confidence_level: 'HIGH',
      evidence_entity_type: 'session_execution_assessment',
      evidence_entity_id: null,
    });
  } else {
    for (const o of hardGateOccurrences) {
      verdictEvidence.push({
        section: 'WHERE_FAILED',
        claim_text: `${actionNameById.get(o.execution_action_id) ?? 'Unknown action'} — hard gate triggered.`,
        confidence_level: 'HIGH',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
    for (const d of failedDims) {
      verdictEvidence.push({
        section: 'WHERE_FAILED',
        claim_text: `${DIMENSION_LABELS[d.dimension]} rated ${d.rating} (severity score ${d.score}).`,
        confidence_level: 'HIGH',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
    if (hasCriticalEscalation) {
      verdictEvidence.push({
        section: 'WHERE_FAILED',
        claim_text: 'A repeat pattern reached Critical Escalation Stage this session.',
        confidence_level: 'HIGH',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
    if (preparationDowngraded) {
      verdictEvidence.push({
        section: 'WHERE_FAILED',
        claim_text: 'Preparation Medal was NONE — a Professional Win requires more than good execution and a good result.',
        confidence_level: 'HIGH',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
  }

  // Pattern Check — references the Behavioral Profile's own recurring-
  // pattern detection, evaluated on evidence strictly before this session
  // (this session's own assessment/outcome rows don't exist yet at this
  // point — they're written later in the same perform_end_session call).
  // Never blocks finalization if it fails; it's supplementary evidence.
  // behavioralProfileTrend is captured from this same fetch purely for the
  // AI Reflection pass below (§13: Behavioral Profile trend is deliberately
  // excluded from classification itself — see verdictEngine.ts).
  let patternClaims: string[] = [];
  let behavioralProfileTrend: string[] = [];
  try {
    const priorProfile = await fetchBehavioralProfile(playerId);
    patternClaims = priorProfile.flatMap((p) => p.recurringPatterns.map((pattern) => `${DIMENSION_LABELS[p.dimension]} — ${pattern}.`));
    behavioralProfileTrend = priorProfile
      .filter((p) => p.state !== 'NOT_CURRENTLY_OBSERVABLE')
      .map((p) => `${DIMENSION_LABELS[p.dimension]}: ${p.state}${p.radarIndex !== null ? ` (${p.radarIndex})` : ''}`);
  } catch {
    patternClaims = [];
    behavioralProfileTrend = [];
  }
  if (patternClaims.length === 0) {
    verdictEvidence.push({
      section: 'PATTERN_CHECK',
      claim_text: 'No recurring pattern detected across recent sessions.',
      confidence_level: 'MEDIUM',
      evidence_entity_type: 'session_execution_assessment',
      evidence_entity_id: null,
    });
  } else {
    for (const claim of patternClaims.slice(0, 3)) {
      verdictEvidence.push({
        section: 'PATTERN_CHECK',
        claim_text: claim,
        confidence_level: 'MEDIUM',
        evidence_entity_type: 'session_execution_assessment',
        evidence_entity_id: null,
      });
    }
  }

  // Outcome Reality Check — outcome-only commentary, kept explicitly
  // separate from the execution evidence above (Principle 3: results never
  // excuse or substitute for process).
  verdictEvidence.push({
    section: 'OUTCOME_REALITY',
    claim_text: `Net session P&L was ${netPnl >= 0 ? 'positive' : 'negative'} (${formatCurrency(netPnl)}); BRM compliance was ${
      brmCompliant ? 'maintained' : 'broken'
    }; ${itmCount}/${finalizedCount} tournament(s) ITM${hadFinalTable ? ', reached a final table' : ''}.`,
    confidence_level: 'HIGH',
    evidence_entity_type: 'session_outcome_assessment',
    evidence_entity_id: null,
  });

  // Next Standard — one forward-looking line, no bullet list.
  verdictEvidence.push({
    section: 'NEXT_STANDARD',
    claim_text: buildNextStandard(dimensionResults, executionHardGate),
    confidence_level: 'MEDIUM',
    evidence_entity_type: 'session_execution_assessment',
    evidence_entity_id: null,
  });

  // 9.5. Optional AI prose pass (PRD §17.5: "AI may generate Verdict prose
  // from deterministic context"). Rewrites the claim_text of every bullet
  // above into coach-voiced prose via server.ts/Gemini — never adds,
  // removes, or reorders bullets; the server rejects any response whose
  // per-section counts don't match what was sent. Silently keeps the
  // deterministic text above on any failure (offline, rate limit, key not
  // configured, malformed response) — never blocks finalization.
  const bySection = (section: string) => verdictEvidence.filter((e) => e.section === section).map((e) => e.claim_text);
  const prose = await requestVerdictProse({
    classification: verdictClassification,
    whatWentWell: bySection('WHAT_WENT_WELL'),
    whereFailed: bySection('WHERE_FAILED'),
    patternCheck: bySection('PATTERN_CHECK'),
    outcomeReality: bySection('OUTCOME_REALITY')[0] ?? '',
    nextStandard: bySection('NEXT_STANDARD')[0] ?? '',
  });
  if (prose) {
    let wwwIdx = 0;
    let wfIdx = 0;
    let pcIdx = 0;
    for (const item of verdictEvidence) {
      if (item.section === 'WHAT_WENT_WELL') item.claim_text = prose.whatWentWell[wwwIdx++];
      else if (item.section === 'WHERE_FAILED') item.claim_text = prose.whereFailed[wfIdx++];
      else if (item.section === 'PATTERN_CHECK') item.claim_text = prose.patternCheck[pcIdx++];
      else if (item.section === 'OUTCOME_REALITY') item.claim_text = prose.outcomeReality;
      else if (item.section === 'NEXT_STANDARD') item.claim_text = prose.nextStandard;
    }
  }

  // 9.6. Optional AI reflection pass — a closing paragraph synthesized from
  // the deterministic evidence above PLUS several pieces of free text the
  // player typed earlier in the flow (never itself evidence, never able to
  // change the classification computed above), PLUS Framework/Behavioral
  // Profile context (frameworkStatus, behavioralProfileTrend — resolved at
  // step 7.5 / Pattern Check above). Generated at most once, here, and
  // stored immutably on the Verdict — never regenerated on later views.
  // Skipped entirely (no Gemini call) when every free-text source is blank
  // — Framework/Behavioral Profile context alone is never reason enough to
  // call it, since this section's whole value is quoting the player's own
  // words back to them.
  const tournamentComments = (allTournaments || [])
    .map((t) => (t.net_return !== null ? t.comments : finishById.get(t.id)?.comments ?? null))
    .filter((c): c is string => !!c && !!c.trim());

  const hasAnyFreeText =
    !!sessionIntention?.trim() ||
    !!preparationNote?.trim() ||
    !!ritualIntent?.trim() ||
    !!ritualIdentityLine?.trim() ||
    !!ritualProcessDefinition?.trim() ||
    !!reflectionNote?.trim() ||
    tournamentComments.length > 0;

  const reflectionProse = hasAnyFreeText
    ? await requestVerdictReflection({
        classification: verdictClassification,
        evidenceSummary: verdictEvidence.map((e) => e.claim_text),
        frameworkStatus,
        behavioralProfileTrend,
        sessionIntention,
        preparationNote,
        ritualIntent,
        ritualIdentityLine,
        ritualProcessDefinition,
        tournamentComments,
        reflectionNote: reflectionNote ?? null,
      })
    : null;

  // 10. The single atomic write. Everything computed above (escalation
  // updates, dimension ratings, execution/outcome medals, net P&L, BRM
  // compliance, verdict classification/headline, coaching priorities
  // snapshot) is now RECOMPUTED inside perform_end_session itself from the
  // underlying rows — see 20260721040000_harden_and_recompute_perform_end_session.sql.
  // It is only computed here, client-side, so the evidence bullets above
  // and the verdict-prose rewrite step have something to describe; it is no
  // longer trusted as the authoritative result. Only genuinely
  // player-authored facts (tournament results, tagged mistakes) and the
  // evidence prose text itself still cross the RPC boundary as parameters.
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
    p_verdict_evidence: verdictEvidence,
    // p_behavioral_snapshot_id intentionally omitted — no Behavioral Profile
    // snapshotting is wired up yet, and the RPC defaults it to NULL server-side.
    // p_reflection_note is set whenever the player typed anything, independent
    // of whether p_reflection_prose above generated successfully — the
    // persistence fix for the raw reflection text lands even when the AI
    // pass is skipped or fails.
    p_reflection_note: reflectionNote?.trim() || undefined,
    p_reflection_prose: reflectionProse ?? undefined,
  });
  if (error) throw error;

  // perform_end_session returns jsonb, so the generated client type can only
  // say `Json` — cast once, here, to the shape the RPC actually returns
  // rather than scattering untyped property access below. These are the
  // server-recomputed, authoritative values — used below instead of the
  // client preview computed earlier in this function.
  const rpcResult = data as unknown as {
    verdict_id: string;
    execution_assessment_id: string;
    outcome_assessment_id: string;
    execution_medal: string;
    outcome_medal: string;
    verdict_classification: string;
    verdict_headline: string;
    final_pnl: number;
    dimension_ratings: { dimension: string; rating: string }[];
  };

  // Observability only, never a block: the client-side computation above
  // and the SQL port in perform_end_session implement the same algorithm
  // twice by necessity (the client needs a preview to build evidence text
  // before the RPC call exists). They should always agree; if they ever
  // don't, that's a sign the SQL port has drifted from
  // executionEngine.ts/escalationEngine.ts/outcomeEngine.ts/verdictEngine.ts
  // and is worth investigating, but the server's result is what's actually
  // persisted and immutable, so it's what gets shown regardless.
  if (
    rpcResult.execution_medal !== executionMedal ||
    rpcResult.outcome_medal !== outcomeMedal ||
    rpcResult.verdict_classification !== verdictClassification
  ) {
    console.warn('[endSession] server-recomputed result differs from client preview', {
      client: { executionMedal, outcomeMedal, verdictClassification },
      server: {
        executionMedal: rpcResult.execution_medal,
        outcomeMedal: rpcResult.outcome_medal,
        verdictClassification: rpcResult.verdict_classification,
      },
    });
  }

  return {
    sessionId,
    verdictId: rpcResult.verdict_id,
    executionAssessmentId: rpcResult.execution_assessment_id,
    outcomeAssessmentId: rpcResult.outcome_assessment_id,
    executionMedal: rpcResult.execution_medal,
    outcomeMedal: rpcResult.outcome_medal,
    verdictClassification: rpcResult.verdict_classification,
    verdictHeadline: rpcResult.verdict_headline,
    dimensionResults: rpcResult.dimension_ratings,
  };
}