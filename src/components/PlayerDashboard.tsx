import React, { useState } from 'react';
import { Award, Eye, EyeOff, ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';
import { fetchPlayerDashboardData } from '../lib/supabase';
import { fetchCurrentBankroll, fetchCurrentWeekNetPnl, fetchRecentCapitalMovements, recordCapitalMovement, CapitalMovementType } from '../lib/bankroll';
import { fetchRepeatOffences } from '../lib/coachBrief';
import { formatCurrency, medalColorClass, getErrorMessage } from '../lib/utils';
import { useAsync } from '../lib/useAsync';
import CapitalMovementModal from './CapitalMovementModal';
import { PlayerId } from '../types/ids';

export function PlayerDashboard({ userId, onStartPreparation }: { userId: PlayerId; onStartPreparation: () => void }) {
  const { data, loading, error } = useAsync(() => {
    if (!userId) throw new Error('No user ID available.');
    return fetchPlayerDashboardData(userId);
  }, [userId]);

  // Bankroll is deliberately a separate fetch from the rest of the
  // dashboard data (see lib/bankroll.ts) — kept out of
  // fetchPlayerDashboardData so the "never show it prominently" PRD
  // default and this toggle/edit surface stay an isolated, optional layer
  // on top of the standard dashboard rather than baked into its main query.
  const { data: bankroll, loading: bankrollLoading, reload: reloadBankroll } = useAsync(
    () => fetchCurrentBankroll(userId),
    [userId]
  );
  const { data: recentMovements, reload: reloadMovements } = useAsync(
    () => fetchRecentCapitalMovements(userId),
    [userId]
  );

  // Live/dynamic by construction — this is a plain query re-run whenever
  // the dashboard mounts (e.g. navigating back here after ending a
  // session), never a cached/stale snapshot. See bankroll.ts's
  // fetchCurrentWeekNetPnl for why this never needs its own write path
  // into bankroll_ledger_entries.
  const { data: weekNet, loading: weekNetLoading } = useAsync(
    () => fetchCurrentWeekNetPnl(userId),
    [userId]
  );

  // Same track data as the coach's Weekly Coach Brief "Repeat-Offence
  // Tracker" (CoachBriefView.tsx) — fetchRepeatOffences only needs
  // playerId, so it's reused as-is rather than duplicated.
  const { data: repeatOffences } = useAsync(() => fetchRepeatOffences(userId), [userId]);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);

  // Hidden by default — PRD §2.1 explicitly warns against showing
  // cumulative bankroll prominently on login ("invites outcome-first
  // thinking"). A toggle was requested anyway, so it's shown on demand
  // rather than removed outright.
  const [showBankroll, setShowBankroll] = useState(false);
  const [showCapitalModal, setShowCapitalModal] = useState(false);
  const [submittingMovement, setSubmittingMovement] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const handleConfirmMovement = async (type: CapitalMovementType, amount: number, note: string) => {
    setSubmittingMovement(true);
    setMovementError(null);
    try {
      await recordCapitalMovement(userId, type, amount, note);
      await Promise.all([reloadBankroll(), reloadMovements()]);
      setShowCapitalModal(false);
    } catch (err) {
      setMovementError(getErrorMessage(err, 'Failed to record capital movement.'));
    } finally {
      setSubmittingMovement(false);
    }
  };

  const handleCancelMovement = () => {
    setShowCapitalModal(false);
    setMovementError(null);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  const { displayName, brmAssignment, sessions, boundaryConfig, capacity } = data;

  return (
    <div className="p-6 space-y-8">
      {/* 1. Greeting */}
      <div className="text-14 font-mono text-text-muted">
        Welcome, {displayName || 'Poker Player'}. Current Poker Day window: {boundaryConfig ? `resets daily at ${boundaryConfig.poker_day_boundary_time}` : 'Pending Boundary Configuration'}
      </div>

      {/* 2. Stat Cards */}
      <div className="flex flex-wrap gap-4">
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          BRM LEVEL<div className="text-24 text-text-primary mt-2">Level {brmAssignment?.brm_levels?.level_index || 'N/A'}</div>
        </div>
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          WEEKLY RUNWAY LEFT<div className="text-24 text-text-primary mt-2">{capacity ? formatCurrency(capacity.remainingWeekCapacity) : '—'}</div>
        </div>
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          {/* Net P&L for the current Poker Week — money stays neutral
              text-primary regardless of sign, same rule as every other
              currency figure on this dashboard. */}
          THIS WEEK 
          <div className="text-24 text-text-primary mt-2">
            {weekNetLoading ? '…' : weekNet !== null ? formatCurrency(weekNet) : '—'}
          </div>
        </div>

        {/* Toggleable Bankroll — off the front door by default per PRD
            §2.1, revealed on tap. Money always renders in neutral
            text-primary regardless of sign, same rule as everywhere else
            in the app. Manage Capital lives inside this card rather than
            as a separate section, and opens a Confirm/Cancel dialog since
            a ledger write here is permanent/append-only. */}
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span>BANKROLL</span>
            <button
              type="button"
              onClick={() => setShowBankroll((v) => !v)}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title={showBankroll ? 'Hide bankroll' : 'Show bankroll'}
            >
              {showBankroll ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="text-24 text-text-primary">
            {!showBankroll ? '••••••' : bankrollLoading ? '…' : bankroll !== null ? formatCurrency(bankroll) : '—'}
          </div>
          <button
            type="button"
            onClick={() => setShowCapitalModal(true)}
            className="text-11 font-sans font-medium text-accent-steel hover:underline text-left cursor-pointer normal-case"
          >
            Manage Capital
          </button>
        </div>
      </div>

      {/* Recent capital movements — only surfaced once the player has
          chosen to reveal the bankroll figure itself. */}
      {showBankroll && recentMovements && recentMovements.length > 0 && (
        <div className="border border-border rounded bg-surface-raised p-4 flex flex-col gap-1.5">
          <span className="text-11 font-mono text-text-muted uppercase tracking-wider">Recent Capital Movements</span>
          {recentMovements.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-12">
              <span className="text-text-muted">
                {m.entryType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
                {m.note ? ` — ${m.note}` : ''}
                {m.createdAt ? ` (${new Date(m.createdAt).toLocaleDateString()})` : ''}
              </span>
              <span className="font-mono text-text-primary">{formatCurrency(m.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {showCapitalModal && (
        <CapitalMovementModal
          submitting={submittingMovement}
          error={movementError}
          onConfirm={handleConfirmMovement}
          onCancel={handleCancelMovement}
        />
      )}

      {/* 3. CTA */}
      <button
        type="button"
        onClick={onStartPreparation}
        className="w-full bg-accent-steel text-text-primary p-4 rounded font-semibold hover:bg-accent-steel/90 transition-colors"
      >
        Start Preparation
      </button>

      {/* 4. Repeat-Offence Tracker — same escalation-ladder data the coach
          sees on the Weekly Coach Brief, surfaced directly to the player. */}
      {repeatOffences && repeatOffences.length > 0 && (
        <div>
          <h2 className="text-14 font-semibold text-text-primary mb-4">Repeat-Offence Tracker</h2>
          <div className="border border-border rounded bg-surface-raised px-4">
            {repeatOffences.map((o) => {
              const Icon = o.trend === 'IMPROVING' ? ArrowUp : o.trend === 'WORSENING' ? ArrowDown : ArrowRight;
              const colorClass = o.trend === 'IMPROVING' ? 'text-signal-process' : o.trend === 'WORSENING' ? 'text-signal-risk' : 'text-text-muted';
              const expanded = expandedTrackId === o.trackId;
              return (
                <div key={o.trackId} className="border-b border-border/50 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpandedTrackId((cur) => (cur === o.trackId ? null : o.trackId))}
                    className="w-full flex items-center justify-between py-2.5 text-left cursor-pointer"
                  >
                    <span className="text-13 text-text-primary">{o.actionName}</span>
                    <span className="flex items-center gap-3 text-13 font-mono">
                      <span className="text-text-muted">Stage {o.stage}</span>
                      <span className={`flex items-center gap-1 ${colorClass}`}>
                        <Icon size={13} /> {o.trend}
                      </span>
                    </span>
                  </button>
                  {expanded && (
                    <p className="text-11 text-text-faint pb-2.5">
                      Last occurrence: {o.lastOccurrenceAt ? new Date(o.lastOccurrenceAt).toLocaleString() : 'unknown'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Session History */}
      <div>
        <h2 className="text-14 font-semibold text-text-primary mb-4">Session History</h2>
        {sessions.length === 0 ? (
          <div className="text-12 text-text-muted italic">No sessions logged this week yet.</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-11 font-mono text-text-muted">
                <th className="p-3">SESSION</th>
                <th className="p-3">MEDALS (P·E·O)</th>
                <th className="p-3">VERDICT</th>
                <th className="p-3 text-right">P&L</th>
              </tr>
            </thead>
            <tbody className="text-12 font-sans text-text-primary">
              {sessions.map((s) => {
                const verdict = s.verdicts?.[0];
                const preparationRel = s.preparation_records;
                const prepMedal = (Array.isArray(preparationRel) ? preparationRel[0]?.medal_tier : preparationRel?.medal_tier) || 'NONE';
                const execMedal = s.session_execution_assessments?.[0]?.system_execution_medal || 'NONE';
                const outcomeMedal = s.session_outcome_assessments?.[0]?.system_outcome_medal || 'NONE';
                const pnl = s.session_outcome_assessments?.[0]?.final_session_net_pnl || 0;

                const getMedalDisplay = (medal: string) => ({ className: medalColorClass(medal), text: medal });

                const prepDisplay = getMedalDisplay(prepMedal);
                const execDisplay = getMedalDisplay(execMedal);
                const outcomeDisplay = getMedalDisplay(outcomeMedal);

                return (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-3 font-mono">{s.start_time ? new Date(s.start_time).toLocaleDateString() : '—'}</td>
                    <td className="p-3 text-11 text-text-faint">
                      <div className="flex gap-2">
                        <div className="flex flex-col items-center">
                          <Award size={14} className={prepDisplay.className} />
                          <span className={`text-[9px] font-bold ${prepDisplay.className}`}>{prepDisplay.text}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <Award size={14} className={execDisplay.className} />
                          <span className={`text-[9px] font-bold ${execDisplay.className}`}>{execDisplay.text}</span>
                        </div>
                        <div className="flex flex-col items-center">
                          <Award size={14} className={outcomeDisplay.className} />
                          <span className={`text-[9px] font-bold ${outcomeDisplay.className}`}>{outcomeDisplay.text}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-12">{verdict?.headline || 'No verdict'}</td>
                    <td className="p-3 text-right font-mono text-text-primary">{formatCurrency(pnl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
