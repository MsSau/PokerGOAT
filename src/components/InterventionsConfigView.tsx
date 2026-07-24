// src/components/InterventionsConfigView.tsx
//
// Coach-only Intervention Engine screen (PRD §16 / §3.3): the coach-owned
// library — each item carrying a single min_escalation_stage, no severity
// tier (dropped: see PokerGOAT_PRD.md "## 22. Feature Updates" and
// src/lib/interventions.ts's header comment) — and manual assignment. No
// §3.3 "screen specifically" callout exists for Interventions, so this
// follows the generic shared layout with an internal section switcher
// instead of a single list/detail split.
//
// Load Management and the per-action Eligibility mapping this screen used
// to expose are both retired. Escalation-stage linkage now lives directly
// on the Library item (LibrarySection's "Min Escalation Stage" field
// below) instead of a separate mapping table, and Assignment is keyed off
// the player's live escalation tracks (AssignmentsSection's "Active Track"
// dropdown, sourced from escalationConfig.ts's fetchTracksForCoach) rather
// than a bare list of every Execution Action — the Intervention dropdown
// filters to items eligible at that track's current stage.
//
// prefillAssignment/onPrefillConsumed support jumping here directly from
// the Escalation screen's "Assign Intervention" button (see
// EscalationConfigView.tsx + CoachShell.tsx, which owns this state) with
// the player and track already selected.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, CheckCircle2, XCircle } from 'lucide-react';
import {
  fetchLibrary,
  createLibraryItem,
  updateLibraryItem,
  setLibraryItemActive,
  fetchAssignmentsForCoach,
  createManualAssignment,
  setAssignmentStatus,
  LibraryItemFields,
} from '../lib/interventions';
import { fetchTracksForCoach, ESCALATION_LADDER, stageLabel } from '../lib/escalationConfig';
import { fetchCoachRoster, CoachRosterEntry } from '../lib/coachRoster';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';

export interface AssignmentPrefill {
  playerId: string;
  executionActionId: string;
  token: number;
}

interface Props {
  coachId: string;
  prefillAssignment?: AssignmentPrefill | null;
  onPrefillConsumed?: () => void;
}

type Section = 'LIBRARY' | 'ASSIGNMENTS';

const emptyLibraryFields = (): LibraryItemFields => ({
  name: '',
  description: '',
  requirements: '',
  min_escalation_stage: 0,
});

