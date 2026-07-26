import React, { useState } from 'react';
import { Plus, RefreshCcw, Flag, CheckCircle2, AlertTriangle, X, Trophy, GitBranch, Repeat } from 'lucide-react';
import {
  TournamentRow,
  ComplianceFlags,
  fetchSessionTournaments,
  logNewTournamentEntry,
  logReEntry,
  finalizeTournament,
} from '../lib/tournaments';
import {
  WGPConditionalTournament,
  SessionContractTournamentRow,
  SessionContractSubstitutionRow,
  fetchConditionalTournamentsForSession,
  fetchLockedContractTournaments,
  fetchSubstitutions,
  fetchBRMLevelIdForContract,
  activateConditionalTournament,
} from '../lib/sessionContract';
import { SubstitutionPanel } from './SessionContractView';
import { formatCurrency, getErrorMessage } from '../lib/utils';
import { useAsync } from '../lib/useAsync';
import { SessionId, SessionContractId, TournamentId, asTournamentId } from '../types/ids';

interface TournamentLogProps {
  sessionId: SessionId;
  onEndSession: () => void;
}

type FormMode =
  | null
  | { type: 'new'; prefillName?: string; prefillAmount?: number | null }
  | { type: 'reentry'; tournamentId: TournamentId; tournamentName: string; prefillAmount: number | null }
  | { type: 'finalize'; tournament: TournamentRow }
  | { type: 'conditional'; contractId: SessionContractId; conditional: WGPConditionalTournament };

// Looks up the planned buy-in amount for a tournament name from whichever
// list it came from — fixed slot or (activated) conditional — so the
// +Buy-in form can prefill it instead of asking the player to retype an
// amount that was already set when planning the week.
function findPlannedBuyInAmount(
  name: string,
  fixedSlots: SessionContractTournamentRow[],
  conditionals: WGPConditionalTournament[]
): number | null {
  const normalized = name.trim().toLowerCase();
  const slot = fixedSlots.find((s) => s.tournament_name.trim().toLowerCase() === normalized);
  if (slot?.buy_in_amount) return slot.buy_in_amount;
  const conditional = conditionals.find((c) => c.tournament_name.trim().toLowerCase() === normalized);
  return conditional?.buy_in_amount ?? null;
}

function FlagBadges({ t }: { t: TournamentRow }) {
  const badges: string[] = [];
  if (t.is_unauthorized) badges.push('Outside Session Contract');
  if (t.is_unplanned) badges.push('Outside Weekly Game Plan');
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {badges.map((b) => (
        <span
          key={b}
          className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-signal-risk/10 border border-signal-risk/30 text-signal-risk"
        >
          <Flag size={10} /> {b}
        </span>
      ))}
    </div>
  );
}

function EntryFlagBadge({ status }: { status: string }) {
  if (status !== 'NON_COMPLIANT') return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-signal-risk/10 border border-signal-risk/30 text-signal-risk">
      <Flag size={10} /> Non-compliant
    </span>
  );
}

