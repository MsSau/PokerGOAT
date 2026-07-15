// src/components/WeeklyGamePlanView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { Lock, Plus, Trash2, ShieldAlert, CheckCircle2, ChevronRight } from 'lucide-react';
import { resolveCoachId } from '../lib/supabase';
import {
  resolveWGPContext,
  fetchExistingWGP,
  createDraftWGP,
  updateWGPIntentionFocus,
  replacePlayingDays,
  replaceTournaments,
  replaceConditionalTournaments,
  replaceCommitments,
  validateWeeklyGamePlan,
  lockWeeklyGamePlan,
  appendAmendment,
  WGPContext,
  WGPFull,
  ValidationIssue,
} from '../lib/weeklyGamePlan';

interface Props {
  userId: string;
}

interface DayRow {
  planned_date: string;
  planned_session_allocation: number;
}
interface TournamentRow {
  slot_number: number;
  tournament_name: string;
  intended_buy_ins: number;
  planned_date: string;
}
interface ConditionalRow {
  tournament_name: string;
  activation_condition: string;
  permitted_buy_ins: number;
}

const emptyDay = (): DayRow => ({ planned_date: '', planned_session_allocation: 1 });
const emptyTournament = (slot: number): TournamentRow => ({
  slot_number: slot,
  tournament_name: '',
  intended_buy_ins: 1,
  planned_date: '',
});
const emptyConditional = (): ConditionalRow => ({ tournament_name: '', activation_condition: '', permitted_buy_ins: 1 });

