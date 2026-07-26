import React, { useState } from 'react';
import { Lock, AlertTriangle, CheckCircle2, Repeat, X } from 'lucide-react';
import {
  fetchCurrentPokerWeek,
  fetchLockedWeeklyGamePlan,
  fetchWeeklyBRMAssignment,
  computeCapacity,
  computeTodayBoundaries,
  toLocalDateKey,
  fetchExistingContractForSession,
  createValidatedSessionContract,
  lockContractAndStartSession,
  fetchLockedContractTournaments,
  fetchSubstitutions,
  substituteTournament,
  WGPTournamentSlot,
  WGPConditionalTournament,
  SessionContractRow,
  SessionContractSubstitutionRow,
  SessionContractTournamentRow,
  CapacityState,
  WeeklyBRMAssignmentSummary,
  WeeklyGamePlanSummary,
} from '../lib/sessionContract';
import { supabase } from '../lib/supabase';
import { formatCurrency, getErrorMessage } from '../lib/utils';
import { useAsync } from '../lib/useAsync';
import { fetchAvailablePreparationRecord, PreparationRecordRow } from '../lib/preparation';
import { fetchSlotRulesForBRMLevel, fetchMaxTournamentBuyInForLevel } from '../lib/brmRules';
import {
  PlayerId, CoachId, SessionId, SessionContractId, PokerWeekId, BoundaryConfigId, WGPTournamentSlotId, BRMLevelId,
  asCoachId, asSessionContractId, asPreparationId, asWGPTournamentSlotId,
} from '../types/ids';

interface SessionContractViewProps {
  userId: PlayerId;
  onSessionStarted: (sessionId: SessionId) => void;
  onGoToPrepare: () => void;
}

