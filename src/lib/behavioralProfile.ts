// src/lib/behavioralProfile.ts — data access for the Behavioral Profile
// (PRD §9). Pure scoring lives in behavioralProfileEngine.ts; this module
// just gathers real evidence points from tables that already exist:
//   - Preparation dimension  <- preparation_records.medal_tier
//   - Discipline/Process, Technical Play, Mental Game, Learning/Improvement
//     <- session_execution_dimension_assessments.final_rating (current
//        assessment only, for FINALIZED sessions)
//   - Outcomes dimension     <- session_outcome_assessments.system_outcome_medal
// Never a nested embed for the dimension-assessment fetch below — the
// assessment_id -> session_execution_assessments relationship type-resolves
// to an array in the generated client (isOneToOne: false, same caveat
// documented in sessionContract.ts), so two flat queries + a manual join are
// simpler and safer than fighting that in a single embedded select.

import { supabase } from './supabase';
import {
  computeBehavioralProfile,
  DimensionProfile,
  Dimension,
  EvidencePoint,
  EvidenceWindow,
  scoreForRating,
  scoreForMedal,
} from './behavioralProfileEngine';

export type {
  DimensionProfile,
  DimensionState,
  EvidenceWindow,
  DimensionEvidenceHighlight,
  BehavioralCategory,
  BehavioralCategoryResult,
} from './behavioralProfileEngine';
export { BEHAVIORAL_PROFILE_DIMENSIONS, BEHAVIORAL_CATEGORY_LABELS, computeBehavioralCategory } from './behavioralProfileEngine';

// Bounds "long-term" history to a sane fetch size rather than the player's
// entire lifetime — generous enough that trend/confidence never starve for
// data in practice.
const HISTORY_LIMIT = 120;

export async function fetchBehavioralProfile(playerId: string, forcedWindow?: EvidenceWindow): Promise<DimensionProfile[]> {
  const evidenceByDimension: Partial<Record<Dimension, EvidencePoint[]>> = {};

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id, start_time, preparation_id')
    .eq('player_id', playerId)
    .eq('status', 'FINALIZED')
    .order('start_time', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  const startTimeBySessionId = new Map((sessions || []).map((s) => [s.id, s.start_time]));

  if (sessionIds.length > 0) {
    const { data: assessments, error: aErr } = await supabase
      .from('session_execution_assessments')
      .select('id, session_id')
      .eq('is_current', true)
      .in('session_id', sessionIds);
    if (aErr) throw aErr;

    const sessionIdByAssessmentId = new Map((assessments || []).map((a) => [a.id, a.session_id]));
    const assessmentIds = (assessments || []).map((a) => a.id);

    if (assessmentIds.length > 0) {
      const { data: dims, error: dErr } = await supabase
        .from('session_execution_dimension_assessments')
        .select('assessment_id, dimension, final_rating')
        .in('assessment_id', assessmentIds);
      if (dErr) throw dErr;

      for (const row of dims || []) {
        const sessionId = sessionIdByAssessmentId.get(row.assessment_id);
        const occurredAt = sessionId ? startTimeBySessionId.get(sessionId) : null;
        if (!occurredAt) continue;
        const dim = row.dimension as Dimension;
        (evidenceByDimension[dim] ??= []).push({
          occurredAt,
          score: scoreForRating(row.final_rating),
          label: row.final_rating,
        });
      }
    }

    const { data: outcomes, error: oErr } = await supabase
      .from('session_outcome_assessments')
      .select('session_id, system_outcome_medal')
      .eq('is_current', true)
      .in('session_id', sessionIds);
    if (oErr) throw oErr;

    evidenceByDimension['OUTCOMES'] = (outcomes || [])
      .map((row): EvidencePoint | null => {
        const occurredAt = startTimeBySessionId.get(row.session_id);
        if (!occurredAt) return null;
        return { occurredAt, score: scoreForMedal(row.system_outcome_medal), label: row.system_outcome_medal };
      })
      .filter((e): e is EvidencePoint => e !== null);
  }

  // Scoped to preparation_records that were actually consumed by one of
  // this player's FINALIZED sessions (sessions.preparation_id), not every
  // row the player ever submitted — a Preparation Check-in that was
  // abandoned/superseded before ever starting a session (e.g. a re-do
  // after a failed submit) is not a real evidence point, the same way an
  // ACTIVE/REVIEW_PENDING session's data never leaks into any other
  // dimension's evidence above. occurredAt uses the session's own
  // start_time, matching every other dimension, rather than the
  // preparation_records row's own created_at.
  const preparationIdBySessionStart = new Map(
    (sessions || [])
      .filter((s): s is typeof s & { preparation_id: string } => !!s.preparation_id)
      .map((s) => [s.preparation_id, s.start_time])
  );
  const preparationIds = Array.from(preparationIdBySessionStart.keys());

  if (preparationIds.length > 0) {
    const { data: preps, error: pErr } = await supabase
      .from('preparation_records')
      .select('id, medal_tier')
      .in('id', preparationIds);
    if (pErr) throw pErr;

    evidenceByDimension['PREPARATION'] = (preps || [])
      .map((row): EvidencePoint | null => {
        const occurredAt = preparationIdBySessionStart.get(row.id);
        if (!occurredAt) return null;
        return { occurredAt, score: scoreForMedal(row.medal_tier), label: row.medal_tier };
      })
      .filter((e): e is EvidencePoint => e !== null);
  }

  return computeBehavioralProfile(evidenceByDimension, new Date(), forcedWindow);
}
