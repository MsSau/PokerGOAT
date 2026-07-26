// src/lib/verdictProse.ts — client-side call to the server's
// POST /api/verdict-prose route (server.ts), which rewrites already-computed
// deterministic Verdict evidence bullets into coach-voiced prose via Gemini.
//
// This function NEVER throws and NEVER blocks session finalization — any
// failure (network, non-200, malformed/mismatched-shape response) resolves
// to null, and the caller (endSession.ts) keeps its own deterministic text.
// AI here can only improve wording; it is structurally incapable of adding,
// removing, or reasoning about evidence, since the server rejects any
// response whose bullet counts don't match what was sent.

import { supabase } from './supabase';

export interface VerdictProseFacts {
  classification: string;
  whatWentWell: string[];
  whereFailed: string[];
  patternCheck: string[];
  outcomeReality: string;
  nextStandard: string;
}

export interface VerdictProseResult {
  whatWentWell: string[];
  whereFailed: string[];
  patternCheck: string[];
  outcomeReality: string;
  nextStandard: string;
}

export async function requestVerdictProse(facts: VerdictProseFacts): Promise<VerdictProseResult | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return null;

    const res = await fetch('/api/verdict-prose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(facts),
    });
    if (!res.ok) return null;

    const parsed = (await res.json()) as Partial<VerdictProseResult>;
    if (
      !Array.isArray(parsed.whatWentWell) || parsed.whatWentWell.length !== facts.whatWentWell.length ||
      !Array.isArray(parsed.whereFailed) || parsed.whereFailed.length !== facts.whereFailed.length ||
      !Array.isArray(parsed.patternCheck) || parsed.patternCheck.length !== facts.patternCheck.length ||
      typeof parsed.outcomeReality !== 'string' ||
      typeof parsed.nextStandard !== 'string'
    ) {
      return null;
    }
    return parsed as VerdictProseResult;
  } catch {
    return null;
  }
}
