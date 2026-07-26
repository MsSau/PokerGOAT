// src/components/EscalationConfigView.tsx
//
// Coach-only Behavioral Escalation Engine screen (PRD §12 / §3.3). The
// 8-stage total ordering always renders as one horizontal ladder, never
// per-severity lists. Below it: every active track across the coach's
// roster (list, left third) and the selected track's immutable event
// history plus the mandatory-reason override control (detail panel, right
// two-thirds).
//
// Next to Override sits an "Assign Intervention" / "Intervention Assigned"
// control, linking this screen to the Interventions tab: clicking it calls
// onAssignIntervention (CoachShell owns the resulting prefill state) to
// switch tabs with the selected track's player + Execution Action already
// selected in Assignments, rather than making the coach re-pick both there.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, ArrowRight, History, Search, ShieldAlert, Send, Undo2 } from 'lucide-react';
import {
  fetchTracksForCoach,
  fetchEventsForTrack,
  overrideEscalationStage,
  ESCALATION_LADDER,
  MANDATORY_REVIEW_STAGE,
  stageLabel,
  EscalationTrackWithContext,
} from '../lib/escalationConfig';
import { fetchAssignmentsForCoach } from '../lib/interventions';
import { fetchDirectivesForTrack, createCoachDirective, retractCoachDirective, CoachDirectiveRow } from '../lib/coachDirectives';
import { EscalationEvent } from '../types';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';
import ReasonModal from './ReasonModal';
import { CoachId, PlayerId, ExecutionActionId, asEscalationTrackId, asPlayerId, asExecutionActionId } from '../types/ids';

interface Props {
  coachId: CoachId;
  onAssignIntervention?: (playerId: PlayerId, executionActionId: ExecutionActionId) => void;
}

const TIER_DOT: Record<string, string> = {
  BASELINE: 'bg-text-faint',
  MINOR: 'bg-signal-caution/60',
  MAJOR: 'bg-signal-caution',
  CRITICAL: 'bg-signal-risk',
};

