// src/lib/coachDirectives.ts
//
// Coach Directives (read by escalationEngine.ts's/perform_end_session's
// "major/critical after coach directive" checks and deepAnalysis.ts's
// context assembly) — a directive is always about one specific Execution
// Action (execution_action_id FK) and, once issued, is scoped to that
// action's escalation track. Lives in EscalationConfigView, keyed off the
// currently-selected track's (player, execution action) pair rather than a
// standalone action picker, since a track only exists once that action has
// already escalated past baseline — exactly the precondition for a
// directive to have any effect at all.
//
// Retraction is soft (retracted_at), never a delete — same append-only
// evidence posture as Session Contract substitutions and escalation
// events elsewhere in this app. A retracted directive stays visible for
// audit but stops counting toward escalation going forward.

import { supabase } from './supabase';
import { PlayerId, ExecutionActionId } from '../types/ids';

export interface CoachDirectiveRow {
  id: string;
  directiveText: string;
  createdAt: string | null;
  retractedAt: string | null;
}

export async function fetchDirectivesForTrack(
  playerId: PlayerId,
  executionActionId: ExecutionActionId
): Promise<CoachDirectiveRow[]> {
  const { data, error } = await supabase
    .from('coach_directives')
    .select('id, directive_text, created_at, retracted_at')
    .eq('player_id', playerId)
    .eq('execution_action_id', executionActionId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((d) => ({
    id: d.id,
    directiveText: d.directive_text,
    createdAt: d.created_at,
    retractedAt: d.retracted_at,
  }));
}

export async function createCoachDirective(params: {
  playerId: PlayerId;
  executionActionId: ExecutionActionId;
  directiveText: string;
}): Promise<void> {
  const { error } = await supabase.from('coach_directives').insert({
    player_id: params.playerId,
    execution_action_id: params.executionActionId,
    directive_text: params.directiveText,
  });
  if (error) throw error;
}

export async function retractCoachDirective(directiveId: string): Promise<void> {
  const { error } = await supabase
    .from('coach_directives')
    .update({ retracted_at: new Date().toISOString() })
    .eq('id', directiveId)
    .is('retracted_at', null);
  if (error) throw error;
}
