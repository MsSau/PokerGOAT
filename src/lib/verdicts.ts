// src/lib/verdicts.ts — data access for Verdicts (PRD §13).
// Verdict classification/headline are computed deterministically in
// verdictEngine.ts and written once, immutably, by perform_end_session.
// This module reads them back for display: the player's latest current
// Verdict, a browsable history, and the full evidence breakdown per Verdict
// Card section (§2.10) — five bullet-list/single-line sections stored one
// row per bullet in verdict_evidence_items, populated by endSession.ts.

import { supabase } from './supabase';
import { Database } from '../types/database';
import {
  PlayerId, VerdictId, SessionId,
  asVerdictId, asSessionId,
} from '../types/ids';

export type VerdictClassification = Database['public']['Enums']['verdict_classification'];

// Mirrors verdict_evidence_items' CHECK constraints exactly (the generated
// client types this column as plain `string` since Postgres CHECK
// constraints don't surface as enums).
export type VerdictEvidenceSection = 'WHAT_WENT_WELL' | 'WHERE_FAILED' | 'PATTERN_CHECK' | 'OUTCOME_REALITY' | 'NEXT_STANDARD';
export type EvidenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface LatestVerdict {
  id: VerdictId;
  sessionId: SessionId;
  classification: VerdictClassification;
  headline: string;
  createdAt: string | null;
}

export interface VerdictEvidenceItem {
  id: string;
  section: VerdictEvidenceSection;
  claimText: string;
  confidenceLevel: EvidenceConfidence;
  evidenceEntityType: string;
  evidenceEntityId: string;
  createdAt: string | null;
}

export interface VerdictDetail extends LatestVerdict {
  evidenceBySection: Record<VerdictEvidenceSection, VerdictEvidenceItem[]>;
  // AI-generated closing paragraph, synthesized once at finalize time from
  // this Verdict's evidence plus the player's own free text (see
  // server.ts's POST /api/verdict-reflection) — null whenever the player
  // left every free-text source blank that session, or generation failed.
  // Not itself an Evidence Chip claim — see VerdictsView.tsx's ReflectionSection.
  reflectionProse: string | null;
}

export const EMPTY_EVIDENCE_BY_SECTION: Record<VerdictEvidenceSection, VerdictEvidenceItem[]> = {
  WHAT_WENT_WELL: [],
  WHERE_FAILED: [],
  PATTERN_CHECK: [],
  OUTCOME_REALITY: [],
  NEXT_STANDARD: [],
};

// PRD §2.10's fixed Verdict Card order and per-section presentation:
// sections 2-4 are bullet lists (one Evidence Chip per bullet), 5-6 are each
// a single line. `bullets: false` sections should render evidenceItems[0]
// only, never a list.
export const VERDICT_CARD_SECTIONS: {
  key: VerdictEvidenceSection;
  title: string;
  bullets: boolean;
}[] = [
  { key: 'WHAT_WENT_WELL', title: 'What You Did Well', bullets: true },
  { key: 'WHERE_FAILED', title: 'Where You Failed the Standard', bullets: true },
  { key: 'PATTERN_CHECK', title: 'Pattern Check', bullets: true },
  { key: 'OUTCOME_REALITY', title: 'Outcome Reality Check', bullets: false },
  { key: 'NEXT_STANDARD', title: 'Next Standard', bullets: false },
];

// PRD §13 classifications, judged on process quality — never a proxy for
// P&L sign, so this never shares a color channel with money (see CLAUDE.md's
// "money and medals never share a color channel" rule).
export const CLASSIFICATION_TONE: Record<VerdictClassification, string> = {
  PROFESSIONAL_WIN: 'text-signal-process',
  PROFESSIONAL_LOSS: 'text-signal-process',
  LUCKY_ESCAPE: 'text-signal-risk',
  DESERVED_LOSS: 'text-signal-risk',
  MIXED_SESSION: 'text-signal-caution',
  INSUFFICIENT_EVIDENCE: 'text-text-muted',
};

export async function fetchLatestVerdict(playerId: PlayerId): Promise<LatestVerdict | null> {
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'FINALIZED')
    .order('start_time', { ascending: false })
    .limit(50);
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  if (sessionIds.length === 0) return null;

  const { data, error } = await supabase
    .from('verdicts')
    .select('id, session_id, classification, headline, created_at')
    .in('session_id', sessionIds)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: asVerdictId(data.id),
    sessionId: asSessionId(data.session_id),
    classification: data.classification,
    headline: data.headline,
    createdAt: data.created_at,
  };
}