export default function EscalationConfigView({ coachId, onAssignIntervention }: Props) {
  const { data: tracks, loading, error, reload } = useAsync(() => fetchTracksForCoach(coachId), [coachId]);
  const { data: assignments } = useAsync(() => fetchAssignmentsForCoach(coachId), [coachId]);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<EscalationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [overrideStage, setOverrideStage] = useState<number>(0);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [directives, setDirectives] = useState<CoachDirectiveRow[]>([]);
  const [directivesLoading, setDirectivesLoading] = useState(false);
  const [directiveText, setDirectiveText] = useState('');
  const [savingDirective, setSavingDirective] = useState(false);
  const [retractingId, setRetractingId] = useState<string | null>(null);

  const selected = useMemo(() => tracks?.find((t) => t.id === selectedId) ?? null, [tracks, selectedId]);

  const hasActiveAssignment = useMemo(() => {
    if (!selected) return false;
    return (assignments || []).some(
      (a) => a.player_id === selected.player_id && a.execution_action_id === selected.execution_action_id && a.status === 'ASSIGNED',
    );
  }, [assignments, selected]);

  useEffect(() => {
    if (selected) setOverrideStage(selected.current_stage_index);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    setEventsLoading(true);
    fetchEventsForTrack(asEscalationTrackId(selected.id))
      .then((e) => alive && setEvents(e))
      .catch((err) => alive && setActionError(getErrorMessage(err)))
      .finally(() => alive && setEventsLoading(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  const reloadDirectives = () => {
    if (!selected) return;
    setDirectivesLoading(true);
    fetchDirectivesForTrack(asPlayerId(selected.player_id), asExecutionActionId(selected.execution_action_id))
      .then(setDirectives)
      .catch((err) => setActionError(getErrorMessage(err)))
      .finally(() => setDirectivesLoading(false));
  };

  useEffect(() => {
    setDirectiveText('');
    if (!selected) {
      setDirectives([]);
      return;
    }
    let alive = true;
    setDirectivesLoading(true);
    fetchDirectivesForTrack(asPlayerId(selected.player_id), asExecutionActionId(selected.execution_action_id))
      .then((d) => alive && setDirectives(d))
      .catch((err) => alive && setActionError(getErrorMessage(err)))
      .finally(() => alive && setDirectivesLoading(false));
    return () => {
      alive = false;
    };
  }, [selected]);

  const handleAddDirective = async () => {
    if (!selected || !directiveText.trim()) return;
    setSavingDirective(true);
    setActionError(null);
    try {
      await createCoachDirective({
        playerId: asPlayerId(selected.player_id),
        executionActionId: asExecutionActionId(selected.execution_action_id),
        directiveText: directiveText.trim(),
      });
      setDirectiveText('');
      reloadDirectives();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSavingDirective(false);
    }
  };

  const handleRetractDirective = async (directiveId: string) => {
    setRetractingId(directiveId);
    setActionError(null);
    try {
      await retractCoachDirective(directiveId);
      reloadDirectives();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setRetractingId(null);
    }
  };

  const filteredTracks = useMemo(() => {
    if (!tracks) return [];
    const q = search.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((t) => t.player_email.toLowerCase().includes(q) || t.action_name.toLowerCase().includes(q));
  }, [tracks, search]);

  async function handleOverride(reason: string) {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await overrideEscalationStage(selected, overrideStage, reason);
      await reload();
      setReasonModalOpen(false);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 8-stage horizontal ladder */}
      <div className="bg-surface border border-border rounded-[6px] p-4 overflow-x-auto">
        <div className="flex items-stretch gap-1 min-w-[720px]">
          {ESCALATION_LADDER.map((stage) => (
            <div key={stage.index} className="flex-1 flex flex-col gap-1.5">
              <div className={`h-1.5 rounded-full ${TIER_DOT[stage.tier]}`} />
              <span className="text-10 font-mono text-text-faint">{stage.index}</span>
              <span className="text-11 text-text-primary font-medium leading-tight">{stage.label}</span>
              {stage.index === MANDATORY_REVIEW_STAGE && (
                <span className="text-10 text-signal-risk font-mono flex items-center gap-1">
                  <AlertOctagon size={10} /> Mandatory review
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden animate-fade-in font-sans min-h-[480px]">
        {/* LIST — left third */}
        <div className="w-1/3 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Active Tracks</span>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player or action..."
                className="w-full bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] pl-7 pr-2.5 py-1.5 text-12 text-text-primary placeholder:text-text-faint transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-4 text-12 text-text-muted">Loading tracks...</div>}
            {error && <div className="p-4 text-12 text-signal-risk">{error}</div>}
            {!loading && !error && filteredTracks.length === 0 && (
              <div className="p-4 text-12 text-text-faint italic">No active escalation tracks on your roster.</div>
            )}
            {filteredTracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3.5 border-b border-border/60 transition-colors cursor-pointer ${
                  selectedId === t.id ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT[stageTierFor(t.current_stage_index)]}`} />
                  <span className="text-13 text-text-primary font-medium truncate">{t.player_email.split('@')[0]}</span>
                  {t.current_stage_index >= MANDATORY_REVIEW_STAGE && <ShieldAlert size={12} className="text-signal-risk shrink-0 ml-auto" />}
                </div>
                <span className="text-12 text-text-muted block mt-0.5 truncate">{t.action_name}</span>
                <span className="text-11 font-mono text-text-faint">{stageLabel(t.current_stage_index)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* DETAIL — right two-thirds */}
        <div className="w-2/3 flex flex-col p-6 overflow-y-auto">
          {actionError && (
            <div className="mb-4 bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{actionError}</div>
          )}

          {!selected && <div className="flex-1 flex items-center justify-center text-13 text-text-faint">Select a track to review its history.</div>}

          {selected && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <span className="text-14 font-semibold text-text-primary">{selected.player_email.split('@')[0]} — {selected.action_name}</span>
                <span className="text-12 text-text-muted">{selected.action_dimension.replace(/_/g, ' ')} · Current: {stageLabel(selected.current_stage_index)}</span>
              </div>

              {selected.current_stage_index >= MANDATORY_REVIEW_STAGE && (
                <div className="bg-signal-risk/10 border border-signal-risk/30 rounded-[6px] p-3 flex items-center gap-2.5">
                  <AlertOctagon size={15} className="text-signal-risk shrink-0" />
                  <span className="text-12 text-signal-risk font-medium">Critical Stage 4 — mandatory human coach review.</span>
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Override Stage</label>
                  <select
                    value={overrideStage}
                    onChange={(e) => setOverrideStage(Number(e.target.value))}
                    className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
                  >
                    {ESCALATION_LADDER.map((s) => (
                      <option key={s.index} value={s.index}>{s.index} — {s.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={overrideStage === selected.current_stage_index || saving}
                  onClick={() => setReasonModalOpen(true)}
                  className="px-4 py-2.5 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
                >
                  Apply Override
                </button>
                {onAssignIntervention && (
                  <button
                    type="button"
                    onClick={() => onAssignIntervention(asPlayerId(selected.player_id), asExecutionActionId(selected.execution_action_id))}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded text-12 font-semibold transition-colors cursor-pointer border ${
                      hasActiveAssignment
                        ? 'border-signal-process/30 bg-signal-process/10 text-signal-process hover:bg-signal-process/15'
                        : 'border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10'
                    }`}
                  >
                    {hasActiveAssignment ? 'Intervention Assigned' : 'Assign Intervention'} <ArrowRight size={12} />
                  </button>
                )}
              </div>

              {/* Coach Directives — scoped to this exact (player, action)
                  track, not a general note. A track only exists once this
                  action has already escalated past baseline, which is
                  exactly the precondition for a directive to matter: its
                  only effect is on the NEXT repeat's escalation stage
                  (major_after_coach_directive / critical_after_coaching_
                  or_intervention in evaluateEscalationTransition). */}
              <div className="flex flex-col gap-2">
                <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Coach Directives</span>
                {directivesLoading && <span className="text-12 text-text-muted">Loading...</span>}
                {!directivesLoading && directives.length === 0 && (
                  <span className="text-12 text-text-faint italic">No directives issued for this action yet.</span>
                )}
                {!directivesLoading &&
                  directives.map((d) => (
                    <div
                      key={d.id}
                      className={`border rounded-[6px] p-3 flex items-start justify-between gap-3 ${d.retractedAt ? 'border-border/50 opacity-60' : 'border-border'}`}
                    >
                      <div className="flex flex-col gap-1">
                        <span className={`text-13 ${d.retractedAt ? 'text-text-muted line-through' : 'text-text-primary'}`}>{d.directiveText}</span>
                        <span className="text-11 font-mono text-text-faint">
                          {d.createdAt ? new Date(d.createdAt).toLocaleString() : '—'}
                          {d.retractedAt && ` · Retracted ${new Date(d.retractedAt).toLocaleString()}`}
                        </span>
                      </div>
                      {!d.retractedAt && (
                        <button
                          type="button"
                          disabled={retractingId === d.id}
                          onClick={() => handleRetractDirective(d.id)}
                          className="flex items-center gap-1 text-11 font-mono px-2 py-1 rounded-[4px] border border-border text-text-muted hover:text-signal-risk hover:border-signal-risk/40 transition-colors shrink-0 disabled:opacity-40"
                        >
                          <Undo2 size={11} /> {retractingId === d.id ? 'Retracting…' : 'Retract'}
                        </button>
                      )}
                    </div>
                  ))}
                <div className="flex items-end gap-2 pt-1">
                  <textarea
                    rows={2}
                    value={directiveText}
                    onChange={(e) => setDirectiveText(e.target.value)}
                    placeholder="e.g. Stop playing past your stop-loss — we agreed on this last week."
                    className="flex-1 bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] p-2.5 text-13 text-text-primary placeholder:text-text-faint transition-colors"
                  />
                  <button
                    type="button"
                    disabled={!directiveText.trim() || savingDirective}
                    onClick={handleAddDirective}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded text-12 font-semibold border border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    <Send size={12} /> {savingDirective ? 'Issuing…' : 'Issue Directive'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <History size={12} /> Event History
                </span>
                {eventsLoading && <span className="text-12 text-text-muted">Loading...</span>}
                {!eventsLoading && events.length === 0 && <span className="text-12 text-text-faint italic">No events recorded yet.</span>}
                {!eventsLoading &&
                  events.map((e) => (
                    <div key={e.id} className={`border rounded-[6px] p-3 flex flex-col gap-1 ${e.is_override ? 'border-signal-caution/30' : 'border-border'}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-12 font-mono text-text-primary">
                          {stageLabel(e.old_stage)} → {stageLabel(e.new_stage)}
                        </span>
                        {e.is_override && <span className="text-10 font-mono text-signal-caution uppercase">Coach Override</span>}
                        {!e.is_override && e.new_stage < e.old_stage && (
                          <span className="text-10 font-mono text-text-muted uppercase">De-escalation</span>
                        )}
                        <span className="text-11 text-text-faint ml-auto">{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</span>
                      </div>
                      {Array.isArray(e.satisfied_conditions) && e.satisfied_conditions.length > 0 && (
                        <span className="text-11 text-text-muted font-mono">{(e.satisfied_conditions as string[]).join(', ')}</span>
                      )}
                      {e.reason && <p className="text-12 text-text-primary mt-1">{e.reason}</p>}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {reasonModalOpen && selected && (
        <ReasonModal
          title="Overriding an Escalation Stage"
          description="This changes the player's live escalation track. The prior stage, new stage, and this reason are stored permanently as a new event referencing the one it supersedes."
          confirmLabel="Apply Override"
          submitting={saving}
          onConfirm={handleOverride}
          onCancel={() => setReasonModalOpen(false)}
        />
      )}
    </div>
  );
}

function stageTierFor(index: number): string {
  return ESCALATION_LADDER.find((s) => s.index === index)?.tier ?? 'BASELINE';
}