export default function SessionContractView({ userId, onSessionStarted, onGoToPrepare }: SessionContractViewProps) {
  const [coachId, setCoachId] = useState<CoachId | null>(null);
  const [pokerWeekId, setPokerWeekId] = useState<PokerWeekId | null>(null);
  const [boundaryConfigId, setBoundaryConfigId] = useState<BoundaryConfigId | null>(null);
  const [plan, setPlan] = useState<WeeklyGamePlanSummary | null>(null);
  const [slots, setSlots] = useState<WGPTournamentSlot[]>([]);
  const [conditionals, setConditionals] = useState<WGPConditionalTournament[]>([]);
  const [brmAssignment, setBrmAssignment] = useState<WeeklyBRMAssignmentSummary | null>(null);
  const [capacity, setCapacity] = useState<CapacityState | null>(null);
  const [contract, setContract] = useState<SessionContractRow | null>(null);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [selectedConditionalIds, setSelectedConditionalIds] = useState<Set<string>>(new Set());
  const [intention, setIntention] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [substitutions, setSubstitutions] = useState<SessionContractSubstitutionRow[]>([]);
  const [lockedSlots, setLockedSlots] = useState<SessionContractTournamentRow[]>([]);
  const [availablePreparation, setAvailablePreparation] = useState<PreparationRecordRow | null>(null);

  const { loading, error, setError, reload: load } = useAsync(async () => {
    const { data: profile } = await supabase.from('profiles').select('coach_id').eq('id', userId).single();
    setCoachId(profile?.coach_id ? asCoachId(profile.coach_id) : null);

    setAvailablePreparation(await fetchAvailablePreparationRecord(userId));

    const week = await fetchCurrentPokerWeek(userId);
    if (!week) {
      throw new Error('No active Poker Week found for the current time. Ask your coach to check the boundary configuration.');
    }
    setPokerWeekId(week.id);
    setBoundaryConfigId(week.boundary_config_id);

    const wgpResult = await fetchLockedWeeklyGamePlan(userId, week.id);
    if (!wgpResult) {
      throw new Error('No locked Weekly Game Plan for this Poker Week yet. Create and lock one under Plan.');
    }
    setPlan(wgpResult.plan);

    // Table/slot numbers reset per planned day (and per session within a
    // day) in the Weekly Game Plan — see WeeklyGamePlanView's addTournament
    // — so the same slot_number legitimately repeats across different days.
    // A Session Contract is for one sitting, and session_contract_tournaments
    // enforces UNIQUE(session_contract_id, slot_number), so the picker must
    // only offer today's planned tournaments, never the whole week's.
    const today = await computeTodayBoundaries(week.boundary_config_id);
    const todayKey = toLocalDateKey(today.start);
    setSlots(wgpResult.tournaments.filter((t) => t.planned_date === todayKey));
    setConditionals(wgpResult.conditionals);

    const brm = await fetchWeeklyBRMAssignment(userId, week.id);
    if (!brm) {
      throw new Error('No locked BRM assignment for this Poker Week. Ask your coach to run the weekly review.');
    }
    setBrmAssignment(brm);

    const cap = await computeCapacity(userId, week, brm);
    setCapacity(cap);

    const existing = await fetchExistingContractForSession(userId, wgpResult.plan.id);
    if (existing) {
      setContract(existing);
      if (existing.status === 'LOCKED') {
        const [tourns, subs] = await Promise.all([
          fetchLockedContractTournaments(asSessionContractId(existing.id)),
          fetchSubstitutions(asSessionContractId(existing.id)),
        ]);
        setLockedSlots(tourns);
        setSubstitutions(subs);
      }
    }
  }, [userId]);

  const toggleSlot = (id: string) => {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleConditional = (id: string) => {
    setSelectedConditionalIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleValidate = async () => {
    if (!plan || !brmAssignment || !capacity || !coachId) return;
    const selectedSlots = slots.filter((s) => selectedSlotIds.has(s.id));

    // Two sessions planned for the same day both use table numbers starting
    // at 1 (see WeeklyGamePlanView's addTournament) — today's filter alone
    // can't separate them, since session isn't persisted. Catch it here with
    // a clear message rather than letting the DB's unique constraint on
    // (session_contract_id, slot_number) throw.
    const seenSlotNumbers = new Set<number>();
    const duplicateTable = selectedSlots.find((s) => {
      if (seenSlotNumbers.has(s.slot_number)) return true;
      seenSlotNumbers.add(s.slot_number);
      return false;
    });
    if (duplicateTable) {
      setError(`Table ${duplicateTable.slot_number} is selected more than once — pick tournaments from a single session only.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createValidatedSessionContract({
        playerId: userId,
        coachId,
        plan,
        brmAssignment,
        capacity,
        selectedSlots,
        selectedConditionals: conditionals.filter((c) => selectedConditionalIds.has(c.id)),
        sessionIntention: intention,
      });
      setContract(created);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStartSession = async () => {
    if (!contract || !availablePreparation) return;
    setSaving(true);
    setError(null);
    try {
      const { sessionId } = await lockContractAndStartSession({
        contractId: asSessionContractId(contract.id),
        preparationId: asPreparationId(availablePreparation.id),
      });
      onSessionStarted(sessionId);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
        <span className="text-12 font-mono text-text-muted ml-3">Loading Session Contract context…</span>
      </div>
    );
  }

  if (error && !contract) {
    return (
      <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 flex items-start gap-3">
        <AlertTriangle size={18} className="text-signal-risk shrink-0 mt-0.5" />
        <p className="text-14 text-text-primary leading-relaxed">{error}</p>
      </div>
    );
  }

  // ---- LOCKED VIEW ----
  if (contract?.status === 'LOCKED') {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-surface border border-border rounded-[6px] overflow-hidden">
          <div className="bg-surface-raised/60 border-b border-border px-4 py-3 flex items-center gap-2">
            <Lock size={14} className="text-text-muted" />
            <span className="text-13 text-text-primary">
              Locked at {new Date(contract.locked_at!).toLocaleString()}. This is your contract for the session.
            </span>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3 text-12 font-mono">
              <div className="flex flex-col">
                <span className="text-text-muted">SESSION STOP LOSS</span>
                <span className="text-text-primary text-16 mt-1">{formatCurrency(contract.session_stop_loss)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-text-muted">DAY CAPACITY (AT LOCK)</span>
                <span className="text-text-primary text-16 mt-1">{contract.remaining_day_capacity_snapshot !== null ? formatCurrency(contract.remaining_day_capacity_snapshot) : '—'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-text-muted">WEEK CAPACITY (AT LOCK)</span>
                <span className="text-text-primary text-16 mt-1">{contract.remaining_week_capacity_snapshot !== null ? formatCurrency(contract.remaining_week_capacity_snapshot) : '—'}</span>
              </div>
            </div>

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              {lockedSlots.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-13 bg-surface-raised/40 rounded-[4px] px-3 py-2">
                  <span className="text-text-primary">{s.tournament_name}</span>
                  <span className="font-mono text-text-muted">
                    Max {s.permitted_buy_ins} buy-ins{s.buy_in_amount ? ` @ ${formatCurrency(s.buy_in_amount)}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {substitutions.map((sub) => (
          <div key={sub.id} className="bg-surface border border-signal-caution/30 rounded-[6px] p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-12 font-mono text-signal-caution uppercase">
              <Repeat size={12} /> Substitution — {sub.created_at ? new Date(sub.created_at).toLocaleString() : '—'}
            </div>
            <span className="text-13 text-text-primary">→ {sub.replacement_tournament_name}</span>
            <span className="text-12 text-text-muted">Reason: {sub.reason}</span>
            {!sub.passed_brm_validation && (
              <span className="text-11 text-signal-risk">Did not pass BRM validation at time of substitution.</span>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => setShowSubForm(true)}
          className="self-start text-13 text-accent-steel hover:underline"
        >
          Substitute this tournament
        </button>

        {showSubForm && contract && brmAssignment && (
          <SubstitutionPanel
            contractId={asSessionContractId(contract.id)}
            slots={lockedSlots}
            substitutions={substitutions}
            brmLevelId={brmAssignment.brm_level_id}
            onClose={() => setShowSubForm(false)}
            onSaved={() => {
              setShowSubForm(false);
              load();
            }}
          />
        )}
      </div>
    );
  }

  // ---- VALIDATED, AWAITING SESSION START ----
  if (contract?.status === 'VALIDATED') {
    return (
      <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-signal-process">
          <CheckCircle2 size={16} />
          <span className="text-14 font-medium">Session Contract validated — ready to lock and start.</span>
        </div>
        <div className="text-12 font-mono text-text-muted">
          Effective Session Loss Limit: {formatCurrency(contract.effective_session_loss_limit_at_creation)}
        </div>
        {error && <span className="text-12 text-signal-risk">{error}</span>}
        {!availablePreparation && (
          <div className="flex items-start gap-2 bg-signal-caution/10 border border-signal-caution/30 rounded-[4px] p-3">
            <AlertTriangle size={14} className="text-signal-caution mt-0.5 shrink-0" />
            <div className="flex flex-col gap-2">
              <span className="text-12 text-signal-caution">
                Complete a Preparation Check-in before starting this session.
              </span>
              <button
                type="button"
                onClick={onGoToPrepare}
                className="self-start text-12 text-accent-steel hover:underline"
              >
                Go to Prepare
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={saving || !availablePreparation}
          onClick={handleStartSession}
          className="w-full h-11 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/90 text-14 font-medium disabled:opacity-50"
        >
          {saving ? 'Locking…' : 'Lock Contract & Start Session'}
        </button>
      </div>
    );
  }

  // ---- CREATION VIEW ----
  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-5">
      <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
        Select from today's locked Weekly Game Plan
      </span>

      {slots.length === 0 && conditionals.length === 0 && (
        <div className="flex items-start gap-2 bg-signal-caution/10 border border-signal-caution/30 rounded-[4px] p-3">
          <AlertTriangle size={14} className="text-signal-caution mt-0.5 shrink-0" />
          <span className="text-12 text-signal-caution">
            No tournaments are planned for today in your locked Weekly Game Plan.
          </span>
        </div>
      )}

      {capacity?.blocked && (
        <div className="flex items-start gap-2 bg-signal-risk/10 border border-signal-risk/30 rounded-[4px] p-3">
          <AlertTriangle size={14} className="text-signal-risk mt-0.5 shrink-0" />
          <span className="text-12 text-signal-risk">
            Coach Configuration Required — no BRM capacity remains for a new authorized session right now.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {slots.map((slot) => (
          <label
            key={slot.id}
            className={`flex items-center justify-between p-3 rounded-[4px] border cursor-pointer transition-colors ${
              selectedSlotIds.has(slot.id) ? 'border-accent-steel bg-accent-steel/5' : 'border-border bg-surface-raised/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedSlotIds.has(slot.id)}
                onChange={() => toggleSlot(slot.id)}
                disabled={!!capacity?.blocked}
              />
              <div className="flex flex-col">
                <span className="text-14 text-text-primary">{slot.tournament_name}</span>
                <span className="text-11 font-mono text-text-faint">Slot {slot.slot_number}</span>
              </div>
            </div>
            <span className="text-12 font-mono text-text-muted">
              Max {slot.permitted_buy_ins} buy-ins{slot.buy_in_amount ? ` @ ${formatCurrency(slot.buy_in_amount)}` : ''}
            </span>
          </label>
        ))}

        {conditionals.map((c) => (
          <label
            key={c.id}
            className={`flex items-center justify-between p-3 rounded-[4px] border cursor-pointer transition-colors ${
              selectedConditionalIds.has(c.id) ? 'border-accent-steel bg-accent-steel/5' : 'border-border bg-surface-raised/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selectedConditionalIds.has(c.id)}
                onChange={() => toggleConditional(c.id)}
                disabled={!!capacity?.blocked}
              />
              <div className="flex flex-col">
                <span className="text-14 text-text-primary">{c.tournament_name}</span>
                <span className="text-11 text-text-faint">If: {c.activation_condition}</span>
              </div>
            </div>
            <span className="text-12 font-mono text-text-muted">
              Max {c.permitted_buy_ins} buy-ins{c.buy_in_amount ? ` @ ${formatCurrency(c.buy_in_amount)}` : ''}
            </span>
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-12 font-mono text-text-muted uppercase">Session Intention (optional)</span>
        <input
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          className="input"
          placeholder="e.g. Play tight, avoid marginal 3-bet defends"
        />
      </label>

      {capacity && (
        <div className="grid grid-cols-3 gap-3 text-12 font-mono border-t border-border pt-3">
          <div className="flex flex-col">
            <span className="text-text-muted">SESSION LIMIT</span>
            <span className="text-text-primary">{formatCurrency(brmAssignment?.session_stop_loss_snapshot ?? 0)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-text-muted">REMAINING DAY</span>
            <span className="text-text-primary">{formatCurrency(capacity.remainingDayCapacity)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-text-muted">REMAINING WEEK</span>
            <span className="text-text-primary">{formatCurrency(capacity.remainingWeekCapacity)}</span>
          </div>
        </div>
      )}

      {error && <span className="text-12 text-signal-risk">{error}</span>}

      <button
        type="button"
        disabled={saving || capacity?.blocked}
        onClick={handleValidate}
        className="w-full h-11 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/90 text-14 font-medium disabled:opacity-50"
      >
        {saving ? 'Validating…' : 'Validate Session Contract'}
      </button>
    </div>
  );
}

export function SubstitutionPanel({
  contractId,
  slots,
  substitutions,
  brmLevelId,
  onClose,
  onSaved,
}: {
  contractId: SessionContractId;
  slots: SessionContractTournamentRow[];
  substitutions: SessionContractSubstitutionRow[];
  brmLevelId: BRMLevelId;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A slot can only be substituted once — BRM's per-session simultaneous-
  // table limit was already validated against the fixed slot count at
  // contract creation (weeklyGamePlan.ts's validateWeeklyGamePlan); letting
  // the same slot be re-substituted repeatedly would silently let a player
  // stack more distinct tournaments into one sitting than that count
  // permits. A substitution changes which tournament occupies a slot, it
  // doesn't add a new one.
  const availableSlots = slots.filter((s) => !substitutions.some((sub) => sub.original_slot_id === s.id));
  const [originalSlotId, setOriginalSlotId] = useState(availableSlots[0]?.id ?? '');
  const [name, setName] = useState('');
  const [buyIns, setBuyIns] = useState('1');
  const [buyInAmount, setBuyInAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set once the BRM re-check below fails — holds the panel in a confirm
  // step ("are you sure?") instead of writing immediately. Truthful logging
  // is never blocked (§5): the player can still record a non-compliant
  // substitution, they just have to explicitly acknowledge it first, the
  // same posture EndSessionConfirm uses elsewhere in the app.
  const [brmWarning, setBrmWarning] = useState<string | null>(null);

  const doSubmit = async (permittedBuyIns: number, amount: number, passed: boolean) => {
    setSaving(true);
    setErr(null);
    try {
      await substituteTournament({
        contractId,
        originalSlotId: originalSlotId ? asWGPTournamentSlotId(originalSlotId) : null,
        replacementTournamentName: name,
        replacementPermittedBuyIns: permittedBuyIns,
        replacementBuyInAmount: amount,
        reason,
        passedBrmValidation: passed,
      });
      onSaved();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    const amount = parseFloat(buyInAmount);
    if (!name.trim() || !reason.trim() || isNaN(amount) || amount <= 0) {
      setErr('Replacement tournament, a positive buy-in amount, and reason are all required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const permittedBuyIns = parseInt(buyIns, 10);

      // Real re-check against the coach's BRM-configured rules (same rules
      // weeklyGamePlan.ts's validateWeeklyGamePlan enforces at plan
      // creation): the replacement's permitted buy-ins can't exceed what
      // the original slot's table number is allowed, and its buy-in amount
      // can't exceed the BRM level's flat per-tournament maximum.
      const originalSlot = availableSlots.find((s) => s.id === originalSlotId);
      const [slotRules, maxTournamentBuyIn] = await Promise.all([
        fetchSlotRulesForBRMLevel(brmLevelId),
        fetchMaxTournamentBuyInForLevel(brmLevelId),
      ]);
      const rule = originalSlot ? slotRules?.find((r) => r.slotNumber === originalSlot.slot_number) : null;
      const countOk = permittedBuyIns > 0 && !!rule && permittedBuyIns <= rule.maxBuyIns;
      const amountOk = maxTournamentBuyIn === null || amount <= maxTournamentBuyIn;
      const passed = countOk && amountOk;

      if (!passed) {
        const reasons: string[] = [];
        if (!countOk) {
          reasons.push(
            !rule
              ? `Table ${originalSlot?.slot_number ?? '?'} isn't permitted at your current BRM level`
              : `${permittedBuyIns} permitted buy-in(s) exceeds your BRM limit of ${rule.maxBuyIns} for this table`
          );
        }
        if (!amountOk) {
          reasons.push(`${formatCurrency(amount)} exceeds your BRM per-tournament maximum of ${formatCurrency(maxTournamentBuyIn!)}`);
        }
        setSaving(false);
        setBrmWarning(`${reasons.join('. ')} — this substitution will be recorded as non-compliant.`);
        return;
      }

      await doSubmit(permittedBuyIns, amount, true);
    } catch (e) {
      setErr(getErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/60" onClick={onClose}>
      <div className="w-full max-w-sm h-full bg-surface border-l border-border p-6 flex flex-col gap-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-16 font-display text-text-primary">Substitute Tournament</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
        </div>
        {err && <span className="text-12 text-signal-risk">{err}</span>}
        {availableSlots.length === 0 ? (
          <div className="flex items-start gap-2 bg-signal-caution/10 border border-signal-caution/30 rounded-[4px] p-3">
            <span className="text-12 text-signal-caution leading-relaxed">
              Every locked tournament has already been substituted this session — a slot can only be substituted once.
            </span>
          </div>
        ) : (
        <>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Original Slot</span>
          <select
            value={originalSlotId}
            onChange={(e) => { setOriginalSlotId(e.target.value); setBrmWarning(null); }}
            disabled={!!brmWarning}
            className="input"
          >
            {availableSlots.map((s) => <option key={s.id} value={s.id}>{s.tournament_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Replacement Tournament</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setBrmWarning(null); }} disabled={!!brmWarning} className="input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Permitted Buy-ins</span>
          <input
            type="number"
            value={buyIns}
            onChange={(e) => { setBuyIns(e.target.value); setBrmWarning(null); }}
            disabled={!!brmWarning}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Buy-in Amount (₹)</span>
          <input
            type="number"
            value={buyInAmount}
            onChange={(e) => { setBuyInAmount(e.target.value); setBrmWarning(null); }}
            disabled={!!brmWarning}
            placeholder="5500"
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Reason</span>
          <textarea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setBrmWarning(null); }} disabled={!!brmWarning} className="input" />
        </label>
        </>
        )}

        {availableSlots.length > 0 && (brmWarning ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 bg-signal-risk/10 border border-signal-risk/30 rounded-[4px] p-3">
              <AlertTriangle size={14} className="text-signal-risk mt-0.5 shrink-0" />
              <span className="text-12 text-signal-risk leading-relaxed">{brmWarning} Are you sure you want to continue?</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBrmWarning(null)}
                className="flex-1 h-10 border border-border rounded-[4px] text-13 text-text-muted"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => doSubmit(parseInt(buyIns, 10), parseFloat(buyInAmount), false)}
                className="flex-1 h-10 bg-signal-risk text-text-primary rounded-[4px] text-13 font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Log Anyway'}
              </button>
            </div>
          </div>
        ) : (
          <button disabled={saving} onClick={submit} className="h-10 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Confirm Substitution'}
          </button>
        ))}
      </div>
    </div>
  );
}