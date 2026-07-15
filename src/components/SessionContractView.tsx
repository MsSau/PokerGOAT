import React, { useEffect, useState, useCallback } from 'react';
import { Lock, AlertTriangle, CheckCircle2, Repeat, X } from 'lucide-react';
import {
  fetchCurrentPokerWeek,
  fetchLockedWeeklyGamePlan,
  fetchWeeklyBRMAssignment,
  computeCapacity,
  fetchExistingContractForSession,
  createValidatedSessionContract,
  lockContractAndStartSession,
  fetchLockedContractTournaments,
  fetchSubstitutions,
  substituteTournament,
  WGPTournamentSlot,
  WGPConditionalTournament,
  SessionContractRow,
  CapacityState,
} from '../lib/sessionContract';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

interface SessionContractViewProps {
  userId: string;
  onSessionStarted: (sessionId: string) => void;
}

export default function SessionContractView({ userId, onSessionStarted }: SessionContractViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [pokerWeekId, setPokerWeekId] = useState<string | null>(null);
  const [boundaryConfigId, setBoundaryConfigId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ id: string } | null>(null);
  const [slots, setSlots] = useState<WGPTournamentSlot[]>([]);
  const [conditionals, setConditionals] = useState<WGPConditionalTournament[]>([]);
  const [brmAssignment, setBrmAssignment] = useState<any>(null);
  const [capacity, setCapacity] = useState<CapacityState | null>(null);
  const [contract, setContract] = useState<SessionContractRow | null>(null);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [selectedConditionalIds, setSelectedConditionalIds] = useState<Set<string>>(new Set());
  const [intention, setIntention] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [lockedSlots, setLockedSlots] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: profile } = await supabase.from('profiles').select('coach_id').eq('id', userId).single();
      setCoachId(profile?.coach_id ?? null);

      const week = await fetchCurrentPokerWeek(userId);
      if (!week) {
        setError('No active Poker Week found for the current time. Ask your coach to check the boundary configuration.');
        return;
      }
      setPokerWeekId(week.id);
      setBoundaryConfigId(week.boundary_config_id);

      const wgpResult = await fetchLockedWeeklyGamePlan(userId, week.id);
      if (!wgpResult) {
        setError('No locked Weekly Game Plan for this Poker Week yet. Create and lock one under Plan.');
        return;
      }
      setPlan(wgpResult.plan);
      setSlots(wgpResult.tournaments);
      setConditionals(wgpResult.conditionals);

      const brm = await fetchWeeklyBRMAssignment(userId, week.id);
      if (!brm) {
        setError('No locked BRM assignment for this Poker Week. Ask your coach to run the weekly review.');
        return;
      }
      setBrmAssignment(brm);

      const cap = await computeCapacity(userId, week, brm);
      setCapacity(cap);

      const existing = await fetchExistingContractForSession(userId, wgpResult.plan.id);
      if (existing) {
        setContract(existing);
        if (existing.status === 'LOCKED') {
          const [tourns, subs] = await Promise.all([
            fetchLockedContractTournaments(existing.id),
            fetchSubstitutions(existing.id),
          ]);
          setLockedSlots(tourns);
          setSubstitutions(subs);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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
    setSaving(true);
    setError(null);
    try {
      const created = await createValidatedSessionContract({
        playerId: userId,
        coachId,
        plan: plan as any,
        brmAssignment,
        capacity,
        selectedSlots: slots.filter((s) => selectedSlotIds.has(s.id)),
        selectedConditionals: conditionals.filter((c) => selectedConditionalIds.has(c.id)),
        sessionIntention: intention,
      });
      setContract(created);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartSession = async () => {
    if (!contract) return;
    setSaving(true);
    setError(null);
    try {
      const { sessionId } = await lockContractAndStartSession({
        playerId: userId,
        contractId: contract.id,
      });
      onSessionStarted(sessionId);
    } catch (err: any) {
      setError(err.message);
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
                <span className="text-text-primary text-16 mt-1">{formatCurrency(contract.remaining_day_capacity_snapshot)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-text-muted">WEEK CAPACITY (AT LOCK)</span>
                <span className="text-text-primary text-16 mt-1">{formatCurrency(contract.remaining_week_capacity_snapshot)}</span>
              </div>
            </div>

            <div className="border-t border-border pt-3 flex flex-col gap-2">
              {lockedSlots.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-13 bg-surface-raised/40 rounded-[4px] px-3 py-2">
                  <span className="text-text-primary">{s.tournament_name}</span>
                  <span className="font-mono text-text-muted">Max {s.permitted_buy_ins} buy-ins</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {substitutions.map((sub) => (
          <div key={sub.id} className="bg-surface border border-signal-caution/30 rounded-[6px] p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-12 font-mono text-signal-caution uppercase">
              <Repeat size={12} /> Substitution — {new Date(sub.created_at).toLocaleString()}
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

        {showSubForm && contract && (
          <SubstitutionPanel
            contractId={contract.id}
            slots={lockedSlots}
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
        <button
          type="button"
          disabled={saving}
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
        Select from your locked Weekly Game Plan
      </span>

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
            <span className="text-12 font-mono text-text-muted">Max {slot.permitted_buy_ins} buy-ins</span>
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
            <span className="text-12 font-mono text-text-muted">Max {c.permitted_buy_ins} buy-ins</span>
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

function SubstitutionPanel({
  contractId,
  slots,
  onClose,
  onSaved,
}: {
  contractId: string;
  slots: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [originalSlotId, setOriginalSlotId] = useState(slots[0]?.id ?? '');
  const [name, setName] = useState('');
  const [buyIns, setBuyIns] = useState('1');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !reason.trim()) {
      setErr('Replacement tournament and reason are both required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      // MVP validation: buy-in count must be a positive integer. A full
      // BRM re-check (max tournament buy-in $, slot rules) belongs in the
      // shared BRM validation module — wire in once that module exists.
      const passed = parseInt(buyIns, 10) > 0;
      await substituteTournament({
        contractId,
        originalSlotId: originalSlotId || null,
        replacementTournamentName: name,
        replacementPermittedBuyIns: parseInt(buyIns, 10),
        reason,
        passedBrmValidation: passed,
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/60" onClick={onClose}>
      <div className="w-full max-w-sm h-full bg-surface border-l border-border p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-16 font-display text-text-primary">Substitute Tournament</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={18} /></button>
        </div>
        {err && <span className="text-12 text-signal-risk">{err}</span>}
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Original Slot</span>
          <select value={originalSlotId} onChange={(e) => setOriginalSlotId(e.target.value)} className="input">
            {slots.map((s) => <option key={s.id} value={s.id}>{s.tournament_name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Replacement Tournament</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Permitted Buy-ins</span>
          <input type="number" value={buyIns} onChange={(e) => setBuyIns(e.target.value)} className="input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase">Reason</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
        </label>
        <button disabled={saving} onClick={submit} className="h-10 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium disabled:opacity-50">
          {saving ? 'Saving…' : 'Confirm Substitution'}
        </button>
      </div>
    </div>
  );
}