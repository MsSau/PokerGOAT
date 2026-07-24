// src/components/BRMConfigView.tsx
//
// Coach-only BRM configuration screen (PRD §4 / §3.3). Same shared layout
// as FrameworkConfigView (list left third, detail/edit panel right
// two-thirds, Version History as an in-panel tab, mandatory-reason modal
// gating edits to the live version) — but there's only one BRM
// configuration per coach, so the list pane holds a single entry rather
// than a browsable set of records. The detail panel's Edit tab is the
// PRD-specified "bankroll bands render as an editable table" spreadsheet.

import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, FileEdit, History, Lock, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  fetchBRMConfigForCoach,
  fetchBRMVersions,
  fetchRowsForVersion,
  createBRMConfig,
  reviseBRMConfig,
  currentBRMVersion,
  DEFAULT_BRM_ROWS,
  BRMLevelRow,
} from '../lib/brmConfig';
import { SlotRule } from '../lib/brmRules';
import { hasCurrentWeekAssignment, previewWeeklyBRMAssignment, createWeeklyBRMAssignment, WeeklyBRMAssignmentPreview } from '../lib/weeklyBrmAssignment';
import { fetchCoachRoster } from '../lib/coachRoster';
import { fetchPlayerDashboardData } from '../lib/supabase';
import { BRMConfigVersion } from '../types';
import { useAsync } from '../lib/useAsync';
import { formatCurrency } from '../lib/utils';
import { getErrorMessage } from '../lib/utils';
import ReasonModal from './ReasonModal';

interface Props {
  coachId: string;
}

// Numeric spreadsheet columns only — slot_rules gets its own expandable
// sub-editor per row (a variable-length list doesn't fit a single cell).
const COLUMNS: { key: Exclude<keyof BRMLevelRow, 'slot_rules' | 'level_index'>; label: string; nullable?: boolean }[] = [
  { key: 'min_bankroll', label: 'Min Bankroll' },
  { key: 'max_bankroll', label: 'Max Bankroll' },
  { key: 'session_stop_loss', label: 'Session Stop Loss' },
  { key: 'day_stop_loss', label: 'Day Stop Loss' },
  { key: 'week_stop_loss', label: 'Week Stop Loss' },
  { key: 'max_tournament_buy_in', label: 'Max Tournament Buy-in', nullable: true },
  { key: 'max_session_exposure', label: 'Max Session Exposure', nullable: true },
];

function validateRows(rows: BRMLevelRow[]): string[] {
  const issues: string[] = [];
  const sorted = [...rows].sort((a, b) => a.level_index - b.level_index);
  sorted.forEach((r, i) => {
    if (r.max_bankroll <= r.min_bankroll) {
      issues.push(`Level ${r.level_index}: max bankroll must exceed min bankroll.`);
    }
    if (r.session_stop_loss <= 0 || r.day_stop_loss <= 0 || r.week_stop_loss <= 0) {
      issues.push(`Level ${r.level_index}: stop-loss values must be positive.`);
    }
    if (i > 0 && r.min_bankroll !== sorted[i - 1].max_bankroll) {
      issues.push(`Level ${r.level_index}: min bankroll must equal Level ${sorted[i - 1].level_index}'s max bankroll — bands must be contiguous.`);
    }
    const slotNumbers = new Set<number>();
    r.slot_rules.forEach((s) => {
      if (s.maxBuyIns <= 0) {
        issues.push(`Level ${r.level_index}: table ${s.slotNumber}'s max buy-ins must be positive.`);
      }
      if (slotNumbers.has(s.slotNumber)) {
        issues.push(`Level ${r.level_index}: table ${s.slotNumber} is defined more than once.`);
      }
      slotNumbers.add(s.slotNumber);
    });
  });
  return issues;
}

