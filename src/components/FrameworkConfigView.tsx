// src/components/FrameworkConfigView.tsx
//
// Coach-only Performance Framework configuration screen (PRD §3 / §3.3).
// Shared layout pattern for all coach config screens: searchable list on
// the left third, detail/edit panel on the right two-thirds, Version
// History as a tab inside the detail panel (not a separate page), and a
// mandatory-reason modal gating any edit to an already-activated version.

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Lock, ShieldCheck, FileEdit, History, CheckCircle2, Archive } from 'lucide-react';
import {
  fetchFrameworksForCoach,
  fetchFrameworkVersions,
  createFramework,
  updateDraftVersion,
  reviseActivatedFramework,
  activateFramework,
  archiveFramework,
  FrameworkWithCurrentVersion,
  FrameworkEditableFields,
} from '../lib/performanceFramework';
import { FrameworkVersion } from '../types';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';
import ReasonModal from './ReasonModal';

interface Props {
  coachId: string;
}

const STATUS_DOT: Record<string, string> = {
  DRAFT: 'bg-text-faint',
  ACTIVE: 'bg-signal-process',
  ARCHIVED: 'bg-text-muted',
};

const emptyFields: FrameworkEditableFields = { primary_objective: '', start_date: null, end_date: null };

export default function FrameworkConfigView({ coachId }: Props) {
  const { data: frameworks, loading, error, reload } = useAsync(() => fetchFrameworksForCoach(coachId), [coachId]);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [fields, setFields] = useState<FrameworkEditableFields>(emptyFields);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const [history, setHistory] = useState<FrameworkVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!frameworks || frameworks.length === 0) return;
    if (selectedId && frameworks.some((f) => f.framework.id === selectedId)) return;
    const preferActive = frameworks.find((f) => f.framework.status === 'ACTIVE') ?? frameworks[0];
    setSelectedId(preferActive.framework.id);
  }, [frameworks, selectedId]);

  const selected = useMemo(
    () => (selectedId ? frameworks?.find((f) => f.framework.id === selectedId) ?? null : null),
    [frameworks, selectedId],
  );

  useEffect(() => {
    if (creatingNew) {
      setFields(emptyFields);
      setTab('edit');
      return;
    }
    if (selected) {
      setFields({
        primary_objective: selected.currentVersion.primary_objective,
        start_date: selected.currentVersion.start_date,
        end_date: selected.currentVersion.end_date,
      });
    }
  }, [selected, creatingNew]);

  useEffect(() => {
    if (tab !== 'history' || !selected) return;
    let active = true;
    setHistoryLoading(true);
    fetchFrameworkVersions(selected.framework.id)
      .then((v) => active && setHistory(v))
      .catch((err) => active && setActionError(getErrorMessage(err)))
      .finally(() => active && setHistoryLoading(false));
    return () => {
      active = false;
    };
  }, [tab, selected]);

  const filteredFrameworks = useMemo(() => {
    if (!frameworks) return [];
    const q = search.trim().toLowerCase();
    if (!q) return frameworks;
    return frameworks.filter((f) => f.currentVersion.primary_objective.toLowerCase().includes(q));
  }, [frameworks, search]);

  const isNewRecordFlow = creatingNew || !selected;
  const isDraftEdit = !isNewRecordFlow && selected!.framework.status === 'DRAFT';
  const isActiveEdit = !isNewRecordFlow && selected!.framework.status === 'ACTIVE';
  const isArchived = !isNewRecordFlow && selected!.framework.status === 'ARCHIVED';
  const fieldsValid = fields.primary_objective.trim().length > 0;

  async function handleSaveDirect() {
    setActionError(null);
    setSaving(true);
    try {
      if (isNewRecordFlow) {
        const created = await createFramework(coachId, fields);
        await reload();
        setCreatingNew(false);
        setSelectedId(created.framework.id);
      } else if (isDraftEdit) {
        await updateDraftVersion(selected!.currentVersion.id, fields);
        await reload();
      }
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWithReason(reason: string) {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await reviseActivatedFramework(selected.framework.id, selected.currentVersion, fields, reason);
      await reload();
      setReasonModalOpen(false);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await activateFramework(coachId, selected.framework.id, selected.currentVersion.id);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!selected) return;
    setActionError(null);
    setSaving(true);
    try {
      await archiveFramework(selected.framework.id);
      await reload();
      setConfirmingArchive(false);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden animate-fade-in font-sans min-h-[560px]">
      {/* LIST — left third */}
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
            <Plus size={14} /> New Framework
          </button>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search frameworks..."
              className="w-full bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] pl-7 pr-2.5 py-1.5 text-12 text-text-primary placeholder:text-text-faint transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-12 text-text-muted">Loading frameworks...</div>}
          {error && <div className="p-4 text-12 text-signal-risk">{error}</div>}
          {!loading && !error && filteredFrameworks.length === 0 && (
            <div className="p-4 text-12 text-text-faint italic">No frameworks yet. Create one to get started.</div>
          )}
          {filteredFrameworks.map(({ framework, currentVersion }) => (
            <button
              key={framework.id}
              type="button"
              onClick={() => {
                setCreatingNew(false);
                setSelectedId(framework.id);
              }}
              className={`w-full text-left p-4 border-b border-border/60 transition-colors cursor-pointer ${
                !creatingNew && selectedId === framework.id ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[framework.status]}`} />
                <span className="text-11 font-mono text-text-muted uppercase tracking-wider">{framework.status}</span>
                <span className="text-11 font-mono text-text-faint ml-auto">v{currentVersion.version_number}</span>
              </div>
              <p className="text-13 text-text-primary line-clamp-2 leading-snug">{currentVersion.primary_objective}</p>
            </button>
          ))}
        </div>
      </div>

      {/* DETAIL — right two-thirds */}
      <div className="w-2/3 flex flex-col">
        {isNewRecordFlow && (
          <div className="px-6 py-4 border-b border-border">
            <span className="text-14 font-semibold text-text-primary">New Performance Framework</span>
          </div>
        )}

        {!isNewRecordFlow && selected && (
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[selected.framework.status]}`} />
              <span className="text-14 font-semibold text-text-primary">{selected.framework.status}</span>
              <span className="text-12 font-mono text-text-faint">v{selected.currentVersion.version_number}</span>
              {selected.framework.status === 'ARCHIVED' && <Lock size={13} className="text-text-faint ml-1" />}
            </div>
            <div className="flex bg-ink border border-border rounded-[6px] p-0.5">
              <button
                type="button"
                onClick={() => setTab('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-12 font-medium transition-colors cursor-pointer ${
                  tab === 'edit' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <FileEdit size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-12 font-medium transition-colors cursor-pointer ${
                  tab === 'history' ? 'bg-surface-raised text-text-primary' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <History size={12} /> Version History
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {actionError && (
            <div className="mb-4 bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{actionError}</div>
          )}

          {(isNewRecordFlow || tab === 'edit') && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Primary Execution Objective</label>
                <textarea
                  rows={4}
                  value={fields.primary_objective}
                  onChange={(e) => setFields((f) => ({ ...f, primary_objective: e.target.value }))}
                  disabled={isArchived}
                  placeholder="e.g. Eliminate late-stage sizing errors and hold to Session Stop Loss with zero exceptions."
                  className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-3 text-14 text-text-primary placeholder:text-text-faint transition-colors resize-none disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Start Date</label>
                  <input
                    type="date"
                    value={fields.start_date ?? ''}
                    onChange={(e) => setFields((f) => ({ ...f, start_date: e.target.value || null }))}
                    disabled={isArchived}
                    className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors disabled:opacity-60"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-12 font-mono text-text-muted uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    value={fields.end_date ?? ''}
                    onChange={(e) => setFields((f) => ({ ...f, end_date: e.target.value || null }))}
                    disabled={isArchived}
                    className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors disabled:opacity-60"
                  />
                </div>
              </div>

              {isArchived && (
                <div className="bg-ink/50 border border-border p-4 rounded-[6px] flex items-start gap-3">
                  <Lock size={14} className="text-text-muted shrink-0 mt-0.5" />
                  <p className="text-12 text-text-muted leading-relaxed">This framework is archived and read-only.</p>
                </div>
              )}

              {!isArchived && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!fieldsValid || saving}
                    onClick={() => (isActiveEdit ? setReasonModalOpen(true) : handleSaveDirect())}
                    className="px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : isNewRecordFlow ? 'Create Draft' : 'Save Changes'}
                  </button>

                  {isDraftEdit && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleActivate}
                      className="flex items-center gap-1.5 px-4 py-2 rounded border border-signal-process/40 text-signal-process text-12 font-semibold hover:bg-signal-process/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <CheckCircle2 size={14} /> Activate Framework
                    </button>
                  )}

                  {!isNewRecordFlow && !confirmingArchive && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setConfirmingArchive(true)}
                      className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded text-12 font-medium text-text-muted hover:text-signal-risk transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Archive size={13} /> Archive
                    </button>
                  )}
                  {confirmingArchive && (
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-12 text-text-muted">Archive this framework?</span>
                      <button type="button" onClick={() => setConfirmingArchive(false)} className="text-12 text-text-muted hover:text-text-primary cursor-pointer">
                        Cancel
                      </button>
                      <button type="button" onClick={handleArchive} className="text-12 text-signal-risk font-semibold hover:underline cursor-pointer">
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isNewRecordFlow && tab === 'history' && (
            <div className="flex flex-col gap-3">
              {historyLoading && <span className="text-12 text-text-muted">Loading version history...</span>}
              {!historyLoading &&
                history.map((v) => (
                  <div
                    key={v.id}
                    className={`border rounded-[6px] p-4 flex flex-col gap-2 transition-opacity ${
                      v.is_activated ? 'border-accent-bronze/40 bg-surface-raised' : 'border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {v.is_activated ? (
                        <ShieldCheck size={13} className="text-signal-process" />
                      ) : (
                        <Lock size={12} className="text-text-faint" />
                      )}
                      <span className="text-12 font-mono font-semibold text-text-primary">v{v.version_number}</span>
                      <span className="text-11 text-text-faint ml-auto">
                        {v.created_at ? new Date(v.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    <p className="text-13 text-text-primary leading-relaxed">{v.primary_objective}</p>
                    <span className="text-11 font-mono text-text-faint">
                      {v.start_date ?? '—'} → {v.end_date ?? '—'}
                    </span>
                    {v.change_reason && (
                      <div className="mt-1 bg-ink/40 border border-border rounded p-2.5">
                        <span className="text-10 font-mono text-text-muted uppercase tracking-wider">Reason for change</span>
                        <p className="text-12 text-text-primary mt-1">{v.change_reason}</p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {reasonModalOpen && (
        <ReasonModal
          title="Modifying an Active Framework"
          description="This framework is live and has historical dependents (Weekly Game Plans, Session Contracts). Your reason will be stored permanently alongside the old and new values."
          submitting={saving}
          onConfirm={handleSaveWithReason}
          onCancel={() => setReasonModalOpen(false)}
        />
      )}
    </div>
  );
}
