// src/components/WeeklyGamePlanView.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Lock, Plus, Trash2, ShieldAlert, CheckCircle2 } from 'lucide-react';
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
  WGPContext,
  WGPFull,
  ValidationIssue,
} from '../lib/weeklyGamePlan';
import { WeeklyGamePlanTournament } from '../types';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage, formatDayMonth } from '../lib/utils';
import { PlayerId, asPokerWeekId, asFrameworkVersionId, asBRMAssignmentId, asWeeklyGamePlanId } from '../types/ids';

interface Props {
  userId: PlayerId;
}

// `session` (1 or 2) is a client-only bucketing concept for the dual-session
// planning grid — there is no session_number column on
// weekly_game_plan_tournaments, so it is never sent to Supabase and is
// re-derived on every load (see hydrateTournaments) rather than persisted.
interface TournamentRow {
  slot_number: number;
  tournament_name: string;
  intended_buy_ins: number;
  buy_in_amount: number;
  planned_date: string;
  session: 1 | 2;
}
interface ConditionalRow {
  tournament_name: string;
  activation_condition: string;
  permitted_buy_ins: number;
  buy_in_amount: number;
}

const emptyTournament = (slot: number, planned_date: string, session: 1 | 2): TournamentRow => ({
  slot_number: slot,
  tournament_name: '',
  intended_buy_ins: 1,
  buy_in_amount: 0,
  planned_date,
  session,
});
const emptyConditional = (): ConditionalRow => ({ tournament_name: '', activation_condition: '', permitted_buy_ins: 1, buy_in_amount: 0 });

function nextSlotNumber(tournaments: TournamentRow[]): number {
  return tournaments.reduce((max, t) => Math.max(max, t.slot_number), 0) + 1;
}

// Bucketing is derived, not stored: group by day, sort by slot_number, then
// alternate 1/2/1/2 within that day. Re-running this on every load is what
// keeps the split deterministic despite not being persisted.
function hydrateTournaments(rows: WeeklyGamePlanTournament[], fallbackDate: string): TournamentRow[] {
  const byDate = new Map<string, WeeklyGamePlanTournament[]>();
  rows.forEach((r) => {
    const key = r.planned_date || fallbackDate;
    const arr = byDate.get(key) || [];
    arr.push(r);
    byDate.set(key, arr);
  });
  const result: TournamentRow[] = [];
  byDate.forEach((arr, date) => {
    arr
      .slice()
      .sort((a, b) => a.slot_number - b.slot_number)
      .forEach((r, i) => {
        result.push({
          slot_number: r.slot_number,
          tournament_name: r.tournament_name,
          intended_buy_ins: r.intended_buy_ins,
          buy_in_amount: r.buy_in_amount ?? 0,
          planned_date: date,
          session: i % 2 === 0 ? 1 : 2,
        });
      });
  });
  return result;
}

function deriveDays(tournaments: TournamentRow[]): { planned_date: string; planned_session_allocation: number }[] {
  const map = new Map<string, number>();
  tournaments.forEach((t) => {
    if (!t.planned_date) return;
    map.set(t.planned_date, Math.max(map.get(t.planned_date) || 0, t.session));
  });
  return Array.from(map.entries()).map(([planned_date, planned_session_allocation]) => ({
    planned_date,
    planned_session_allocation,
  }));
}

function getWeekDates(startIso: string): string[] {
  const start = new Date(startIso);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    // Read the SAME local components back out directly, rather than going
    // through d.toISOString() — that converts to UTC and rolls the date
    // back a day for any timezone ahead of UTC (e.g. IST), which is the
    // "starting a day earlier" bug this fixes.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
}

