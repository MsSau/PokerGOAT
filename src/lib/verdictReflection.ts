// src/lib/verdictReflection.ts — client-side call to the server's
// POST /api/verdict-reflection route (server.ts), which synthesizes the
// Verdict Card's closing "AI Reflection" paragraph from the deterministic
// Verdict evidence plus several pieces of free text the player typed
// earlier in the flow (Preparation note, Pre-Game Ritual answers, Session
// Contract intention, tournament comments, end-of-session reflection).
//
// This function NEVER throws and NEVER blocks session finalization — any
// failure (network, non-200, malformed response) resolves to null, and the
// caller (endSession.ts) simply omits the section (unlike verdict-prose,
// there is no deterministic fallback text for this section — it either
// renders or it doesn't).

import { supabase } from './supabase';

export interface VerdictReflectionFacts {
  classification: string;
  evidenceSummary: string[];
  // System-computed, not player-typed — Active Performance Framework and
  // Behavioral Profile trend are deliberately excluded from classification
  // itself (verdictEngine.ts); this AI Reflection pass is the only place
  // either ever reaches an AI prompt.
  frameworkStatus: string | null;
  behavioralProfileTrend: string[];
  sessionIntention: string | null;
  preparationNote: string | null;
  ritualIntent: string | null;
  ritualIdentityLine: string | null;
  ritualProcessDefinition: string | null;
  tournamentComments: string[];
  reflectionNote: string | null;
}

export async function requestVerdictReflection(facts: VerdictReflectionFacts): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;

    const res = await fetch('/api/verdict-reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        classification: facts.classification,
        evidenceSummary: facts.evidenceSummary,
        systemContext: {
          frameworkStatus: facts.frameworkStatus,
          behavioralProfileTrend: facts.behavioralProfileTrend,
        },
        freeText: {
          sessionIntention: facts.sessionIntention,
          preparationNote: facts.preparationNote,
          ritualIntent: facts.ritualIntent,
          ritualIdentityLine: facts.ritualIdentityLine,
          ritualProcessDefinition: facts.ritualProcessDefinition,
          tournamentComments: facts.tournamentComments,
          reflectionNote: facts.reflectionNote,
        },
      }),
    });
    if (!res.ok) return null;

    const parsed = (await res.json()) as Partial<{ reflection: string }>;
    if (typeof parsed.reflection !== 'string' || !parsed.reflection.trim()) return null;
    return parsed.reflection;
  } catch {
    return null;
  }
}