// Relocated from the Weekly Coach Brief (PRD §21/3.1 "Financial and BRM
// Review") — it's about a specific player's live BRM standing, which is
// this tab's subject matter, not the Brief's. Self-contained (fetches its
// own roster off just `coachId`, same as the rest of this screen) rather
// than depending on CoachShell's selectedPlayerId, since this section can
// be viewed independently of whichever player the Brief tab has selected.
function PlayerFinancialReview({ coachId }: { coachId: string }) {
  const { data: roster } = useAsync(() => fetchCoachRoster(coachId), [coachId]);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId && roster && roster.length > 0) setPlayerId(roster[0].playerId);
  }, [roster, playerId]);

  const { data: dashboard, loading, error, reload: reloadDashboard } = useAsync(
    () => (playerId ? fetchPlayerDashboardData(playerId) : Promise.resolve(null)),
    [playerId],
  );

  const { data: hasAssignment, loading: assignmentStatusLoading, reload: reloadAssignmentStatus } = useAsync(
    () => (playerId ? hasCurrentWeekAssignment(playerId) : Promise.resolve(null)),
    [playerId],
  );

  const [preview, setPreview] = useState<WeeklyBRMAssignmentPreview | null>(null);
  const [previewAttempted, setPreviewAttempted] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Reset the preview whenever the selected player changes so a stale
  // preview for a different player can never be locked in by mistake.
  useEffect(() => {
    setPreview(null);
    setPreviewAttempted(false);
    setAssignError(null);
  }, [playerId]);

  const recentNetPnl = useMemo(() => {
    if (!dashboard) return 0;
    return dashboard.sessions.reduce((sum, s) => sum + (s.session_outcome_assessments?.[0]?.final_session_net_pnl ?? 0), 0);
  }, [dashboard]);

  const selectedPlayer = useMemo(() => roster?.find((p) => p.playerId === playerId) ?? null, [roster, playerId]);

  async function handlePreview() {
    if (!playerId) return;
    setAssignError(null);
    setPreviewLoading(true);
    try {
      const result = await previewWeeklyBRMAssignment(coachId, playerId);
      setPreview(result);
      setPreviewAttempted(true);
    } catch (err) {
      setAssignError(getErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirmAssign(reason: string) {
    if (!playerId || !preview) return;
    setAssignError(null);
    setAssigning(true);
    try {
      await createWeeklyBRMAssignment(coachId, playerId, preview, reason);
      setReasonModalOpen(false);
      setPreview(null);
      setPreviewAttempted(false);
      await Promise.all([reloadAssignmentStatus(), reloadDashboard()]);
    } catch (err) {
      setAssignError(getErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Player Financial &amp; BRM Review</span>
        {roster && roster.length > 0 && (
          <select
            value={playerId ?? ''}
            onChange={(e) => setPlayerId(e.target.value)}
            className="bg-ink border border-border rounded p-2 text-13 text-text-primary focus:outline-none focus:border-accent-bronze"
          >
            {roster.map((p) => (
              <option key={p.playerId} value={p.playerId}>{p.displayName}</option>
            ))}
          </select>
        )}
      </div>

      {(!roster || roster.length === 0) && <span className="text-12 text-text-faint italic">No players in your roster yet.</span>}
      {roster && roster.length > 0 && loading && <span className="text-12 text-text-muted">Loading...</span>}
      {error && <span className="text-12 text-signal-risk">{error}</span>}

      {roster && roster.length > 0 && !loading && dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-12 font-mono">
          <div className="flex flex-col gap-1">
            <span className="text-text-muted">CURRENT BANKROLL</span>
            <span className="text-text-primary text-16">
              {selectedPlayer?.currentBankroll !== null && selectedPlayer?.currentBankroll !== undefined
                ? formatCurrency(selectedPlayer.currentBankroll)
                : '—'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-muted">BRM LEVEL</span>
            <span className="text-text-primary text-16">{dashboard.brmAssignment?.brm_levels?.level_index ?? 'N/A'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-muted">SESSION STOP LOSS</span>
            <span className="text-text-primary text-16">{formatCurrency(dashboard.brmAssignment?.session_stop_loss_snapshot ?? 0)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-muted">WEEK STOP LOSS</span>
            <span className="text-text-primary text-16">{formatCurrency(dashboard.brmAssignment?.week_stop_loss_snapshot ?? 0)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-text-muted">RECENT NET P&amp;L</span>
            <span className="text-text-primary text-16">{formatCurrency(recentNetPnl)}</span>
          </div>
        </div>
      )}

      {assignError && <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{assignError}</div>}

      {/* No locked Weekly BRM Assignment for the CURRENT Poker Week — the
          PRD §4 gap this section exists to close. dashboard.brmAssignment
          only shows the most recent assignment ever, which can be stale
          (a prior week), so hasCurrentWeekAssignment checks the specific
          poker_week_id the player is in right now. */}
      {playerId && !assignmentStatusLoading && hasAssignment === false && (
        <div className="border border-signal-caution/30 bg-signal-caution/5 rounded-[6px] p-4 flex flex-col gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={15} className="text-signal-caution shrink-0 mt-0.5" />
            <p className="text-12 text-text-primary leading-relaxed">
              No BRM Assignment is locked for {selectedPlayer?.displayName ?? 'this player'}'s current Poker Week — their Weekly Game Plan will show
              "Coach Configuration Required" until one is assigned.
            </p>
          </div>

          {!previewAttempted && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading}
              className="self-start px-3.5 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
            >
              {previewLoading ? 'Resolving...' : 'Preview This Week’s BRM Assignment'}
            </button>
          )}

          {previewAttempted && !preview && (
            <span className="text-12 text-text-faint italic">
              No active BRM configuration covers this player's current bankroll. Configure bankroll bands in the table above first.
            </span>
          )}

          {preview && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-12 font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">RESOLVED LEVEL</span>
                  <span className="text-text-primary text-14">{preview.levelIndex}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">SESSION STOP LOSS</span>
                  <span className="text-text-primary text-14">{formatCurrency(preview.sessionStopLoss)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">DAY STOP LOSS</span>
                  <span className="text-text-primary text-14">{formatCurrency(preview.dayStopLoss)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">WEEK STOP LOSS</span>
                  <span className="text-text-primary text-14">{formatCurrency(preview.weekStopLoss)}</span>
                </div>
              </div>

              {!preview.brmLevelId ? (
                <span className="text-12 text-signal-risk">
                  Level {preview.levelIndex}'s tournament registration rules (max buy-in / session exposure) aren't configured yet — assign is disabled
                  until they are.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setReasonModalOpen(true)}
                  disabled={assigning}
                  className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <ShieldCheck size={13} /> Lock This Assignment
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {reasonModalOpen && preview && (
        <ReasonModal
          title="Locking a Weekly BRM Assignment"
          description="This fixes the player's stop-loss limits for their entire current Poker Week. Bankroll changes during the week will not change this assignment."
          confirmLabel="Lock Assignment"
          submitting={assigning}
          onConfirm={handleConfirmAssign}
          onCancel={() => setReasonModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function BRMConfigView({ coachId }: Props) {
  const { data: config, loading: configLoading, error: configError, reload: reloadConfig } = useAsync(
    () => fetchBRMConfigForCoach(coachId),
    [coachId],
  );

  const [versions, setVersions] = useState<BRMConfigVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [tab, setTab] = useState<'edit' | 'history'>('edit');
  const [rows, setRows] = useState<BRMLevelRow[]>(DEFAULT_BRM_ROWS);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, BRMLevelRow[]>>({});
  const [expandedSlotLevel, setExpandedSlotLevel] = useState<number | null>(null);

  const active = useMemo(() => currentBRMVersion(versions), [versions]);

  useEffect(() => {
    if (!config) return;
    let alive = true;
    setVersionsLoading(true);
    fetchBRMVersions(config.id)
      .then((v) => alive && setVersions(v))
      .catch((err) => alive && setActionError(getErrorMessage(err)))
      .finally(() => alive && setVersionsLoading(false));
    return () => {
      alive = false;
    };
  }, [config]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setRowsLoading(true);
    fetchRowsForVersion(active.id)
      .then((r) => alive && setRows(r))
      .catch((err) => alive && setActionError(getErrorMessage(err)))
      .finally(() => alive && setRowsLoading(false));
    return () => {
      alive = false;
    };
  }, [active]);

  function updateCell(levelIndex: number, key: Exclude<keyof BRMLevelRow, 'slot_rules' | 'level_index'>, raw: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.level_index !== levelIndex) return r;
        if (raw === '') return { ...r, [key]: null };
        const n = Number(raw);
        return { ...r, [key]: Number.isNaN(n) ? r[key] : n };
      }),
    );
  }

  function addSlotRule(levelIndex: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.level_index !== levelIndex
          ? r
          : { ...r, slot_rules: [...r.slot_rules, { slotNumber: r.slot_rules.length + 1, maxBuyIns: 1 }] },
      ),
    );
  }

  function updateSlotRule(levelIndex: number, slotIdx: number, patch: Partial<SlotRule>) {
    setRows((prev) =>
      prev.map((r) =>
        r.level_index !== levelIndex
          ? r
          : { ...r, slot_rules: r.slot_rules.map((s, i) => (i === slotIdx ? { ...s, ...patch } : s)) },
      ),
    );
  }

  function removeSlotRule(levelIndex: number, slotIdx: number) {
    setRows((prev) =>
      prev.map((r) => (r.level_index !== levelIndex ? r : { ...r, slot_rules: r.slot_rules.filter((_, i) => i !== slotIdx) })),
    );
  }

  const issues = useMemo(() => validateRows(rows), [rows]);
  const hasConfig = !!config;

  async function handleCreate() {
    setActionError(null);
    if (issues.length > 0) return;
    setSaving(true);
    try {
      await createBRMConfig(coachId, rows);
      await reloadConfig();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReviseWithReason(reason: string) {
    if (!config || !active) return;
    setActionError(null);
    setSaving(true);
    try {
      await reviseBRMConfig(config.id, active, rows, reason);
      const refreshed = await fetchBRMVersions(config.id);
      setVersions(refreshed);
      setReasonModalOpen(false);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleExpand(version: BRMConfigVersion) {
    if (expandedVersionId === version.id) {
      setExpandedVersionId(null);
      return;
    }
    setExpandedVersionId(version.id);
    if (!expandedRows[version.id]) {
      const r = await fetchRowsForVersion(version.id);
      setExpandedRows((prev) => ({ ...prev, [version.id]: r }));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PlayerFinancialReview coachId={coachId} />

      <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden animate-fade-in font-sans min-h-[560px]">
      {/* LIST — left third (singleton config, mirrors FrameworkConfigView's shape) */}
      <div className="w-1/3 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <span className="text-12 font-mono text-text-muted uppercase tracking-wider">BRM Configuration</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {configLoading && <div className="p-4 text-12 text-text-muted">Loading BRM configuration...</div>}
          {configError && <div className="p-4 text-12 text-signal-risk">{configError}</div>}
          {!configLoading && !configError && !hasConfig && (
            <div className="p-4 text-12 text-text-faint italic">No BRM configuration yet. Review the default bands on the right and create one.</div>
          )}
          {!configLoading && hasConfig && (
            <div className="p-4 border-l-[3px] border-accent-bronze bg-surface-raised flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-accent-bronze" />
                <span className="text-13 font-semibold text-text-primary">Bankroll &amp; Stop Loss</span>
              </div>
              <span className="text-11 font-mono text-text-faint">
                {versionsLoading ? 'Loading versions...' : `v${active?.version_number ?? '—'} active · ${versions.length} version(s)`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL — right two-thirds */}
      <div className="w-2/3 flex flex-col">
        {hasConfig && (
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <span className="text-14 font-semibold text-text-primary">Levels 1–8</span>
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

          {(!hasConfig || tab === 'edit') && (
            <div className="flex flex-col gap-4">
              {!hasConfig && (
                <p className="text-12 text-text-muted leading-relaxed">
                  Pre-filled with the PRD §4 shipped defaults for Levels 1–5. Levels 6–8 ship with bankroll bands and stop-loss limits only —
                  set their tournament registration caps below before activating, or leave blank to configure later.
                </p>
              )}
              {rowsLoading && <span className="text-12 text-text-muted">Loading bankroll bands...</span>}

              <div className="overflow-x-auto border border-border rounded-[6px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised text-11 font-mono text-text-muted">
                      <th className="p-2.5 font-semibold">LEVEL</th>
                      {COLUMNS.map((c) => (
                        <th key={c.key} className="p-2.5 font-semibold text-right whitespace-nowrap">
                          {c.label.toUpperCase()}
                        </th>
                      ))}
                      <th className="p-2.5 font-semibold text-right whitespace-nowrap">TABLE RULES</th>
                    </tr>
                  </thead>
                  <tbody className="text-12 font-sans text-text-primary">
                    {rows.map((row) => {
                      const slotExpanded = expandedSlotLevel === row.level_index;
                      return (
                        <React.Fragment key={row.level_index}>
                          <tr className="border-b border-border/50">
                            <td className="p-2.5 font-semibold font-mono">L{row.level_index}</td>
                            {COLUMNS.map((c) => (
                              <td key={c.key} className="p-1.5">
                                <input
                                  type="number"
                                  value={row[c.key] ?? ''}
                                  onChange={(e) => updateCell(row.level_index, c.key, e.target.value)}
                                  placeholder={c.nullable ? '—' : undefined}
                                  className="w-28 bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded p-1.5 text-12 text-right font-mono text-text-primary transition-colors"
                                />
                              </td>
                            ))}
                            <td className="p-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => setExpandedSlotLevel(slotExpanded ? null : row.level_index)}
                                className="inline-flex items-center gap-1 text-11 font-mono text-accent-steel hover:opacity-80 cursor-pointer whitespace-nowrap"
                              >
                                {row.slot_rules.length} table{row.slot_rules.length === 1 ? '' : 's'}
                                {slotExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </td>
                          </tr>
                          {slotExpanded && (
                            <tr className="border-b border-border/50 bg-ink/25">
                              <td colSpan={COLUMNS.length + 2} className="p-3">
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-11 font-mono text-text-muted uppercase">
                                      Level {row.level_index} — Tournament Table Rules
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => addSlotRule(row.level_index)}
                                      className="text-accent-steel hover:opacity-80 flex items-center gap-1 text-11 cursor-pointer"
                                    >
                                      <Plus size={12} /> Add Table
                                    </button>
                                  </div>
                                  {row.slot_rules.length === 0 && (
                                    <span className="text-11 text-text-faint italic">No table rules configured — the Weekly Game Plan will show "Coach Configuration Required" for this level.</span>
                                  )}
                                  {row.slot_rules.map((s, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <span className="text-11 font-mono text-text-muted w-10">Table</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={s.slotNumber}
                                        onChange={(e) => updateSlotRule(row.level_index, i, { slotNumber: Number(e.target.value) })}
                                        className="w-16 bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded p-1.5 text-12 text-right font-mono text-text-primary"
                                      />
                                      <span className="text-11 font-mono text-text-muted">Max Buy-ins</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={s.maxBuyIns}
                                        onChange={(e) => updateSlotRule(row.level_index, i, { maxBuyIns: Number(e.target.value) })}
                                        className="w-16 bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded p-1.5 text-12 text-right font-mono text-text-primary"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeSlotRule(row.level_index, i)}
                                        className="text-text-faint hover:text-signal-risk cursor-pointer"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {issues.length > 0 && (
                <div className="bg-surface-raised border border-signal-caution/30 rounded-[6px] p-3 flex flex-col gap-1">
                  {issues.map((issue, i) => (
                    <span key={i} className="text-11 text-signal-caution">{issue}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={issues.length > 0 || saving}
                  onClick={() => (hasConfig ? setReasonModalOpen(true) : handleCreate())}
                  className="px-4 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : hasConfig ? 'Save Changes' : 'Create & Activate BRM Configuration'}
                </button>
              </div>
            </div>
          )}

          {hasConfig && tab === 'history' && (
            <div className="flex flex-col gap-3">
              {versionsLoading && <span className="text-12 text-text-muted">Loading version history...</span>}
              {!versionsLoading &&
                versions.map((v) => {
                  const isExpanded = expandedVersionId === v.id;
                  const versionRows = expandedRows[v.id];
                  return (
                    <div
                      key={v.id}
                      className={`border rounded-[6px] overflow-hidden transition-opacity ${
                        v.is_activated ? 'border-accent-bronze/40 bg-surface-raised' : 'border-border opacity-60'
                      }`}
                    >
                      <button type="button" onClick={() => toggleExpand(v)} className="w-full p-4 flex items-center gap-2 cursor-pointer text-left">
                        {v.is_activated ? (
                          <ShieldCheck size={13} className="text-signal-process" />
                        ) : (
                          <Lock size={12} className="text-text-faint" />
                        )}
                        <span className="text-12 font-mono font-semibold text-text-primary">v{v.version_number}</span>
                        <span className="text-11 text-text-faint ml-auto">
                          {v.created_at ? new Date(v.created_at).toLocaleString() : '—'}
                        </span>
                        {isExpanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 flex flex-col gap-3">
                          {v.change_reason && (
                            <div className="bg-ink/40 border border-border rounded p-2.5">
                              <span className="text-10 font-mono text-text-muted uppercase tracking-wider">Reason for change</span>
                              <p className="text-12 text-text-primary mt-1">{v.change_reason}</p>
                            </div>
                          )}
                          {!versionRows && <span className="text-11 text-text-muted">Loading...</span>}
                          {versionRows && (
                            <div className="overflow-x-auto border border-border rounded-[6px] bg-ink/25">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="border-b border-border text-11 font-mono text-text-muted">
                                    <th className="p-2 font-semibold">LVL</th>
                                    {COLUMNS.map((c) => (
                                      <th key={c.key} className="p-2 font-semibold text-right whitespace-nowrap">{c.label}</th>
                                    ))}
                                    <th className="p-2 font-semibold text-right whitespace-nowrap">Table Rules</th>
                                  </tr>
                                </thead>
                                <tbody className="text-11 font-mono text-text-primary">
                                  {versionRows.map((r) => (
                                    <tr key={r.level_index} className="border-b border-border/40">
                                      <td className="p-2 font-semibold">L{r.level_index}</td>
                                      {COLUMNS.map((c) => (
                                        <td key={c.key} className="p-2 text-right">
                                          {r[c.key] !== null ? formatCurrency(r[c.key] as number) : '—'}
                                        </td>
                                      ))}
                                      <td className="p-2 text-right text-text-faint">
                                        {r.slot_rules.length > 0
                                          ? r.slot_rules.map((s) => `${s.slotNumber}:${s.maxBuyIns}`).join(', ')
                                          : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {reasonModalOpen && (
        <ReasonModal
          title="Modifying the Active BRM Configuration"
          description="This configuration is live and governs every player's stop-loss and buy-in limits. Your reason will be stored permanently alongside the old and new values."
          submitting={saving}
          onConfirm={handleReviseWithReason}
          onCancel={() => setReasonModalOpen(false)}
        />
      )}
      </div>
    </div>
  );
}