export default function WeeklyGamePlanView({ userId }: Props) {
  const [ctx, setCtx] = useState<WGPContext | null>(null);
  const [existing, setExisting] = useState<WGPFull | null>(null);

  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [conditionals, setConditionals] = useState<ConditionalRow[]>([]);
  const [commitments, setCommitments] = useState<string[]>(['']);
  const [weeklyIntention, setWeeklyIntention] = useState('');
  const [weeklyFocus, setWeeklyFocus] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [saving, setSaving] = useState(false);

  const { loading, error, setError, reload: load } = useAsync(async () => {
    const coachId = await resolveCoachId(userId, 'PLAYER');
    const context = await resolveWGPContext(userId, coachId);
    setCtx(context);

    const fallbackDate = context.pokerWeek ? getWeekDates(context.pokerWeek.start_timestamp)[0] : '';

    if (context.pokerWeek) {
      const full = await fetchExistingWGP(userId, asPokerWeekId(context.pokerWeek.id));
      setExisting(full);
      if (full) {
        setWeeklyIntention(full.plan.weekly_intention || '');
        setWeeklyFocus(full.plan.weekly_focus || '');
        setTournaments(hydrateTournaments(full.tournaments, fallbackDate));
        setConditionals(
          full.conditionalTournaments.map((c) => ({
            tournament_name: c.tournament_name,
            activation_condition: c.activation_condition,
            permitted_buy_ins: c.permitted_buy_ins,
            buy_in_amount: c.buy_in_amount ?? 0,
          })),
        );
        setCommitments(full.commitments.length ? full.commitments.map((c) => c.commitment_text) : ['']);
      }
    }
  }, [userId]);

  const weekDates = useMemo(() => (ctx?.pokerWeek ? getWeekDates(ctx.pokerWeek.start_timestamp) : []), [ctx?.pokerWeek]);

  useEffect(() => {
    if (weekDates.length && !selectedDate) setSelectedDate(weekDates[0]);
  }, [weekDates, selectedDate]);

  const derivedDays = useMemo(() => deriveDays(tournaments.filter((t) => t.tournament_name)), [tournaments]);

  const runValidation = useCallback(
    (currentTournaments: TournamentRow[]) => {
      if (!ctx) return [];
      const named = currentTournaments.filter((t) => t.tournament_name);
      const v = validateWeeklyGamePlan(deriveDays(named), named, ctx);
      setIssues(v);
      return v;
    },
    [ctx],
  );

  useEffect(() => {
    if (ctx) runValidation(tournaments);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournaments, ctx]);

  const isLocked = existing?.plan.status === 'LOCKED';

  const updateTournament = (index: number, patch: Partial<TournamentRow>) => {
    setTournaments((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };
  const removeTournament = (index: number) => {
    setTournaments((prev) => prev.filter((_, i) => i !== index));
  };
  const addTournament = (session: 1 | 2) => {
    if (!selectedDate) return;
    // Slot rules are a per-session limit (how many tables at once — PRD
    // §10's "Exceeded Simultaneous Table Limits"), so slot numbers must
    // reset per (day, session) sitting rather than counting up across the
    // whole week — otherwise a coach's "1 table" BRM level would reject a
    // perfectly valid plan of four separate single-table sessions just
    // because they collectively used slot numbers 1-4.
    setTournaments((prev) => {
      const scoped = prev.filter((t) => t.planned_date === selectedDate && t.session === session);
      return [...prev, emptyTournament(nextSlotNumber(scoped), selectedDate, session)];
    });
  };

  const handleSaveDraft = async () => {
    if (!ctx?.pokerWeek) return;
    setSaving(true);
    setError(null);
    try {
      let plan = existing?.plan;
      if (!plan) {
        plan = await createDraftWGP(
          userId,
          asPokerWeekId(ctx.pokerWeek.id),
          ctx.frameworkVersion?.id ? asFrameworkVersionId(ctx.frameworkVersion.id) : null,
          ctx.brmAssignment?.id ? asBRMAssignmentId(ctx.brmAssignment.id) : null,
        );
      }
      const planId = asWeeklyGamePlanId(plan.id);
      const named = tournaments.filter((t) => t.tournament_name);
      await updateWGPIntentionFocus(planId, weeklyIntention, weeklyFocus);
      await replacePlayingDays(planId, deriveDays(named));
      await replaceTournaments(
        planId,
        named.map((t) => ({
          slot_number: t.slot_number,
          tournament_name: t.tournament_name,
          permitted_buy_ins: t.intended_buy_ins,
          intended_buy_ins: t.intended_buy_ins,
          planned_date: t.planned_date || null,
          buy_in_amount: t.buy_in_amount > 0 ? t.buy_in_amount : null,
        })),
      );
      await replaceConditionalTournaments(
        planId,
        conditionals
          .filter((c) => c.tournament_name)
          .map((c) => ({ ...c, buy_in_amount: c.buy_in_amount > 0 ? c.buy_in_amount : null })),
      );
      await replaceCommitments(
        planId,
        commitments.filter((c) => c.trim()).map((c) => ({ commitment_text: c })),
      );
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to save draft.'));
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    if (!ctx?.pokerWeek) return;
    const v = runValidation(tournaments);
    if (v.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await handleSaveDraft();
      const planId = existing?.plan.id ? asWeeklyGamePlanId(existing.plan.id) : null;
      if (!planId) {
        // handleSaveDraft() reloaded `existing` via load() only after this
        // function returns in the next render — fetch fresh instead.
        const full = await fetchExistingWGP(userId, asPokerWeekId(ctx.pokerWeek.id));
        if (full) await lockWeeklyGamePlan(asWeeklyGamePlanId(full.plan.id));
      } else {
        await lockWeeklyGamePlan(planId);
      }
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to lock plan.'));
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

  const dayIndices = tournaments
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.planned_date === selectedDate);
  const session1Rows = dayIndices.filter(({ row }) => row.session === 1);
  const session2Rows = dayIndices.filter(({ row }) => row.session === 2);
  const selectedLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    : '';

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
            {formatDayMonth(ctx.pokerWeek.start_timestamp)} - {formatDayMonth(ctx.pokerWeek.end_timestamp)}
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

              <WeekStrip weekDates={weekDates} derivedDays={derivedDays} selectedDate={selectedDate} onSelect={setSelectedDate} />

              <div className="flex flex-col gap-3">
                <span className="text-13 font-semibold text-text-primary">{selectedLabel}</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SessionTable title="Session 1" rows={session1Rows} readOnly />
                  <SessionTable title="Session 2" rows={session2Rows} readOnly />
                </div>
              </div>

              <ReadOnlyList
                title="Activation Conditions"
                items={conditionals.map(
                  (c) =>
                    `${c.tournament_name} (if: ${c.activation_condition}) — ${c.permitted_buy_ins} buy-in(s)` +
                    (c.buy_in_amount ? ` @ ₹${c.buy_in_amount}` : '')
                )}
              />
              <ReadOnlyList title="Commitments" items={commitments.filter((c) => c.trim())} />
            </div>
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

            {/* Temporal Navigation — Week Strip */}
            <WeekStrip weekDates={weekDates} derivedDays={derivedDays} selectedDate={selectedDate} onSelect={setSelectedDate} />

            {/* Dual-Session Planning Grid */}
            <div className="flex flex-col gap-3">
              <span className="text-13 font-semibold text-text-primary">{selectedLabel}</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SessionTable
                  title="Session 1"
                  rows={session1Rows}
                  onAdd={() => addTournament(1)}
                  onChange={updateTournament}
                  onRemove={removeTournament}
                />
                <SessionTable
                  title="Session 2"
                  rows={session2Rows}
                  onAdd={() => addTournament(2)}
                  onChange={updateTournament}
                  onRemove={removeTournament}
                />
              </div>
            </div>

            {/* Conditional Tournaments — activation conditions, week-wide */}
            <ListEditor
              title="Activation Conditions (Conditional Tournaments)"
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
                    title="Permitted buy-ins"
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-20"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Amount (₹)"
                    value={row.buy_in_amount || ''}
                    onChange={(e) => {
                      const next = [...conditionals];
                      next[i] = { ...next[i], buy_in_amount: Number(e.target.value) };
                      setConditionals(next);
                    }}
                    title="Buy-in amount (₹)"
                    className="bg-ink border border-border rounded p-2 text-12 text-text-primary w-24"
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

// Temporal Navigation — a horizontal strip of seven day cards for the Poker
// Week, each flagged PLANNED (blue dot) or EMPTY based on derivedDays, with
// the current selection carrying a high-contrast accent border.
function WeekStrip({
  weekDates,
  derivedDays,
  selectedDate,
  onSelect,
}: {
  weekDates: string[];
  derivedDays: { planned_date: string; planned_session_allocation: number }[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const plannedDates = new Set(derivedDays.map((d) => d.planned_date));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-11 font-mono text-text-muted uppercase">Poker Week</span>
      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
          const d = new Date(`${date}T00:00:00`);
          const planned = plannedDates.has(date);
          const selected = date === selectedDate;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-[4px] border transition-colors ${
                selected ? 'border-accent-steel bg-accent-steel/10' : 'border-border bg-ink/30 hover:border-accent-steel/50'
              }`}
            >
              <span className="text-10 font-mono text-text-muted uppercase">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="text-13 text-text-primary font-medium">{d.getDate()}</span>
              <span className="flex items-center gap-1 text-10 font-mono uppercase h-3">
                {planned ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-steel shrink-0" />
                    <span className="text-accent-steel">Planned</span>
                  </>
                ) : (
                  <span className="text-text-faint">Empty</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// One column of the Dual-Session Planning Grid: Table (BRM slot rule),
// Identifier and Buy-in for a single session block of a single day.
function SessionTable({
  title,
  rows,
  readOnly,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  rows: { row: TournamentRow; index: number }[];
  readOnly?: boolean;
  onAdd?: () => void;
  onChange?: (index: number, patch: Partial<TournamentRow>) => void;
  onRemove?: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-12 font-mono text-text-muted uppercase">{title}</span>
        {!readOnly && (
          <button type="button" onClick={onAdd} className="text-accent-steel hover:opacity-80 flex items-center gap-1 text-12">
            <Plus size={13} /> Add
          </button>
        )}
      </div>
      <div className="border border-border rounded-[4px] overflow-hidden">
        <table className="w-full text-12">
          <thead>
            <tr className="bg-surface-raised/60 text-text-muted text-11 font-mono uppercase">
              <th className="text-left px-2 py-1.5 w-14">Table</th>
              <th className="text-left px-2 py-1.5">Identifier</th>
              <th className="text-right px-2 py-1.5 w-16">Buy-ins</th>
              <th className="text-right px-2 py-1.5 w-24">Amount (₹)</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 4 : 5} className="px-2 py-3 text-center text-text-faint text-12">
                  {readOnly ? 'None planned.' : 'No tournaments yet.'}
                </td>
              </tr>
            )}
            {rows.map(({ row, index }) => (
              <tr key={index} className="border-t border-border">
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    row.slot_number
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={row.slot_number}
                      onChange={(e) => onChange?.(index, { slot_number: Number(e.target.value) })}
                      className="bg-ink border border-border rounded p-1 text-12 text-text-primary w-12"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {readOnly ? (
                    row.tournament_name
                  ) : (
                    <input
                      value={row.tournament_name}
                      placeholder="Tournament name"
                      onChange={(e) => onChange?.(index, { tournament_name: e.target.value })}
                      className="bg-ink border border-border rounded p-1 text-12 text-text-primary w-full"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {readOnly ? (
                    row.intended_buy_ins
                  ) : (
                    <input
                      type="number"
                      min={1}
                      value={row.intended_buy_ins}
                      onChange={(e) => onChange?.(index, { intended_buy_ins: Number(e.target.value) })}
                      className="bg-ink border border-border rounded p-1 text-12 text-text-primary w-16 text-right"
                    />
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {readOnly ? (
                    row.buy_in_amount ? `₹${row.buy_in_amount}` : '—'
                  ) : (
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={row.buy_in_amount || ''}
                      onChange={(e) => onChange?.(index, { buy_in_amount: Number(e.target.value) })}
                      className="bg-ink border border-border rounded p-1 text-12 text-text-primary w-20 text-right"
                    />
                  )}
                </td>
                {!readOnly && (
                  <td className="px-1">
                    <button type="button" onClick={() => onRemove?.(index)} className="text-text-faint hover:text-signal-risk">
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