export default function TournamentLog({ sessionId, onEndSession }: TournamentLogProps) {
  const { data, loading, error, reload: refresh } = useAsync(() => fetchSessionTournaments(sessionId), [sessionId]);
  const tournaments = data ?? [];
  const { data: planContext, reload: refreshPlanContext } = useAsync(async () => {
    const ctx = await fetchConditionalTournamentsForSession(sessionId);
    if (!ctx) return null;
    const [fixedSlots, substitutions, brmLevelId] = await Promise.all([
      fetchLockedContractTournaments(ctx.contractId),
      fetchSubstitutions(ctx.contractId),
      fetchBRMLevelIdForContract(ctx.contractId),
    ]);
    return { contractId: ctx.contractId, conditionals: ctx.conditionals, fixedSlots, substitutions, brmLevelId };
  }, [sessionId]);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [saving, setSaving] = useState(false);
  const [lastFlags, setLastFlags] = useState<ComplianceFlags | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [confirmReentryFor, setConfirmReentryFor] = useState<TournamentRow | null>(null);

  const loggedEntryCount = tournaments.reduce((sum, t) => sum + (t.tournament_entries?.length ?? 0), 0);
  const canEndSession = loggedEntryCount > 0;

  // Once a conditional is exercised, it becomes an ordinary logged
  // tournament (with its own +Buy-in path) — stop offering it here so
  // there's no ambiguity about which affordance to use for a repeat buy-in.
  const exercisableConditionals = (planContext?.conditionals ?? []).filter(
    (c) => !tournaments.some((t) => t.name.trim().toLowerCase() === c.tournament_name.trim().toLowerCase())
  );

  // Names of locked slots that have since been substituted away — greyed
  // out below and gated behind a confirm step for further buy-ins, since
  // the player already told the system (via the substitution) that they're
  // no longer playing this one. Never a hard block, per §5's "truthful
  // logging is never blocked": if they really did buy back in, they can
  // still record it, flagged, after acknowledging the warning.
  const substitutedOriginalNames = new Set(
    (planContext?.substitutions ?? [])
      .map((sub) => planContext?.fixedSlots.find((s) => s.id === sub.original_slot_id)?.tournament_name)
      .filter((name): name is string => !!name)
      .map((name) => name.trim().toLowerCase())
  );

  // Each locked slot can only be substituted once (see SubstitutionPanel) —
  // hide the trigger once every slot already has one, rather than opening
  // the panel just to show an empty state.
  const hasSubstitutableSlots = (planContext?.fixedSlots ?? []).some(
    (s) => !(planContext?.substitutions ?? []).some((sub) => sub.original_slot_id === s.id)
  );

  // Substitutions the player recorded but hasn't logged a first buy-in
  // against yet — offered as a quick "Log Buy-in" action below, prefilling
  // the replacement's name the same way exercisableConditionals' "Exercise"
  // button prefills a conditional's.
  const exercisableSubstitutions = (planContext?.substitutions ?? []).filter(
    (sub) => !tournaments.some((t) => t.name.trim().toLowerCase() === sub.replacement_tournament_name.trim().toLowerCase())
  );

  const handleEndSessionClick = () => {
    if (!canEndSession) return;
    setEndingSession(true); // opens a confirm step, not an immediate call
  };

  return (
    <div className="flex flex-col gap-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
          Tournament & Entry Log — {tournaments.length} logged
        </span>
        <button
          type="button"
          onClick={() => refresh()}
          className="text-text-muted hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <RefreshCcw size={14} />
        </button>
        <button
            type="button"
            onClick={handleEndSessionClick}
            disabled={!canEndSession}
            title={canEndSession ? undefined : 'Log at least one buy-in before ending the session.'}
            className="text-12 font-mono px-3 py-1.5 rounded-[4px] border border-signal-risk/40 text-signal-risk hover:bg-signal-risk/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            End Session
          </button>
      </div>

      {!canEndSession && (
        <p className="text-11 text-text-faint -mt-2">
          Log at least one buy-in before you can end this session.
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 text-signal-risk bg-signal-risk/10 p-3 rounded-[4px] border border-signal-risk/25 text-12">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Conditional Tournaments — every session, the player can exercise any
          conditional from their locked Weekly Game Plan the moment they judge
          its activation_condition met. This is always their own call, never
          evaluated automatically (see activateConditionalTournament). */}
      {planContext && exercisableConditionals.length > 0 && (
        <div className="bg-surface border border-border rounded-[6px] overflow-hidden">
          <div className="bg-surface-raised/60 border-b border-border px-4 py-2.5 flex items-center gap-2">
            <GitBranch size={13} className="text-accent-steel" />
            <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Conditional Tournaments</span>
          </div>
          <div className="divide-y divide-border/40">
            {exercisableConditionals.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-14 font-medium text-text-primary">{c.tournament_name}</span>
                  <span className="text-11 text-text-faint">If: {c.activation_condition}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormMode({ type: 'conditional', contractId: planContext.contractId, conditional: c })
                  }
                  className="text-11 font-mono px-2.5 py-1.5 rounded-[4px] border border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10 transition-colors shrink-0"
                >
                  Exercise
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && tournaments.length === 0 && (
        <div className="bg-surface border border-border rounded-[6px] p-8 flex flex-col items-center gap-3 text-center">
          <span className="text-14 text-text-muted">No tournaments logged this session yet.</span>
          <button
            type="button"
            onClick={() => setFormMode({ type: 'new' })}
            className="text-14 text-accent-steel font-medium hover:underline cursor-pointer"
          >
            Log a tournament
          </button>
        </div>
      )}

      {/* Chronological list, most recent first */}
      <div className="flex flex-col gap-3">
        {tournaments.map((t) => {
          const isFinalized = t.net_return !== null;
          const hasEntries = (t.tournament_entries?.length ?? 0) > 0;
          const isSubstitutedOriginal = substitutedOriginalNames.has(t.name.trim().toLowerCase());
          return (
            <div
              key={t.id}
              className={`bg-surface border rounded-[6px] overflow-hidden ${isSubstitutedOriginal ? 'border-border/40 opacity-60' : 'border-border'}`}
            >
              <div className="p-4 flex items-start justify-between gap-4 border-b border-border/60">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-14 font-semibold text-text-primary">{t.name}</span>
                    {t.tournament_number && (
                      <span className="text-11 font-mono text-text-faint">#{t.tournament_number}</span>
                    )}
                    {isSubstitutedOriginal && (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-surface-raised border border-border text-text-faint flex items-center gap-1">
                        <Repeat size={10} /> Substituted
                      </span>
                    )}
                    {isFinalized ? (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-signal-process/10 border border-signal-process/30 text-signal-process">
                        Finalized
                      </span>
                    ) : hasEntries ? (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-accent-steel/10 border border-accent-steel/30 text-accent-steel">
                        Capital at Risk
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-surface-raised border border-border text-text-muted">
                        Authorized — Not Bought In
                      </span>
                    )}
                  </div>
                  <FlagBadges t={t} />
                </div>

                <div className="flex items-center gap-3">
                  {isFinalized && (
                    <span className="text-14 font-mono text-text-primary text-right">
                      {formatCurrency(t.net_return ?? 0)}
                    </span>
                  )}
                  {!isFinalized && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          isSubstitutedOriginal
                            ? setConfirmReentryFor(t)
                            : setFormMode({
                                type: 'reentry',
                                tournamentId: asTournamentId(t.id),
                                tournamentName: t.name,
                                prefillAmount: findPlannedBuyInAmount(t.name, planContext?.fixedSlots ?? [], planContext?.conditionals ?? []),
                              })
                        }
                        className={
                          isSubstitutedOriginal
                            ? 'text-11 font-mono px-2 py-1 rounded-[4px] border border-dashed border-border text-text-faint hover:text-text-muted transition-colors'
                            : 'text-11 font-mono px-2 py-1 rounded-[4px] border border-border text-text-muted hover:text-text-primary hover:border-text-faint transition-colors'
                        }
                      >
                        + Buy-in
                      </button>
                      {hasEntries && (
                        <button
                          type="button"
                          onClick={() => setFormMode({ type: 'finalize', tournament: t })}
                          className="text-11 font-mono px-2 py-1 rounded-[4px] border border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10 transition-colors flex items-center gap-1"
                        >
                          <Trophy size={11} /> Finalize
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Entries */}
              <div className="divide-y divide-border/40">
                {(t.tournament_entries || []).map((e) => (
                  <div key={e.id} className="px-4 py-2.5 flex items-center justify-between text-12">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-muted w-6">#{e.entry_sequence}</span>
                      <span className="font-mono text-text-primary">{formatCurrency(e.buy_in_amount)}</span>
                      <EntryFlagBadge status={e.status} />
                    </div>
                    <span className="font-mono text-text-faint">
                      {e.completion_timestamp ? new Date(e.completion_timestamp).toLocaleTimeString() : 'pending'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Substitutions — replacing a locked slot with a different tournament
          mid-session, e.g. the planned one didn't run. Append-only against
          the locked Session Contract, never edits the original slot (§2.3,
          §5). Lives here (not just SessionContractView) because the Play
          tab renders TournamentLog for the whole ACTIVE lifetime of a
          session — SessionContractView's own LOCKED view is only reachable
          in the brief window/desync case described in PlayerShell. Placed
          below the tournament list, not above it — this is a fallback path,
          not the primary action on this screen. */}
      {planContext && planContext.substitutions.length > 0 && (
        <div className="flex flex-col gap-2">
          {planContext.substitutions.map((sub: SessionContractSubstitutionRow) => (
            <div key={sub.id} className="bg-surface border border-signal-caution/30 rounded-[6px] p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-12 font-mono text-signal-caution uppercase">
                  <Repeat size={12} /> Substitution — {sub.created_at ? new Date(sub.created_at).toLocaleString() : '—'}
                </div>
                {exercisableSubstitutions.some((s) => s.id === sub.id) && (
                  <button
                    type="button"
                    onClick={() => setFormMode({ type: 'new', prefillName: sub.replacement_tournament_name, prefillAmount: sub.replacement_buy_in_amount })}
                    className="text-11 font-mono px-2 py-1 rounded-[4px] border border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10 transition-colors shrink-0"
                  >
                    Log Buy-in
                  </button>
                )}
              </div>
              <span className="text-13 text-text-primary">
                → {sub.replacement_tournament_name}
                {sub.replacement_buy_in_amount != null && (
                  <span className="font-mono text-text-muted"> · {formatCurrency(sub.replacement_buy_in_amount)}, max {sub.replacement_permitted_buy_ins} buy-ins</span>
                )}
              </span>
              <span className="text-12 text-text-muted">Reason: {sub.reason}</span>
              {!sub.passed_brm_validation && (
                <span className="text-11 text-signal-risk">Did not pass BRM validation at time of substitution.</span>
              )}
            </div>
          ))}
        </div>
      )}

      {planContext && hasSubstitutableSlots && (
        <button
          type="button"
          onClick={() => setShowSubForm(true)}
          className="self-start text-11 font-mono text-text-faint hover:text-text-muted transition-colors"
        >
          Substitute a locked tournament
        </button>
      )}

      {showSubForm && planContext && (
        <SubstitutionPanel
          contractId={planContext.contractId}
          slots={planContext.fixedSlots}
          substitutions={planContext.substitutions}
          brmLevelId={planContext.brmLevelId}
          onClose={() => setShowSubForm(false)}
          onSaved={() => {
            setShowSubForm(false);
            refreshPlanContext();
          }}
        />
      )}

      {/* Floating action button — always reachable, per §2.4 */}
      <button
        type="button"
        onClick={() => setFormMode({ type: 'new' })}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-accent-steel text-text-primary shadow-2xl flex items-center justify-center hover:bg-accent-steel/90 transition-colors cursor-pointer z-20"
        title="Log entry"
      >
        <Plus size={22} />
      </button>

      {formMode && (
        <EntryFormPanel
          sessionId={sessionId}
          mode={formMode}
          saving={saving}
          setSaving={setSaving}
          onClose={() => setFormMode(null)}
          onSaved={(flags) => {
            setLastFlags(flags ?? null);
            setFormMode(null);
            refresh();
            refreshPlanContext();
          }}
        />
      )}

      {/* Non-blocking post-submit compliance notice */}
      {lastFlags && (lastFlags.isUnauthorized || lastFlags.exceededBuyIns || lastFlags.exceededMaxBuyIn || lastFlags.loggedAfterStopLoss) && (
        <div className="fixed bottom-28 right-8 max-w-sm bg-surface-raised border border-signal-risk/40 rounded-[6px] p-4 shadow-2xl z-20 flex gap-3">
          <AlertTriangle size={16} className="text-signal-risk shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-13 font-medium text-text-primary">Entry saved and flagged</span>
            <p className="text-12 text-text-muted leading-relaxed">
              {lastFlags.isUnauthorized && 'Outside your Session Contract. '}
              {lastFlags.exceededBuyIns && 'Exceeds permitted buy-ins for this slot. '}
              {lastFlags.exceededMaxBuyIn && 'Buy-in amount exceeds your BRM-permitted maximum. '}
              {lastFlags.loggedAfterStopLoss && 'Logged after your Stop Loss capacity was consumed. '}
              This will be visible to your coach and included in your Verdict evidence.
            </p>
          </div>
          <button type="button" onClick={() => setLastFlags(null)} className="text-text-faint hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
      )}

        {endingSession && (
                <EndSessionConfirm
                  unfinalizedCount={tournaments.filter((t) => t.net_return === null && (t.tournament_entries?.length ?? 0) > 0).length}
                  onCancel={() => setEndingSession(false)}
                  onConfirm={onEndSession}
                />
        )}

        {confirmReentryFor && (
          <ConfirmSubstitutedReentry
            tournamentName={confirmReentryFor.name}
            onCancel={() => setConfirmReentryFor(null)}
            onConfirm={() => {
              setFormMode({
                type: 'reentry',
                tournamentId: asTournamentId(confirmReentryFor.id),
                tournamentName: confirmReentryFor.name,
                prefillAmount: findPlannedBuyInAmount(confirmReentryFor.name, planContext?.fixedSlots ?? [], planContext?.conditionals ?? []),
              });
              setConfirmReentryFor(null);
            }}
          />
        )}
    </div>
  );
}

// ============================================================================
// Entry / Finalize form panel — side panel, never a full-screen takeover
// ============================================================================

function EntryFormPanel({
  sessionId,
  mode,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  sessionId: SessionId;
  mode: NonNullable<FormMode>;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSaved: (flags?: ComplianceFlags) => void;
}) {
  const [name, setName] = useState(mode.type === 'new' ? mode.prefillName ?? '' : '');
  const [number, setNumber] = useState('');
  // Prefilled from the plan's buy-in amount when known (a fixed slot's or
  // conditional's planned amount) — still an ordinary editable input, since
  // the actual buy-in can legitimately differ from what was planned.
  const [buyIn, setBuyIn] = useState(() => {
    if (mode.type === 'reentry' && mode.prefillAmount) return String(mode.prefillAmount);
    if (mode.type === 'conditional' && mode.conditional.buy_in_amount) return String(mode.conditional.buy_in_amount);
    if (mode.type === 'new' && mode.prefillAmount) return String(mode.prefillAmount);
    return '';
  });
  const [winnings, setWinnings] = useState('');
  const [bestRank, setBestRank] = useState('');
  const [worstRank, setWorstRank] = useState('');
  const [itm, setItm] = useState(false);
  const [finalTable, setFinalTable] = useState(false);
  const [busted, setBusted] = useState(false);
  const [comments, setComments] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    setSaving(true);
    try {
      if (mode.type === 'new') {
        const amount = parseFloat(buyIn);
        if (!name.trim() || isNaN(amount) || amount <= 0) {
          throw new Error('Tournament name and a positive buy-in amount are required.');
        }
        const { flags } = await logNewTournamentEntry({
          sessionId,
          tournamentName: name,
          tournamentNumber: number || undefined,
          buyInAmount: amount,
        });
        onSaved(flags);
      } else if (mode.type === 'reentry') {
        const amount = parseFloat(buyIn);
        if (isNaN(amount) || amount <= 0) throw new Error('Enter a positive buy-in amount.');
        const { flags } = await logReEntry({
          sessionId,
          tournamentId: mode.tournamentId,
          buyInAmount: amount,
        });
        onSaved(flags);
      } else if (mode.type === 'finalize') {
        const win = parseFloat(winnings || '0');
        await finalizeTournament({
          tournamentId: asTournamentId(mode.tournament.id),
          winningsGross: isNaN(win) ? 0 : win,
          bestRank: bestRank ? parseInt(bestRank, 10) : undefined,
          worstRank: worstRank ? parseInt(worstRank, 10) : undefined,
          itmYn: itm,
          finalTableYn: finalTable,
          comments: comments || undefined,
        });
        onSaved();
      } else if (mode.type === 'conditional') {
        const amount = parseFloat(buyIn);
        if (isNaN(amount) || amount <= 0) throw new Error('Enter a positive buy-in amount.');
        // Player's own judgment that activation_condition is met, right now —
        // never evaluated automatically. Activating first (idempotent) is what
        // makes tournaments.ts recognize this as authorized, not unplanned.
        await activateConditionalTournament(mode.contractId, mode.conditional);
        const { flags } = await logNewTournamentEntry({
          sessionId,
          tournamentName: mode.conditional.tournament_name,
          buyInAmount: amount,
        });
        onSaved(flags);
      }
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode.type === 'new' ? 'Log Tournament'
      : mode.type === 'reentry' ? `Add Buy-in — ${mode.tournamentName}`
      : mode.type === 'conditional' ? `Exercise — ${mode.conditional.tournament_name}`
      : `Finalize — ${mode.tournament.name}`;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-ink/60" onClick={onClose}>
      <div
        className="w-full max-w-sm h-full bg-surface border-l border-border p-6 flex flex-col gap-5 overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-16 font-display font-medium text-text-primary">{title}</span>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {formError && (
          <div className="text-12 text-signal-risk bg-signal-risk/10 border border-signal-risk/25 rounded-[4px] p-3">
            {formError}
          </div>
        )}

        {mode.type !== 'finalize' && (
          <>
            {mode.type === 'new' && (
              <>
                <Field label="Tournament Name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sunday Deepstack 5.5K"
                    className="input"
                  />
                </Field>
                <Field label="Tournament Number (optional)">
                  <input value={number} onChange={(e) => setNumber(e.target.value)} className="input" />
                </Field>
              </>
            )}
            {mode.type === 'conditional' && (
              <div className="bg-surface-raised/60 border border-border rounded-[4px] p-3 flex flex-col gap-1">
                <span className="text-12 text-text-faint">You're confirming this condition is met, right now:</span>
                <span className="text-13 text-text-primary">If: {mode.conditional.activation_condition}</span>
              </div>
            )}
            <Field label="Buy-in Amount (₹)">
              <input
                type="number"
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
                placeholder="5500"
                className="input"
              />
            </Field>
            <p className="text-11 text-text-faint leading-relaxed">
              This will be saved even if it falls outside your Session Contract, Weekly Game Plan, or Stop
              Loss — non-compliant play is always recorded, never blocked.
            </p>
          </>
        )}

        {mode.type === 'finalize' && (
          <>
            <Field label="Gross Winnings (₹)">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={winnings}
                  onChange={(e) => setWinnings(e.target.value)}
                  placeholder="0"
                  className="input flex-1"
                />
                <label className="flex items-center gap-1.5 text-12 text-text-primary cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={busted}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setBusted(checked);
                      if (checked) { setItm(false); setFinalTable(false); } // can't have either — busting excludes ITM and the final table
                    }}
                  />
                  Busted
                </label>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Best Rank">
                <input type="number" value={bestRank} onChange={(e) => setBestRank(e.target.value)} className="input" />
              </Field>
              <Field label="Worst Rank">
                <input type="number" value={worstRank} onChange={(e) => setWorstRank(e.target.value)} className="input" />
              </Field>
            </div>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 text-13 ${busted ? 'text-text-faint cursor-not-allowed' : 'text-text-primary cursor-pointer'}`}>
                <input type="checkbox" checked={itm} disabled={busted} onChange={(e) => setItm(e.target.checked)} /> ITM
              </label>
              <label className={`flex items-center gap-2 text-13 ${busted ? 'text-text-faint cursor-not-allowed' : 'text-text-primary cursor-pointer'}`}>
                <input type="checkbox" checked={finalTable} disabled={busted} onChange={(e) => setFinalTable(e.target.checked)} /> Final
                Table
              </label>
            </div>
            <Field label="What happened?">
              <textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} className="input" />
            </Field>
          </>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="mt-2 w-full h-10 bg-accent-steel text-text-primary rounded-[4px] hover:bg-accent-steel/90 text-14 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? 'Saving…' : (
            <>
              <CheckCircle2 size={16} /> Save
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-12 font-mono text-text-muted uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}


// Confirm step — a live session shouldn't stop with one accidental tap,
// and it should tell the player if entries are still open (they can still
// finalize those during the review flow, so this is informational, not a
// gate — truthful logging is never blocked, §5).
function EndSessionConfirm({
  unfinalizedCount,
  onCancel,
  onConfirm,
}: {
  unfinalizedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60" onClick={onCancel}>
      <div className="w-full max-w-sm bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <span className="text-16 font-display text-text-primary">End this session?</span>
        <p className="text-13 text-text-muted leading-relaxed">
          {unfinalizedCount > 0
            ? `${unfinalizedCount} tournament(s) are still open. You'll finalize them in the review that follows.`
            : 'All tournaments are finalized. You\'ll move straight to the post-session review.'}
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 h-10 border border-border rounded-[4px] text-13 text-text-muted">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 h-10 bg-signal-risk text-text-primary rounded-[4px] text-13 font-medium">
            End Session
          </button>
        </div>
      </div>
    </div>
  );
}

// A slot substitution means the player already told the system they're no
// longer playing this tournament — buying back into it isn't blocked
// (truthful logging is never blocked, §5) but it does need an explicit
// acknowledgment first, the same "grey it out, warn, still allow" posture
// SubstitutionPanel's own BRM check uses.
function ConfirmSubstitutedReentry({
  tournamentName,
  onCancel,
  onConfirm,
}: {
  tournamentName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/60" onClick={onCancel}>
      <div className="w-full max-w-sm bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <span className="text-16 font-display text-text-primary">Buy back into {tournamentName}?</span>
        <p className="text-13 text-text-muted leading-relaxed">
          You substituted this tournament earlier this session. Logging another buy-in against it is going against your plans. Are
          you sure you want to continue?
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 h-10 border border-border rounded-[4px] text-13 text-text-muted">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 h-10 bg-signal-risk text-text-primary rounded-[4px] text-13 font-medium">
            Log Anyway
          </button>
        </div>
      </div>
    </div>
  );
}