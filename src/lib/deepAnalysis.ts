// src/lib/deepAnalysis.ts — data access + orchestration for Deep Analysis
// (PRD §14 / §2.11): the player-initiated, conversational "Go Deeper"
// action beneath a Verdict Card. This module assembles context from data
// the player already has RLS-scoped read access to (Verdict evidence,
// Behavioral Profile, Coach Directive) and calls server.ts's
// POST /api/deep-analysis, which is the only place GEMINI_API_KEY is used.
// Message persistence happens here, client-side, through the normal
// Supabase client — never on the server, which stays stateless.

import { supabase } from './supabase';
import { fetchBehavioralProfile } from './behavioralProfile';
import { DIMENSION_LABELS } from './behavioralProfileEngine';
import { VerdictDetail } from './verdicts';
import { Database } from '../types/database';
import {
  PlayerId, CoachId, VerdictId, DeepAnalysisThreadId,
  asDeepAnalysisThreadId,
} from '../types/ids';

export type SenderType = Database['public']['Enums']['sender_type'];

export interface DeepAnalysisMessage {
  id: string;
  threadId: DeepAnalysisThreadId;
  senderType: SenderType;
  content: string;
  createdAt: string | null;
}

export interface DeepAnalysisContext {
  verdictHeadline?: string;
  verdictClassification?: string;
  evidenceSummary?: string[];
  behavioralSummary?: string[];
  coachDirective?: string | null;
}

const EVIDENCE_SUMMARY_CAP = 15;

/** Builds the context payload sent to the server — everything here is already something the player can read via RLS. */
export async function assembleDeepAnalysisContext(playerId: PlayerId, verdict: VerdictDetail): Promise<DeepAnalysisContext> {
  const evidenceSummary = Object.values(verdict.evidenceBySection)
    .flat()
    .map((item) => item.claimText)
    .slice(0, EVIDENCE_SUMMARY_CAP);

  const [profiles, directiveRes] = await Promise.all([
    fetchBehavioralProfile(playerId).catch((): Awaited<ReturnType<typeof fetchBehavioralProfile>> => []),
    supabase
      .from('coach_directives')
      .select('directive_text')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const behavioralSummary = profiles
    .filter((p) => p.state !== 'NOT_CURRENTLY_OBSERVABLE')
    .map((p) => `${DIMENSION_LABELS[p.dimension]}: ${p.state}${p.radarIndex !== null ? ` (${p.radarIndex})` : ''}`);

  return {
    verdictHeadline: verdict.headline,
    verdictClassification: verdict.classification,
    evidenceSummary,
    behavioralSummary,
    coachDirective: directiveRes.data?.directive_text ?? null,
  };
}

/** One open thread per Verdict — reuses an existing one if the player already opened Deep Analysis for this Verdict. */
export async function fetchOrCreateThreadForVerdict(playerId: PlayerId, coachId: CoachId, verdictId: VerdictId): Promise<DeepAnalysisThreadId> {
  const { data: existing, error: findErr } = await supabase
    .from('deep_analysis_threads')
    .select('id')
    .eq('player_id', playerId)
    .eq('verdict_id', verdictId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return asDeepAnalysisThreadId(existing.id);

  const { data: created, error: createErr } = await supabase
    .from('deep_analysis_threads')
    .insert({ player_id: playerId, coach_id: coachId, verdict_id: verdictId })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return asDeepAnalysisThreadId(created.id);
}

/**
 * Read-only lookup for the coach-side viewer — unlike fetchOrCreateThreadForVerdict,
 * this never creates a thread. A coach opening a session that the player
 * never used "Go Deeper" on should see "no conversation yet", not silently
 * create an empty thread just by looking.
 */
export async function fetchThreadForVerdict(playerId: PlayerId, verdictId: VerdictId): Promise<DeepAnalysisThreadId | null> {
  const { data, error } = await supabase
    .from('deep_analysis_threads')
    .select('id')
    .eq('player_id', playerId)
    .eq('verdict_id', verdictId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? asDeepAnalysisThreadId(data.id) : null;
}

export async function fetchThreadMessages(threadId: DeepAnalysisThreadId): Promise<DeepAnalysisMessage[]> {
  const { data, error } = await supabase
    .from('deep_analysis_messages')
    .select('id, thread_id, sender_type, content, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    threadId: asDeepAnalysisThreadId(row.thread_id),
    senderType: row.sender_type,
    content: row.content,
    createdAt: row.created_at,
  }));
}

async function insertMessage(threadId: DeepAnalysisThreadId, senderType: SenderType, content: string): Promise<DeepAnalysisMessage> {
  const { data, error } = await supabase
    .from('deep_analysis_messages')
    .insert({ thread_id: threadId, sender_type: senderType, content })
    .select('id, thread_id, sender_type, content, created_at')
    .single();
  if (error) throw error;
  return { id: data.id, threadId: asDeepAnalysisThreadId(data.thread_id), senderType: data.sender_type, content: data.content, createdAt: data.created_at };
}

export interface SendMessageResult {
  playerMessage: DeepAnalysisMessage;
  aiMessage: DeepAnalysisMessage | null;
  aiError: string | null;
}

/**
 * Persists the player's message immediately (truthful logging — it happened
 * regardless of what the AI does next), then requests a reply. If the
 * model call fails, the player's message stays persisted and aiMessage is
 * null with aiError set, so the UI can show a retry affordance rather than
 * losing what was typed.
 */
export async function sendDeepAnalysisMessage(
  threadId: DeepAnalysisThreadId,
  priorHistory: DeepAnalysisMessage[],
  content: string,
  context: DeepAnalysisContext,
): Promise<SendMessageResult> {
  const playerMessage = await insertMessage(threadId, 'PLAYER', content);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { playerMessage, aiMessage: null, aiError: 'Not signed in.' };
  }

  try {
    const res = await fetch('/api/deep-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        // priorHistory only — the new player turn is sent separately as
        // `message` and the server appends it itself; including it here
        // too would duplicate it in the model's conversation.
        history: priorHistory
          .filter((m) => m.senderType !== 'SYSTEM')
          .map((m) => ({ role: m.senderType === 'PLAYER' ? 'user' : 'model', text: m.content })),
        message: content,
        context,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { playerMessage, aiMessage: null, aiError: body.error || 'Deep Analysis is unavailable right now.' };
    }
    const { reply } = (await res.json()) as { reply: string };
    const aiMessage = await insertMessage(threadId, 'AI', reply);
    return { playerMessage, aiMessage, aiError: null };
  } catch {
    return { playerMessage, aiMessage: null, aiError: 'Deep Analysis is unavailable right now.' };
  }
}