/** Every current Verdict for this player, newest first — the Verdicts tab's browsable timeline. */
export async function fetchVerdictHistory(playerId: PlayerId, limit = 30): Promise<LatestVerdict[]> {
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'FINALIZED')
    .order('start_time', { ascending: false })
    .limit(200);
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('verdicts')
    .select('id, session_id, classification, headline, created_at')
    .in('session_id', sessionIds)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data || []).map((row) => ({
    id: asVerdictId(row.id),
    sessionId: asSessionId(row.session_id),
    classification: row.classification,
    headline: row.headline,
    createdAt: row.created_at,
  }));
}

/**
 * One Verdict plus its full evidence breakdown, grouped by Verdict Card
 * section. Verdicts finalized before endSession.ts populated all five
 * sections will simply have empty arrays for the sections that weren't
 * written at the time — Verdicts are immutable, so this is never backfilled.
 */
export async function fetchVerdictDetail(verdictId: VerdictId): Promise<VerdictDetail | null> {
  const { data: verdict, error: vErr } = await supabase
    .from('verdicts')
    .select('id, session_id, classification, headline, created_at, reflection_prose')
    .eq('id', verdictId)
    .maybeSingle();
  if (vErr) throw vErr;
  if (!verdict) return null;

  const { data: items, error: eErr } = await supabase
    .from('verdict_evidence_items')
    .select('id, section, claim_text, confidence_level, evidence_entity_type, evidence_entity_id, created_at')
    .eq('verdict_id', verdictId)
    .order('created_at', { ascending: true });
  if (eErr) throw eErr;

  const evidenceBySection: Record<VerdictEvidenceSection, VerdictEvidenceItem[]> = {
    WHAT_WENT_WELL: [],
    WHERE_FAILED: [],
    PATTERN_CHECK: [],
    OUTCOME_REALITY: [],
    NEXT_STANDARD: [],
  };
  for (const row of items || []) {
    const section = row.section as VerdictEvidenceSection;
    if (!(section in evidenceBySection)) continue; // defensive: ignore any unexpected section value rather than crash
    evidenceBySection[section].push({
      id: row.id,
      section,
      claimText: row.claim_text,
      confidenceLevel: row.confidence_level as EvidenceConfidence,
      evidenceEntityType: row.evidence_entity_type,
      evidenceEntityId: row.evidence_entity_id,
      createdAt: row.created_at,
    });
  }

  return {
    id: asVerdictId(verdict.id),
    sessionId: asSessionId(verdict.session_id),
    classification: verdict.classification,
    headline: verdict.headline,
    createdAt: verdict.created_at,
    evidenceBySection,
    reflectionProse: verdict.reflection_prose,
  };
}

export interface MistakeOccurrence {
  id: string;
  actionName: string;
  severity: string;
  occurredAt: string | null;
  tournamentName: string | null;
}

/**
 * The raw list behind "Where You Failed the Standard" — every execution
 * action occurrence tagged or detected this session (both SYSTEM_DETECTED
 * compliance flags and PLAYER_TAGGED mistakes), regardless of severity or
 * hard-gate status. Deliberately NOT filtered to is_non_compliant/
 * hard_gate_triggered — those two columns exist to drive coach-alert
 * surfaces (coachBrief.ts's Critical Alerts, coachRoster.ts's roster
 * flagging), a narrower, different concern than "what did the player
 * actually get tagged for this session," which is what this link is for.
 * Fetched lazily by VerdictsView.tsx's "View mistakes" link, not as part
 * of fetchVerdictDetail — most Verdict views never need this list, so it
 * stays a separate, on-demand query.
 */
export async function fetchSessionMistakes(sessionId: SessionId): Promise<MistakeOccurrence[]> {
  const { data, error } = await supabase
    .from('execution_action_occurrences')
    .select('id, occurred_at, execution_actions(name, base_severity), tournaments(name)')
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });
  if (error) throw error;

  return (data || []).map((row) => {
    // execution_action_id / tournament_id are both FKs on this table, but
    // the generated client still types the joined relation as an array
    // (isOneToOne: false) — same flattening pattern coachBrief.ts already
    // uses for this exact join.
    const action = Array.isArray(row.execution_actions) ? row.execution_actions[0] : row.execution_actions;
    const tournament = Array.isArray(row.tournaments) ? row.tournaments[0] : row.tournaments;
    return {
      id: row.id,
      actionName: action?.name ?? 'Unknown action',
      severity: action?.base_severity ?? 'MINOR',
      occurredAt: row.occurred_at,
      tournamentName: tournament?.name ?? null,
    };
  });
}
