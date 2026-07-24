// src/lib/coachBrief.ts — data access for the per-player Weekly Coach
// Brief (PRD §21/3.1). Each section is its own small query, assembled by
// fetchWeeklyCoachBrief into one object. "Since Last Review" and
// "Suggested Agenda" are deterministic template text built from the real
// counts below — no AI call in this pass (nothing in this codebase calls
// an LLM yet).

import { supabase, fetchPlayerDashboardData } from './supabase';

const ALERT_LOOKBACK_DAYS = 14;

export interface CriticalAlertRow {
  id: string;
  actionName: string;
  severity: string;
  isHardGate: boolean;
  occurredAt: string;
}

export type RepeatOffenceTrend = 'WORSENING' | 'IMPROVING' | 'STABLE';

export interface RepeatOffenceRow {
  trackId: string;
  actionName: string;
  stage: number;
  trend: RepeatOffenceTrend;
  lastOccurrenceAt: string | null;
}

export interface LearningPriorityRow {
  id: string;
  description: string;
  status: string;
}

export interface WeeklyCoachBrief {
  sinceLastReview: string;
  criticalAlerts: CriticalAlertRow[];
  peoSummary: Awaited<ReturnType<typeof fetchPlayerDashboardData>>['sessions'];
  repeatOffences: RepeatOffenceRow[];
  learningImplementation: LearningPriorityRow[];
  aiConversationMessageCount: number;
  suggestedAgenda: string[];
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function computeSinceLastReview(playerId: string): Promise<string> {
  const { data: lastReview, error: rErr } = await supabase
    .from('coach_reviews')
    .select('created_at')
    .eq('player_id', playerId)
    .eq('status', 'LOCKED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) throw rErr;

  const since = lastReview?.created_at ?? daysAgoIso(7);

  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'FINALIZED')
    .gte('start_time', since);
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  let goldOutcomes = 0;
  if (sessionIds.length > 0) {
    const { data: outcomes, error: oErr } = await supabase
      .from('session_outcome_assessments')
      .select('system_outcome_medal')
      .in('session_id', sessionIds)
      .eq('is_current', true);
    if (oErr) throw oErr;
    goldOutcomes = (outcomes || []).filter((o) => o.system_outcome_medal === 'GOLD').length;
  }

  const windowPhrase = lastReview ? 'since your last review' : 'in the last 7 days (no prior review on record)';
  if (sessionIds.length === 0) return `No finalized sessions ${windowPhrase}.`;
  return `${sessionIds.length} session${sessionIds.length === 1 ? '' : 's'} ${windowPhrase}. ${goldOutcomes} GOLD outcome${goldOutcomes === 1 ? '' : 's'}.`;
}

async function fetchCriticalAlerts(playerId: string): Promise<CriticalAlertRow[]> {
  const { data: sessions, error: sErr } = await supabase
    .from('sessions')
    .select('id')
    .eq('player_id', playerId)
    .order('start_time', { ascending: false })
    .limit(50);
  if (sErr) throw sErr;

  const sessionIds = (sessions || []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data, error } = await supabase
    .from('execution_action_occurrences')
    .select('id, occurred_at, hard_gate_triggered, execution_actions(name, base_severity)')
    .in('session_id', sessionIds)
    .gte('occurred_at', daysAgoIso(ALERT_LOOKBACK_DAYS))
    .or('is_non_compliant.eq.true,hard_gate_triggered.eq.true')
    .order('occurred_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => {
    const action = Array.isArray(row.execution_actions) ? row.execution_actions[0] : row.execution_actions;
    return {
      id: row.id,
      actionName: action?.name ?? 'Unknown action',
      severity: action?.base_severity ?? 'MINOR',
      isHardGate: row.hard_gate_triggered,
      occurredAt: row.occurred_at,
    };
  });
}

