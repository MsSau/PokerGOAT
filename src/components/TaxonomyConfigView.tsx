// src/components/TaxonomyConfigView.tsx
//
// Coach-only Execution Taxonomy configuration screen (PRD §10 / §3.3).
// Reuses the exact four-tab dimension grouping from the player's mistake
// picker (SessionReview.tsx's DIMENSION_TABS — same categories, same
// order), plus an always-visible fifth "Proposed" tab for player-submitted
// actions awaiting approval. List (left third, tab-grouped + searchable) +
// detail/edit panel (right two-thirds), mandatory-reason modal gating edits
// to an already-canonical action.

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Lock, ShieldCheck, ShieldOff, CheckCircle2, XCircle } from 'lucide-react';
import {
  fetchOrCreateTaxonomy,
  fetchCanonicalActions,
  fetchProposedActions,
  createCanonicalAction,
  updateCanonicalAction,
  setActionActiveStatus,
  approveProposedAction,
  rejectProposedAction,
  ExecutionActionFields,
  Severity,
} from '../lib/taxonomy';
import { ExecutionAction } from '../types';
import { Dimension } from '../lib/executionEngine';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';
import ReasonModal from './ReasonModal';
import { CoachId, asExecutionActionId, asTaxonomyVersionId } from '../types/ids';

interface Props {
  coachId: CoachId;
}

const DIMENSION_TABS: { key: Dimension; label: string }[] = [
  { key: 'DISCIPLINE_PROCESS', label: 'Discipline/Process' },
  { key: 'TECHNICAL_PLAY', label: 'Technical' },
  { key: 'MENTAL_GAME', label: 'Mental' },
  { key: 'LEARNING_IMPROVEMENT', label: 'Learning' },
];

const DETECTION_METHODS = ['System-detected', 'Player-tagged', 'System-derived', 'Coach-reviewed'];
const SEVERITIES: Severity[] = ['MINOR', 'MAJOR', 'CRITICAL'];

const SEVERITY_TONE: Record<Severity, string> = {
  MINOR: 'text-text-muted',
  MAJOR: 'text-signal-caution',
  CRITICAL: 'text-signal-risk',
};

const emptyFields = (dimension: Dimension): ExecutionActionFields => ({
  name: '',
  dimension,
  base_severity: 'MINOR',
  description: '',
  detection_method: DETECTION_METHODS[0],
  is_hard_gate: false,
});

