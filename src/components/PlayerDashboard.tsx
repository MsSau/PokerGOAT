import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { fetchPlayerDashboardData } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';
import { Session, WeeklyBRMAssignment } from '../types';
import { supabase } from '../lib/supabase';

export function PlayerDashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<{ brmAssignment: WeeklyBRMAssignment | null; sessions: any[]; boundaryConfig: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setError('No user ID available.');
      return;
    }

    async function checkAuthAndFetch() {
      fetchPlayerDashboardData(userId)
        .then(setData)
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => setLoading(false));
    }
    
    checkAuthAndFetch();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const { brmAssignment, sessions, boundaryConfig } = data!;

  return (
    <div className="p-6 space-y-8">
      {/* 1. Greeting */}
      <div className="text-14 font-mono text-text-muted">
        Welcome, Poker Player. Current Poker Day window: {boundaryConfig ? `${boundaryConfig.start_day} to ${boundaryConfig.end_day}` : 'Pending Boundary Configuration'}
      </div>

      {/* 2. Stat Cards */}
      <div className="flex flex-wrap gap-4">
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          PREP STREAK<div className="text-24 text-text-primary mt-2">—</div>
        </div>
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          BRM LEVEL<div className="text-24 text-text-primary mt-2">Level {brmAssignment?.brm_levels?.level_index || 'N/A'}</div>
        </div>
        <div className="border border-border p-4 rounded bg-surface-raised font-mono text-12 text-text-muted w-48">
          Weekly limit remaining<div className="text-24 text-text-primary mt-2">{brmAssignment ? formatCurrency(brmAssignment.week_stop_loss_snapshot) : '—'}</div>
        </div>
      </div>

      {/* 3. CTA */}
      <button className="w-full bg-accent text-white p-4 rounded font-semibold">Start Preparation</button>

      {/* 4. Session History */}
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
                const prepMedal = 'None';
                const execMedal = s.session_execution_assessments?.[0]?.system_execution_medal || 'None';
                const outcomeMedal = s.session_outcome_assessments?.[0]?.system_outcome_medal || 'None';
                const pnl = s.session_outcome_assessments?.[0]?.final_session_net_pnl || 0;
                
                const getMedalDisplay = (medal: string) => {
                  switch (medal) {
                    case 'Gold': return { className: 'text-yellow-600', text: 'GOLD' };
                    case 'Silver': return { className: 'text-gray-400', text: 'SLVR' };
                    case 'Bronze': return { className: 'text-orange-700', text: 'BRNZ' };
                    default: return { className: 'text-text-faint', text: 'NONE' };
                  }
                };
                
                const prepDisplay = getMedalDisplay(prepMedal);
                const execDisplay = getMedalDisplay(execMedal);
                const outcomeDisplay = getMedalDisplay(outcomeMedal);
                
                return (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-3 font-mono">{new Date(s.start_time).toLocaleDateString()}</td>
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