async function fetchRepeatOffences(playerId: string): Promise<RepeatOffenceRow[]> {
  const { data: tracks, error } = await supabase
    .from('escalation_tracks')
    .select('id, current_stage_index, last_occurrence_at, execution_actions(name)')
    .eq('player_id', playerId)
    .gt('current_stage_index', 0)
    .order('current_stage_index', { ascending: false });
  if (error) throw error;

  const trackIds = (tracks || []).map((t) => t.id);
  const latestEventByTrack = new Map<string, { old_stage: number; new_stage: number }>();
  if (trackIds.length > 0) {
    const { data: events, error: eErr } = await supabase
      .from('escalation_events')
      .select('track_id, old_stage, new_stage, created_at')
      .in('track_id', trackIds)
      .order('created_at', { ascending: false });
    if (eErr) throw eErr;
    for (const ev of events || []) {
      if (!latestEventByTrack.has(ev.track_id)) latestEventByTrack.set(ev.track_id, ev);
    }
  }

  return (tracks || []).map((t) => {
    const action = Array.isArray(t.execution_actions) ? t.execution_actions[0] : t.execution_actions;
    const latestEvent = latestEventByTrack.get(t.id);
    const trend: RepeatOffenceTrend = !latestEvent
      ? 'STABLE'
      : latestEvent.new_stage > latestEvent.old_stage
        ? 'WORSENING'
        : latestEvent.new_stage < latestEvent.old_stage
          ? 'IMPROVING'
          : 'STABLE';
    return {
      trackId: t.id,
      actionName: action?.name ?? 'Unknown action',
      stage: t.current_stage_index,
      trend,
      lastOccurrenceAt: t.last_occurrence_at,
    };
  });
}

async function fetchLearningImplementation(playerId: string): Promise<LearningPriorityRow[]> {
  const { data: lastReview, error: rErr } = await supabase
    .from('coach_reviews')
    .select('id')
    .eq('player_id', playerId)
    .eq('status', 'LOCKED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) throw rErr;
  if (!lastReview) return [];

  const { data, error } = await supabase
    .from('coaching_priorities')
    .select('id, description, status')
    .eq('review_id', lastReview.id);
  if (error) throw error;
  return data || [];
}

async function fetchConversationMessageCount(playerId: string, coachId: string): Promise<number> {
  const { data: threads, error: tErr } = await supabase
    .from('deep_analysis_threads')
    .select('id')
    .eq('player_id', playerId)
    .eq('coach_id', coachId);
  if (tErr) throw tErr;

  const threadIds = (threads || []).map((t) => t.id);
  if (threadIds.length === 0) return 0;

  const { count, error: mErr } = await supabase
    .from('deep_analysis_messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', threadIds)
    .gte('created_at', daysAgoIso(ALERT_LOOKBACK_DAYS));
  if (mErr) throw mErr;
  return count ?? 0;
}

// PRD §21/3.1 item 11: "a short generated list... framed as 'Suggested —
// edit before the call'." Deterministic assembly from the sections already
// computed above, not an AI call (see file header).
function buildSuggestedAgenda(alerts: CriticalAlertRow[], offences: RepeatOffenceRow[]): string[] {
  const items: string[] = [];
  for (const a of alerts.slice(0, 2)) {
    items.push(`Review ${a.actionName}${a.isHardGate ? ' (hard gate triggered)' : ''} — ${new Date(a.occurredAt).toLocaleDateString()}.`);
  }
  for (const o of offences) {
    if (items.length >= 3) break;
    items.push(`Discuss repeat offence: ${o.actionName} (stage ${o.stage}).`);
  }
  if (items.length === 0) {
    items.push('No critical alerts or repeat offences this window — check in on general progress and Weekly Game Plan adherence.');
  }
  return items.slice(0, 3);
}

export async function fetchWeeklyCoachBrief(playerId: string, coachId: string): Promise<WeeklyCoachBrief> {
  const [sinceLastReview, criticalAlerts, dashboard, repeatOffences, learningImplementation, aiConversationMessageCount] =
    await Promise.all([
      computeSinceLastReview(playerId),
      fetchCriticalAlerts(playerId),
      fetchPlayerDashboardData(playerId),
      fetchRepeatOffences(playerId),
      fetchLearningImplementation(playerId),
      fetchConversationMessageCount(playerId, coachId),
    ]);

  return {
    sinceLastReview,
    criticalAlerts,
    peoSummary: dashboard.sessions,
    repeatOffences,
    learningImplementation,
    aiConversationMessageCount,
    suggestedAgenda: buildSuggestedAgenda(criticalAlerts, repeatOffences),
  };
}
