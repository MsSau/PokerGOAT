import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCcw, Flag, CheckCircle2, AlertTriangle, X, Trophy } from 'lucide-react';
import {
  TournamentRow,
  ComplianceFlags,
  fetchSessionTournaments,
  logNewTournamentEntry,
  logReEntry,
  finalizeTournament,
} from '../lib/tournaments';
import { formatCurrency } from '../lib/utils';

interface TournamentLogProps {
  sessionId: string;
}

type FormMode = null | { type: 'new' } | { type: 'reentry'; tournamentId: string; tournamentName: string } | { type: 'finalize'; tournament: TournamentRow };

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

export default function TournamentLog({ sessionId }: TournamentLogProps) {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [saving, setSaving] = useState(false);
  const [lastFlags, setLastFlags] = useState<ComplianceFlags | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessionTournaments(sessionId);
      setTournaments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      </div>

      {error && (
        <div className="flex items-start gap-2 text-signal-risk bg-signal-risk/10 p-3 rounded-[4px] border border-signal-risk/25 text-12">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
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
          return (
            <div key={t.id} className="bg-surface border border-border rounded-[6px] overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-4 border-b border-border/60">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-14 font-semibold text-text-primary">{t.name}</span>
                    {t.tournament_number && (
                      <span className="text-11 font-mono text-text-faint">#{t.tournament_number}</span>
                    )}
                    {isFinalized ? (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-signal-process/10 border border-signal-process/30 text-signal-process">
                        Finalized
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-[4px] bg-accent-steel/10 border border-accent-steel/30 text-accent-steel">
                        Capital at Risk
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
                        onClick={() => setFormMode({ type: 'reentry', tournamentId: t.id, tournamentName: t.name })}
                        className="text-11 font-mono px-2 py-1 rounded-[4px] border border-border text-text-muted hover:text-text-primary hover:border-text-faint transition-colors"
                      >
                        + Buy-in
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormMode({ type: 'finalize', tournament: t })}
                        className="text-11 font-mono px-2 py-1 rounded-[4px] border border-accent-steel/40 text-accent-steel hover:bg-accent-steel/10 transition-colors flex items-center gap-1"
                      >
                        <Trophy size={11} /> Finalize
                      </button>
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
          }}
        />
      )}

      {/* Non-blocking post-submit compliance notice */}
      {lastFlags && (lastFlags.isUnauthorized || lastFlags.exceededBuyIns || lastFlags.loggedAfterStopLoss) && (
        <div className="fixed bottom-28 right-8 max-w-sm bg-surface-raised border border-signal-risk/40 rounded-[6px] p-4 shadow-2xl z-20 flex gap-3">
          <AlertTriangle size={16} className="text-signal-risk shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-13 font-medium text-text-primary">Entry saved and flagged</span>
            <p className="text-12 text-text-muted leading-relaxed">
              {lastFlags.isUnauthorized && 'Outside your Session Contract. '}
              {lastFlags.exceededBuyIns && 'Exceeds permitted buy-ins for this slot. '}
              {lastFlags.loggedAfterStopLoss && 'Logged after your Stop Loss capacity was consumed. '}
              This will be visible to your coach and included in your Verdict evidence.
            </p>
          </div>
          <button type="button" onClick={() => setLastFlags(null)} className="text-text-faint hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
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
  sessionId: string;
  mode: NonNullable<FormMode>;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSaved: (flags?: ComplianceFlags) => void;
}) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [winnings, setWinnings] = useState('');
  const [bestRank, setBestRank] = useState('');
  const [worstRank, setWorstRank] = useState('');
  const [itm, setItm] = useState(false);
  const [finalTable, setFinalTable] = useState(false);
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
          tournamentId: mode.tournament.id,
          winningsGross: isNaN(win) ? 0 : win,
          bestRank: bestRank ? parseInt(bestRank, 10) : undefined,
          worstRank: worstRank ? parseInt(worstRank, 10) : undefined,
          itmYn: itm,
          finalTableYn: finalTable,
          comments: comments || undefined,
        });
        onSaved();
      }
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode.type === 'new' ? 'Log Tournament' : mode.type === 'reentry' ? `Add Buy-in — ${mode.tournamentName}` : `Finalize — ${mode.tournament.name}`;

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
              <input
                type="number"
                value={winnings}
                onChange={(e) => setWinnings(e.target.value)}
                placeholder="0"
                className="input"
              />
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
              <label className="flex items-center gap-2 text-13 text-text-primary cursor-pointer">
                <input type="checkbox" checked={itm} onChange={(e) => setItm(e.target.checked)} /> ITM
              </label>
              <label className="flex items-center gap-2 text-13 text-text-primary cursor-pointer">
                <input type="checkbox" checked={finalTable} onChange={(e) => setFinalTable(e.target.checked)} /> Final
                Table
              </label>
            </div>
            <Field label="Comments">
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