export default function TaxonomyConfigView({ coachId }: Props) {
  const { data: taxonomyCtx, loading: ctxLoading, error: ctxError } = useAsync(() => fetchOrCreateTaxonomy(coachId), [coachId]);

  const [tab, setTab] = useState<Dimension | 'PROPOSED'>('DISCIPLINE_PROCESS');
  const [search, setSearch] = useState('');
  const [actions, setActions] = useState<ExecutionAction[]>([]);
  const [proposed, setProposed] = useState<ExecutionAction[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [fields, setFields] = useState<ExecutionActionFields>(emptyFields('DISCIPLINE_PROCESS'));
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState<'EDIT' | 'DEACTIVATE' | 'REACTIVATE' | null>(null);

  async function reloadLists() {
    if (!taxonomyCtx) return;
    setListLoading(true);
    try {
      const [canonical, proposedActions] = await Promise.all([
        fetchCanonicalActions(asTaxonomyVersionId(taxonomyCtx.version.id)),
        fetchProposedActions(coachId),
      ]);
      setActions(canonical);
      setProposed(proposedActions);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    reloadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomyCtx]);

  const listForTab = useMemo(() => {
    const source = tab === 'PROPOSED' ? proposed : actions.filter((a) => a.dimension === tab);
    const q = search.trim().toLowerCase();
    if (!q) return source;
    return source.filter((a) => a.name.toLowerCase().includes(q));
  }, [tab, actions, proposed, search]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return actions.find((a) => a.id === selectedId) ?? proposed.find((a) => a.id === selectedId) ?? null;
  }, [selectedId, actions, proposed]);

  useEffect(() => {
    if (creatingNew) {
      setFields(emptyFields(tab === 'PROPOSED' ? 'DISCIPLINE_PROCESS' : tab));
      return;
    }
    if (selected) {
      setFields({
        name: selected.name,
        dimension: selected.dimension as Dimension,
        base_severity: selected.base_severity,
        description: selected.description,
        detection_method: selected.detection_method,
        is_hard_gate: !!selected.is_hard_gate,
      });
    }
  }, [selected, creatingNew, tab]);

  function selectTab(key: Dimension | 'PROPOSED') {
    setTab(key);
    setSelectedId(null);
    setCreatingNew(false);
  }

  const fieldsValid = fields.name.trim().length > 0;
  const isProposedSelected = tab === 'PROPOSED' && !!selected;
  const isExistingCanonical = !creatingNew && !!selected && selected.status !== 'PLAYER_PROPOSED';

  async function handleCreate() {
    if (!taxonomyCtx) return;
    setActionError(null);
    setSaving(true);
    try {
      const created = await createCanonicalAction(coachId, asTaxonomyVersionId(taxonomyCtx.version.id), fields);
      await reloadLists();
      setCreatingNew(false);
      setSelectedId(created.id);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEditWithReason(reason: string) {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await updateCanonicalAction(asExecutionActionId(selected.id), fields, reason);
      await reloadLists();
      setReasonModalOpen(null);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActiveWithReason(reason: string) {
    if (!selected) return;
    const makeActive = reasonModalOpen === 'REACTIVATE';
    setActionError(null);
    setSaving(true);
    try {
      await setActionActiveStatus(asExecutionActionId(selected.id), makeActive, reason);
      await reloadLists();
      setReasonModalOpen(null);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!selected || !taxonomyCtx) return;
    setActionError(null);
    setSaving(true);
    try {
      await approveProposedAction(asExecutionActionId(selected.id), coachId, asTaxonomyVersionId(taxonomyCtx.version.id), fields);
      await reloadLists();
      setSelectedId(null);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await rejectProposedAction(asExecutionActionId(selected.id));
      await reloadLists();
      setSelectedId(null);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isNewRecordFlow = creatingNew || (!selected && tab !== 'PROPOSED');

  return (
    <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden animate-fade-in font-sans min-h-[600px]">
      {/* LIST — left third */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-3 border-b border-border flex flex-wrap gap-1.5">
          {DIMENSION_TABS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => selectTab(d.key)}
              className={`text-11 px-2.5 py-1.5 rounded-[4px] font-medium transition-colors cursor-pointer ${
                tab === d.key ? 'bg-accent-steel/15 text-accent-steel' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => selectTab('PROPOSED')}
            className={`text-11 px-2.5 py-1.5 rounded-[4px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
              tab === 'PROPOSED' ? 'bg-signal-caution/15 text-signal-caution' : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Proposed
            {proposed.length > 0 && <span className="text-[10px] font-mono">({proposed.length})</span>}
          </button>
        </div>

        <div className="p-3 border-b border-border flex flex-col gap-2">
          {tab !== 'PROPOSED' && (
            <button
              type="button"
              onClick={() => {
                setCreatingNew(true);
                setSelectedId(null);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer"
            >
              <Plus size={14} /> New Action
            </button>
          )}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions..."
              className="w-full bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] pl-7 pr-2.5 py-1.5 text-12 text-text-primary placeholder:text-text-faint transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {(ctxLoading || listLoading) && <div className="p-4 text-12 text-text-muted">Loading...</div>}
          {ctxError && <div className="p-4 text-12 text-signal-risk">{ctxError}</div>}
          {!ctxLoading && !listLoading && listForTab.length === 0 && (
            <div className="p-4 text-12 text-text-faint italic">
              {tab === 'PROPOSED' ? 'No proposed actions awaiting approval.' : 'No actions in this dimension yet.'}
            </div>
          )}
          {listForTab.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setCreatingNew(false);
                setSelectedId(a.id);
              }}
              className={`w-full text-left p-3.5 border-b border-border/60 transition-colors cursor-pointer ${
                !creatingNew && selectedId === a.id ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {a.status === 'INACTIVE' ? (
                  <ShieldOff size={12} className="text-text-faint shrink-0" />
                ) : (
                  <ShieldCheck size={12} className="text-signal-process shrink-0" />
                )}
                <span className="text-13 text-text-primary font-medium truncate">{a.name}</span>
                {a.is_hard_gate && <Lock size={11} className="text-signal-risk shrink-0 ml-auto" />}
              </div>
              <span className={`text-11 font-mono mt-1 block ${SEVERITY_TONE[a.base_severity]}`}>{a.base_severity}</span>
            </button>
          ))}
        </div>
      </div>

      {/* DETAIL — right two-thirds */}
      <div className="w-2/3 flex flex-col p-6 overflow-y-auto">
        {actionError && (
          <div className="mb-4 bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{actionError}</div>
        )}

        {!isNewRecordFlow && !selected && tab !== 'PROPOSED' && (
          <div className="flex-1 flex items-center justify-center text-13 text-text-faint">Select an action to view or edit it.</div>
        )}
        {tab === 'PROPOSED' && !selected && (
          <div className="flex-1 flex items-center justify-center text-13 text-text-faint">Select a proposed action to review it.</div>
        )}

        {(isNewRecordFlow || selected) && (
          <div className="flex flex-col gap-4">
            <span className="text-14 font-semibold text-text-primary">
              {isNewRecordFlow ? 'New Execution Action' : isProposedSelected ? 'Review Proposed Action' : selected!.name}
            </span>

            {isProposedSelected && (
              <div className="bg-ink/40 border border-border rounded-[6px] p-4 flex flex-col gap-1.5">
                <span className="text-10 font-mono text-text-muted uppercase tracking-wider">Player-submitted</span>
                <span className="text-14 font-medium text-text-primary">{selected!.name}</span>
                {selected!.description && <p className="text-12 text-text-muted leading-relaxed">{selected!.description}</p>}
                <span className="text-11 text-text-faint mt-1">
                  Approving requires setting dimension, severity, hard-gate status, and detection method below — nothing is inherited by default.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {!isProposedSelected && (
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    value={fields.name}
                    onChange={(e) => setFields((f) => ({ ...f, name: e.target.value }))}
                    className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Dimension</label>
                <select
                  value={fields.dimension}
                  onChange={(e) => setFields((f) => ({ ...f, dimension: e.target.value as Dimension }))}
                  className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
                >
                  {DIMENSION_TABS.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Base Severity</label>
                <select
                  value={fields.base_severity}
                  onChange={(e) => setFields((f) => ({ ...f, base_severity: e.target.value as Severity }))}
                  className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Detection Method</label>
                <select
                  value={fields.detection_method ?? DETECTION_METHODS[0]}
                  onChange={(e) => setFields((f) => ({ ...f, detection_method: e.target.value }))}
                  className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
                >
                  {DETECTION_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={fields.is_hard_gate}
                  onChange={(e) => setFields((f) => ({ ...f, is_hard_gate: e.target.checked }))}
                  className="accent-signal-risk"
                />
                <span className="text-13 text-text-primary">Hard Gate</span>
              </label>

              {!isProposedSelected && (
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Description</label>
                  <textarea
                    rows={3}
                    value={fields.description ?? ''}
                    onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
                    className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors resize-none"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {isNewRecordFlow && (
                <button
                  type="button"
                  disabled={!fieldsValid || saving}
                  onClick={handleCreate}
                  className="px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Create Action'}
                </button>
              )}

              {isProposedSelected && (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleApprove}
                    className="flex items-center gap-1.5 px-4 py-2 rounded bg-signal-process/15 border border-signal-process/40 text-signal-process text-12 font-semibold hover:bg-signal-process/25 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} /> Approve into Canonical Taxonomy
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleReject}
                    className="flex items-center gap-1.5 px-4 py-2 rounded text-signal-risk text-12 font-semibold hover:bg-signal-risk/10 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                </>
              )}

              {isExistingCanonical && (
                <>
                  <button
                    type="button"
                    disabled={!fieldsValid || saving}
                    onClick={() => setReasonModalOpen('EDIT')}
                    className="px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setReasonModalOpen(selected!.status === 'INACTIVE' ? 'REACTIVATE' : 'DEACTIVATE')}
                    className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded text-12 font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {selected!.status === 'INACTIVE' ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
                    {selected!.status === 'INACTIVE' ? 'Reactivate' : 'Deactivate'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {reasonModalOpen === 'EDIT' && (
        <ReasonModal
          title="Modifying a Canonical Execution Action"
          description="This action is scored across the roster. Your reason will be stored permanently alongside the change."
          submitting={saving}
          onConfirm={handleSaveEditWithReason}
          onCancel={() => setReasonModalOpen(null)}
        />
      )}
      {(reasonModalOpen === 'DEACTIVATE' || reasonModalOpen === 'REACTIVATE') && (
        <ReasonModal
          title={reasonModalOpen === 'DEACTIVATE' ? 'Deactivating an Execution Action' : 'Reactivating an Execution Action'}
          description="Players will no longer be able to tag a deactivated action going forward. Historical occurrences are unaffected."
          confirmLabel={reasonModalOpen === 'DEACTIVATE' ? 'Deactivate' : 'Reactivate'}
          submitting={saving}
          onConfirm={handleToggleActiveWithReason}
          onCancel={() => setReasonModalOpen(null)}
        />
      )}
    </div>
  );
}