export default function WeeklyGamePlanView({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<WGPContext | null>(null);
  const [existing, setExisting] = useState<WGPFull | null>(null);

  const [days, setDays] = useState<DayRow[]>([emptyDay()]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([emptyTournament(1)]);
  const [conditionals, setConditionals] = useState<ConditionalRow[]>([]);
  const [commitments, setCommitments] = useState<string[]>(['']);
  const [weeklyIntention, setWeeklyIntention] = useState('');
  const [weeklyFocus, setWeeklyFocus] = useState('');

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amendType, setAmendType] = useState('ADD_TOURNAMENT');
  const [amendDetail, setAmendDetail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const coachId = await resolveCoachId(userId, 'PLAYER');
      const context = await resolveWGPContext(userId, coachId);
      setCtx(context);

      if (context.pokerWeek) {
        const full = await fetchExistingWGP(userId, context.pokerWeek.id);
        setExisting(full);
        if (full) {
          setWeeklyIntention(full.plan.weekly_intention || '');
          setWeeklyFocus(full.plan.weekly_focus || '');
          setDays(
            full.playingDays.length
              ? full.playingDays.map((d) => ({ planned_date: d.planned_date, planned_session_allocation: d.planned_session_allocation }))
              : [emptyDay()],
          );
          setTournaments(
            full.tournaments.length
              ? full.tournaments.map((t) => ({
                  slot_number: t.slot_number,
                  tournament_name: t.tournament_name,
                  intended_buy_ins: t.intended_buy_ins,
                  planned_date: t.planned_date || '',
                }))
              : [emptyTournament(1)],
          );
          setConditionals(
            full.conditionalTournaments.map((c) => ({
              tournament_name: c.tournament_name,
              activation_condition: c.activation_condition,
              permitted_buy_ins: c.permitted_buy_ins,
            })),
          );
          setCommitments(full.commitments.length ? full.commitments.map((c) => c.commitment_text) : ['']);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load Weekly Game Plan context.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const runValidation = useCallback(
    (currentDays: DayRow[], currentTournaments: TournamentRow[]) => {
      if (!ctx) return [];
      const v = validateWeeklyGamePlan(
        currentDays.filter((d) => d.planned_date),
        currentTournaments.filter((t) => t.tournament_name),
        ctx,
      );
      setIssues(v);
      return v;
    },
    [ctx],
  );

  useEffect(() => {
    if (ctx) runValidation(days, tournaments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, tournaments, ctx]);

  const isLocked = existing?.plan.status === 'LOCKED';

  const handleSaveDraft = async () => {
    if (!ctx?.pokerWeek) return;
    setSaving(true);
    setError(null);
    try {
      let plan = existing?.plan;
      if (!plan) {
        plan = await createDraftWGP(
          userId,
          ctx.pokerWeek.id,
          ctx.frameworkVersion?.id || null,
          ctx.brmAssignment?.id || null,
        );
      }
      await updateWGPIntentionFocus(plan.id, weeklyIntention, weeklyFocus);
      await replacePlayingDays(
        plan.id,
        days.filter((d) => d.planned_date).map((d) => ({ ...d })),
      );
      await replaceTournaments(
        plan.id,
        tournaments
          .filter((t) => t.tournament_name)
          .map((t) => ({
            slot_number: t.slot_number,
            tournament_name: t.tournament_name,
            permitted_buy_ins: t.intended_buy_ins,
            intended_buy_ins: t.intended_buy_ins,
            planned_date: t.planned_date || null,
          })),
      );
      await replaceConditionalTournaments(plan.id, conditionals.filter((c) => c.tournament_name));
      await replaceCommitments(
        plan.id,
        commitments.filter((c) => c.trim()).map((c) => ({ commitment_text: c })),
      );
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    if (!ctx?.pokerWeek) return;
    const v = runValidation(days, tournaments);
    if (v.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await handleSaveDraft();
      const planId = existing?.plan.id;
      if (!planId) {
        // handleSaveDraft() reloaded `existing` via load() only after this
        // function returns in the next render — fetch fresh instead.
        const full = await fetchExistingWGP(userId, ctx.pokerWeek.id);
        if (full) await lockWeeklyGamePlan(full.plan.id);
      } else {
        await lockWeeklyGamePlan(planId);
      }
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to lock plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleProposeAmendment = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      await appendAmendment(
        existing.plan.id,
        userId,
        amendType,
        { note: 'See original locked plan above.' },
        { detail: amendDetail },
        amendReason,
        { checked: true },
        false,
      );
      setAmendOpen(false);
      setAmendReason('');
      setAmendDetail('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to submit amendment.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
        <span className="text-12 font-mono text-text-muted mt-3">Resolving Poker Week and BRM Assignment...</span>
      </div>
    );
  }

  if (!ctx?.pokerWeek) {
    return (
      <div className="bg-surface border border-border rounded-[6px] p-6 flex items-start gap-3">
        <ShieldAlert size={18} className="text-signal-caution shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="text-14 font-medium text-text-primary">Coach Configuration Required</span>
          <span className="text-12 text-text-muted leading-relaxed">
            No Poker Week has been established for you yet. Weekly Game Plans are created against a Poker Week boundary
            set by your coach's system. Check back once the current Poker Week has been assigned.
          </span>
        </div>
      </div>
    );
  }

  if (!ctx.brmAssignment || !ctx.brmAssignment.locked_at) {
    return (
      <div className="bg-surface border border-border rounded-[6px] p-6 flex items-start gap-3">
        <ShieldAlert size={18} className="text-signal-caution shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="text-14 font-medium text-text-primary">Coach Configuration Required</span>
          <span className="text-12 text-text-muted leading-relaxed">
            Your Weekly BRM Assignment for this Poker Week hasn't locked yet. A Weekly Game Plan can't be validated or
            locked without it.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="bg-signal-risk/10 border border-signal-risk/25 text-signal-risk text-12 p-3 rounded-[4px]">
          {error}
        </div>
      )}

      {/* Context strip */}
      <div className="bg-surface border border-border rounded-[6px] p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-11 font-mono text-text-muted uppercase">Poker Week</span>
          <span className="text-13 font-mono text-text-primary">
            {new Date(ctx.pokerWeek.start_timestamp).toLocaleDateString()} → {new Date(ctx.pokerWeek.end_timestamp).toLocaleDateString()}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-11 font-mono text-text-muted uppercase">BRM Level</span>
          <span className="text-13 font-mono text-text-primary">Level {ctx.brmLevel?.level_index ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-11 font-mono text-text-muted uppercase">Framework</span>
          <span className="text-13 font-mono text-text-primary">
            {ctx.frameworkVersion ? `v${ctx.frameworkVersion.version_number}` : 'None active'}
          </span>
        </div>
      </div>

      {isLocked ? (
        <>
          {/* LOCKED, READ-ONLY VIEW */}
          <div className="bg-surface border border-border rounded-[6px] overflow-hidden">
            <div className="bg-surface-raised/80 border-b border-border px-6 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-ink border border-border flex items-center justify-center text-text-muted">
                <Lock size={14} />
              </div>
              <span className="text-13 text-text-primary">
                Locked at {existing?.plan.locked_at ? new Date(existing.plan.locked_at).toLocaleString() : ''}. This is your plan for the week.
              </span>
            </div>
            <div className="p-6 flex flex-col gap-6 opacity-90">
              <ReadOnlySection title="Weekly Intention" value={weeklyIntention || '—'} />
              <ReadOnlySection title="Weekly Focus" value={weeklyFocus || '—'} />
              <ReadOnlyList title="Playing Days" items={days.filter((d) => d.planned_date).map((d) => `${d.planned_date} — ${d.planned_session_allocation} session(s)`)} />
              <ReadOnlyList
                title="Planned Tournaments"
                items={tournaments.filter((t) => t.tournament_name).map((t) => `Slot ${t.slot_number}: ${t.tournament_name} — ${t.intended_buy_ins} buy-in(s)`)}
              />
              <ReadOnlyList
                title="Conditional Tournaments"
                items={conditionals.map((c) => `${c.tournament_name} (if: ${c.activation_condition}) — ${c.permitted_buy_ins} buy-in(s)`)}
              />
              <ReadOnlyList title="Commitments" items={commitments.filter((c) => c.trim())} />
            </div>
          </div>

          {/* Amendments — append-only */}
          <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-13 font-semibold text-text-primary">Amendments</span>
              <button
                type="button"
                onClick={() => setAmendOpen((v) => !v)}
                className="text-12 text-accent-steel hover:underline flex items-center gap-1"
              >
                Propose Amendment <ChevronRight size={12} />
              </button>
            </div>

            {existing?.amendments.length ? (
              <div className="flex flex-col gap-2">
                {existing.amendments.map((a) => (
                  <div key={a.id} className="border border-border rounded-[4px] p-3 flex flex-col gap-1 bg-ink/30">
                    <div className="flex items-center justify-between">
                      <span className="text-12 font-medium text-text-primary">{a.amendment_type}</span>
                      <span className="text-11 font-mono text-text-muted">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <span className="text-12 text-text-muted">{a.reason}</span>
                    {a.is_violation && (
                      <span className="text-11 text-signal-risk font-mono">Flagged as a violation</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-12 text-text-faint">No amendments yet.</span>
            )}

            {amendOpen && (
              <div className="border border-border rounded-[4px] p-4 flex flex-col gap-3 bg-surface-raised">
                <select
                  value={amendType}
                  onChange={(e) => setAmendType(e.target.value)}
                  className="bg-ink border border-border rounded p-2 text-13 text-text-primary"
                >
                  <option value="ADD_TOURNAMENT">Add tournament</option>
                  <option value="MODIFY_TOURNAMENT">Modify tournament</option>
                  <option value="ADD_PLAYING_DAY">Add playing day</option>
                  <option value="OTHER">Other</option>
                </select>
                <textarea
                  placeholder="Detail"
                  value={amendDetail}
                  onChange={(e) => setAmendDetail(e.target.value)}
                  className="bg-ink border border-border rounded p-2 text-13 text-text-primary"
                  rows={2}
                />
                <textarea
                  placeholder="Reason"
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  className="bg-ink border border-border rounded p-2 text-13 text-text-primary"
                  rows={2}
                />
                <button
                  type="button"
                  disabled={saving || !amendReason}
                  onClick={handleProposeAmendment}
                  className="self-start px-4 py-1.5 bg-accent-steel text-text-primary rounded-[4px] text-12 font-medium disabled:opacity-50"
                >
                  Submit Amendment
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* DRAFT / CREATION FORM */}
          <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldBlock label="Weekly Intention">
                <input
                  value={weeklyIntention}
                  onChange={(e) => setWeeklyIntention(e.target.value)}
                  className="bg-ink border border-border rounded p-2 text-13 text-text-primary w-full"
                  placeholder="e.g. Build a stable, disciplined week"
                />
              </FieldBlock>
              <FieldBlock label="Weekly Focus">
                <input
                  value={weeklyFocus}
                  onChange={(e) => setWeeklyFocus(e.target.value)}
                  className="bg-ink border border-border rounded p-2 text-13 text-text-primary w-full"
                  placeholder="e.g. Tighter 3-bet defense"
                />
              </FieldBlock>
            </div>

            {/* Playing Days */}
            <ListEditor
              title="Playing Days"
              rows={days}
              onAdd={() => setDays([...days, emptyDay()])}
              onRemove={(i) => setDays(days.filter((_, idx) => idx !== i))}
              render={(row, i) => (
                <div className="flex items-center gap-3 flex-1">
                  <input
                    type="date"
                    value={row.planned_date}
                    onChange={(e) => {
                      const next = [...days];
                      next[i] = { ...next[i], planned_date: e.target.value };
                      setDays(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary"
                  />
                  <input
                    type="number"
                    min={1}
                    max={2}
                    value={row.planned_session_allocation}
                    onChange={(e) => {
                      const next = [...days];
                      next[i] = { ...next[i], planned_session_allocation: Number(e.target.value) };
                      setDays(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-20"
                  />
                  <span className="text-11 text-text-muted">session(s)</span>
                </div>
              )}
            />

            {/* Planned Tournaments */}
            <ListEditor
              title="Planned Tournaments"
              rows={tournaments}
              onAdd={() => setTournaments([...tournaments, emptyTournament(tournaments.length + 1)])}
              onRemove={(i) => setTournaments(tournaments.filter((_, idx) => idx !== i))}
              render={(row, i) => (
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={row.slot_number}
                    onChange={(e) => {
                      const next = [...tournaments];
                      next[i] = { ...next[i], slot_number: Number(e.target.value) };
                      setTournaments(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-16"
                    title="Slot number"
                  />
                  <input
                    placeholder="Tournament name"
                    value={row.tournament_name}
                    onChange={(e) => {
                      const next = [...tournaments];
                      next[i] = { ...next[i], tournament_name: e.target.value };
                      setTournaments(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary flex-1 min-w-[160px]"
                  />
                  <input
                    type="number"
                    min={1}
                    value={row.intended_buy_ins}
                    onChange={(e) => {
                      const next = [...tournaments];
                      next[i] = { ...next[i], intended_buy_ins: Number(e.target.value) };
                      setTournaments(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-20"
                    title="Intended buy-ins"
                  />
                  <input
                    type="date"
                    value={row.planned_date}
                    onChange={(e) => {
                      const next = [...tournaments];
                      next[i] = { ...next[i], planned_date: e.target.value };
                      setTournaments(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary"
                  />
                </div>
              )}
            />

            {/* Conditional Tournaments */}
            <ListEditor
              title="Conditional Tournaments (optional)"
              rows={conditionals}
              onAdd={() => setConditionals([...conditionals, emptyConditional()])}
              onRemove={(i) => setConditionals(conditionals.filter((_, idx) => idx !== i))}
              render={(row, i) => (
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                  <input
                    placeholder="Tournament name"
                    value={row.tournament_name}
                    onChange={(e) => {
                      const next = [...conditionals];
                      next[i] = { ...next[i], tournament_name: e.target.value };
                      setConditionals(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary flex-1 min-w-[160px]"
                  />
                  <input
                    placeholder="Activation condition"
                    value={row.activation_condition}
                    onChange={(e) => {
                      const next = [...conditionals];
                      next[i] = { ...next[i], activation_condition: e.target.value };
                      setConditionals(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary flex-1 min-w-[160px]"
                  />
                  <input
                    type="number"
                    min={1}
                    value={row.permitted_buy_ins}
                    onChange={(e) => {
                      const next = [...conditionals];
                      next[i] = { ...next[i], permitted_buy_ins: Number(e.target.value) };
                      setConditionals(next);
                    }}
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-20"
                  />
                </div>
              )}
            />

            {/* Commitments */}
            <ListEditor
              title="Player Commitments"
              rows={commitments}
              onAdd={() => setCommitments([...commitments, ''])}
              onRemove={(i) => setCommitments(commitments.filter((_, idx) => idx !== i))}
              render={(row, i) => (
                <input
                  value={row}
                  onChange={(e) => {
                    const next = [...commitments];
                    next[i] = e.target.value;
                    setCommitments(next);
                  }}
                  placeholder="e.g. No re-entries past midnight"
                  className="bg-ink border border-border rounded p-2 text-12 text-text-primary flex-1"
                />
              )}
            />

            {/* Validation feed */}
            {issues.length > 0 && (
              <div className="flex flex-col gap-2">
                {issues.map((iss, i) => (
                  <div key={i} className="flex items-start gap-2 text-signal-risk text-12">
                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                    <span>{iss.message}</span>
                  </div>
                ))}
              </div>
            )}
            {issues.length === 0 && (
              <div className="flex items-center gap-2 text-signal-process text-12">
                <CheckCircle2 size={14} />
                <span>Plan passes all deterministic checks.</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveDraft}
                className="px-4 py-2 bg-surface-raised border border-border text-text-primary rounded-[4px] text-13 font-medium disabled:opacity-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={saving || issues.length > 0}
                onClick={handleLock}
                className="px-4 py-2 bg-accent-steel text-text-primary rounded-[4px] text-13 font-medium disabled:opacity-50"
              >
                Validate & Lock
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-11 font-mono text-text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

function ReadOnlySection({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-11 font-mono text-text-muted uppercase">{title}</span>
      <span className="text-13 text-text-primary">{value}</span>
    </div>
  );
}

function ReadOnlyList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-11 font-mono text-text-muted uppercase">{title}</span>
      {items.length ? (
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={i} className="text-12 text-text-primary font-mono">
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-12 text-text-faint">None</span>
      )}
    </div>
  );
}

function ListEditor<T>({
  title,
  rows,
  onAdd,
  onRemove,
  render,
}: {
  title: string;
  rows: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-12 font-mono text-text-muted uppercase">{title}</span>
        <button type="button" onClick={onAdd} className="text-accent-steel hover:opacity-80 flex items-center gap-1 text-12">
          <Plus size={13} /> Add
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2 bg-ink/30 border border-border rounded-[4px] p-2">
            {render(row, i)}
            <button type="button" onClick={() => onRemove(i)} className="text-text-faint hover:text-signal-risk shrink-0">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}