export default function InterventionsConfigView({ coachId, prefillAssignment, onPrefillConsumed }: Props) {
  const [section, setSection] = useState<Section>('LIBRARY');

  useEffect(() => {
    if (prefillAssignment) setSection('ASSIGNMENTS');
  }, [prefillAssignment]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex bg-ink border border-border rounded-[6px] p-0.5 w-fit">
        {(
          [
            { key: 'LIBRARY', label: 'Library' },
            { key: 'ASSIGNMENTS', label: 'Assignments' },
          ] as { key: Section; label: string }[]
        ).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`px-3.5 py-1.5 rounded text-12 font-medium transition-colors cursor-pointer ${
              section === s.key ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'LIBRARY' && <LibrarySection coachId={coachId} />}
      {section === 'ASSIGNMENTS' && (
        <AssignmentsSection coachId={coachId} prefillAssignment={prefillAssignment} onPrefillConsumed={onPrefillConsumed} />
      )}
    </div>
  );
}

// --- Library -----------------------------------------------------------

function LibrarySection({ coachId }: { coachId: string }) {
  const { data: library, loading, error, reload } = useAsync(() => fetchLibrary(coachId), [coachId]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [fields, setFields] = useState<LibraryItemFields>(emptyLibraryFields());
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const selected = useMemo(() => library?.find((l) => l.id === selectedId) ?? null, [library, selectedId]);

  useEffect(() => {
    if (creatingNew) {
      setFields(emptyLibraryFields());
      return;
    }
    if (selected) {
      setFields({
        name: selected.name,
        description: selected.description,
        requirements: selected.requirements,
        min_escalation_stage: selected.min_escalation_stage,
      });
    }
  }, [selected, creatingNew]);

  const filtered = useMemo(() => {
    if (!library) return [];
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((l) => l.name.toLowerCase().includes(q));
  }, [library, search]);

  const fieldsValid = fields.name.trim().length > 0;
  const isNewRecordFlow = creatingNew || !selected;

  async function handleSave() {
    setActionError(null);
    setSaving(true);
    try {
      if (isNewRecordFlow) {
        const created = await createLibraryItem(coachId, fields);
        await reload();
        setCreatingNew(false);
        setSelectedId(created.id);
      } else {
        await updateLibraryItem(selected!.id, fields);
        await reload();
      }
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!selected) return;
    setSaving(true);
    try {
      await setLibraryItemActive(selected.id, !selected.is_active);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden animate-fade-in font-sans min-h-[520px]">
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setCreatingNew(true);
              setSelectedId(null);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Intervention
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search interventions..."
              className="w-full bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] pl-7 pr-2.5 py-1.5 text-12 text-text-primary placeholder:text-text-faint transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-12 text-text-muted">Loading...</div>}
          {error && <div className="p-4 text-12 text-signal-risk">{error}</div>}
          {!loading && filtered.length === 0 && <div className="p-4 text-12 text-text-faint italic">No interventions yet.</div>}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCreatingNew(false);
                setSelectedId(item.id);
              }}
              className={`w-full text-left p-3.5 border-b border-border/60 transition-colors cursor-pointer ${
                !creatingNew && selectedId === item.id ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-13 font-medium truncate ${item.is_active ? 'text-text-primary' : 'text-text-faint line-through'}`}>{item.name}</span>
              </div>
              <span className="text-11 font-mono text-text-faint">stage {item.min_escalation_stage}+</span>
            </button>
          ))}
        </div>
      </div>

      <div className="w-2/3 flex flex-col p-6 gap-4 overflow-y-auto">
        {actionError && <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{actionError}</div>}
        {!isNewRecordFlow && !selected && <div className="flex-1 flex items-center justify-center text-13 text-text-faint">Select an intervention to edit it.</div>}

        {(isNewRecordFlow || selected) && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Name</label>
              <input
                type="text"
                value={fields.name}
                onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Min Escalation Stage</label>
              <select
                value={fields.min_escalation_stage}
                onChange={(e) => setFields((f) => ({ ...f, min_escalation_stage: Number(e.target.value) }))}
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
              >
                {ESCALATION_LADDER.map((s) => (
                  <option key={s.index} value={s.index}>{s.index} — {s.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Description</label>
              <textarea
                rows={3}
                value={fields.description ?? ''}
                onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors resize-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Requirements</label>
              <textarea
                rows={2}
                value={fields.requirements ?? ''}
                onChange={(e) => setFields((f) => ({ ...f, requirements: e.target.value }))}
                placeholder="What completion looks like, materials needed, etc."
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary placeholder:text-text-faint transition-colors resize-none"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!fieldsValid || saving}
                onClick={handleSave}
                className="px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
              >
                {saving ? 'Saving...' : isNewRecordFlow ? 'Create' : 'Save Changes'}
              </button>
              {!isNewRecordFlow && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleToggleActive}
                  className="ml-auto text-12 font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
                >
                  {selected!.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Assignments -------------------------------------------------------

function AssignmentsSection({
  coachId,
  prefillAssignment,
  onPrefillConsumed,
}: {
  coachId: string;
  prefillAssignment?: AssignmentPrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const { data: assignments, loading, error, reload } = useAsync(() => fetchAssignmentsForCoach(coachId), [coachId]);
  const { data: roster } = useAsync(() => fetchCoachRoster(coachId), [coachId]);
  const { data: library } = useAsync(() => fetchLibrary(coachId), [coachId]);
  const { data: tracks } = useAsync(() => fetchTracksForCoach(coachId), [coachId]);

  const [playerId, setPlayerId] = useState('');
  const [selectedActionId, setSelectedActionId] = useState('');
  const [libraryItemId, setLibraryItemId] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeLibrary = useMemo(() => (library || []).filter((l) => l.is_active), [library]);

  // "Auto selected" player (top-right corner) — first roster player
  // alphabetically once the roster loads, unless a prefill below overrides it.
  const rosterSorted = useMemo(
    () => [...(roster || [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [roster],
  );
  useEffect(() => {
    if (!playerId && rosterSorted.length > 0) setPlayerId(rosterSorted[0].playerId);
  }, [rosterSorted, playerId]);

  // Jump-in from the Escalation screen's "Assign Intervention" button
  // (CoachShell owns this state) — token guards against re-applying the
  // same prefill object on unrelated re-renders.
  const lastPrefillTokenRef = useRef<number | null>(null);
  useEffect(() => {
    if (!prefillAssignment || prefillAssignment.token === lastPrefillTokenRef.current) return;
    lastPrefillTokenRef.current = prefillAssignment.token;
    setPlayerId(prefillAssignment.playerId);
    setSelectedActionId(prefillAssignment.executionActionId);
    setLibraryItemId('');
    onPrefillConsumed?.();
  }, [prefillAssignment, onPrefillConsumed]);

  // Tracks that already have a currently-ASSIGNED intervention drop out of
  // the picker entirely — assign a new one only once the active one is
  // completed or cancelled.
  const assignedTrackKeys = useMemo(
    () => new Set((assignments || []).filter((a) => a.status === 'ASSIGNED').map((a) => `${a.player_id}::${a.execution_action_id}`)),
    [assignments],
  );
  const allTracksForPlayer = useMemo(() => (tracks || []).filter((t) => t.player_id === playerId), [tracks, playerId]);
  const activeTracksForPlayer = useMemo(
    () =>
      allTracksForPlayer
        .filter((t) => !assignedTrackKeys.has(`${t.player_id}::${t.execution_action_id}`))
        .sort((a, b) => b.current_stage_index - a.current_stage_index),
    [allTracksForPlayer, assignedTrackKeys],
  );
  const selectedTrack = useMemo(
    () => activeTracksForPlayer.find((t) => t.execution_action_id === selectedActionId) ?? null,
    [activeTracksForPlayer, selectedActionId],
  );
  const eligibleLibrary = useMemo(() => {
    if (!selectedTrack) return [];
    return activeLibrary
      .filter((l) => l.min_escalation_stage <= selectedTrack.current_stage_index)
      .sort((a, b) => b.min_escalation_stage - a.min_escalation_stage || a.name.localeCompare(b.name));
  }, [activeLibrary, selectedTrack]);

  async function handleAssign() {
    const item = eligibleLibrary.find((l) => l.id === libraryItemId);
    if (!playerId || !selectedActionId || !item) return;
    setActionError(null);
    setSaving(true);
    try {
      await createManualAssignment(coachId, playerId, selectedActionId, item);
      await reload();
      setSelectedActionId('');
      setLibraryItemId('');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(id: string, status: 'COMPLETED' | 'CANCELLED') {
    setSaving(true);
    try {
      await setAssignmentStatus(id, status);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-5">
      <div className="border border-border rounded-[6px] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Manual Assignment</span>
          <select
            value={playerId}
            onChange={(e) => {
              setPlayerId(e.target.value);
              setSelectedActionId('');
              setLibraryItemId('');
            }}
            className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2 text-13 text-text-primary transition-colors min-w-[180px]"
          >
            {rosterSorted.length === 0 && <option value="">No players</option>}
            {rosterSorted.map((p: CoachRosterEntry) => (
              <option key={p.playerId} value={p.playerId}>{p.displayName}</option>
            ))}
          </select>
        </div>

        {activeTracksForPlayer.length === 0 ? (
          <span className="text-12 text-text-faint italic">
            {allTracksForPlayer.length === 0
              ? 'No active escalation tracks for this player.'
              : 'Every active track for this player already has an intervention assigned.'}
          </span>
        ) : (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1.5">
              <label className="text-11 text-text-muted">Active Track</label>
              <select
                value={selectedActionId}
                onChange={(e) => {
                  setSelectedActionId(e.target.value);
                  setLibraryItemId('');
                }}
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2 text-13 text-text-primary transition-colors min-w-[220px]"
              >
                <option value="">Select track...</option>
                {activeTracksForPlayer.map((t) => (
                  <option key={t.execution_action_id} value={t.execution_action_id}>
                    {t.action_name} — {stageLabel(t.current_stage_index)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-11 text-text-muted">Intervention</label>
              <select
                value={libraryItemId}
                onChange={(e) => setLibraryItemId(e.target.value)}
                disabled={!selectedTrack}
                className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2 text-13 text-text-primary transition-colors min-w-[200px] disabled:opacity-40"
              >
                <option value="">Select intervention...</option>
                {eligibleLibrary.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} (stage {l.min_escalation_stage}+)</option>
                ))}
              </select>
              {selectedTrack && eligibleLibrary.length === 0 && (
                <span className="text-10 text-text-faint italic">No interventions eligible at this stage yet.</span>
              )}
            </div>
            <button
              type="button"
              disabled={!playerId || !selectedActionId || !libraryItemId || saving}
              onClick={handleAssign}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
            >
              <Plus size={14} /> Assign
            </button>
          </div>
        )}
      </div>

      {actionError && <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{actionError}</div>}

      <div className="flex flex-col gap-2">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Assignments</span>
        {loading && <span className="text-12 text-text-muted">Loading...</span>}
        {error && <span className="text-12 text-signal-risk">{error}</span>}
        {!loading && (assignments || []).length === 0 && <span className="text-12 text-text-faint italic">No interventions assigned yet.</span>}
        {(assignments || []).map((a) => (
          <div key={a.id} className="border border-border rounded-[6px] p-3.5 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-13 font-medium text-text-primary">{a.player_email.split('@')[0]}</span>
              <span className="text-12 text-text-muted">— {a.library_item_name}</span>
              <span className="text-11 text-text-faint">({a.action_name}, stage {a.escalation_stage_at_assignment})</span>
              <span className="text-11 font-mono text-text-faint ml-auto">{a.status}</span>
              {a.status === 'ASSIGNED' && (
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleStatus(a.id, 'COMPLETED')} className="text-signal-process hover:underline text-11 flex items-center gap-1 cursor-pointer">
                    <CheckCircle2 size={12} /> Complete
                  </button>
                  <button type="button" onClick={() => handleStatus(a.id, 'CANCELLED')} className="text-signal-risk hover:underline text-11 flex items-center gap-1 cursor-pointer">
                    <XCircle size={12} /> Cancel
                  </button>
                </div>
              )}
            </div>
            {a.status === 'COMPLETED' && a.player_notes && (
              <div className="pt-1 border-t border-border/50 flex flex-col gap-1">
                <span className="text-10 font-mono text-text-faint uppercase tracking-wider">Player's note</span>
                <p className="text-12 text-text-primary leading-relaxed">{a.player_notes}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
