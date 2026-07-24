import React from 'react';
import { UserRole, BRMConfiguration, BRMConfigVersion, BRMBankrollBand, BRMLevel } from '../types';
import { getActiveBRM, resolveCoachId } from '../lib/supabase';
import { Lock, ShieldCheck, DollarSign, ListCollapse, Award, TableProperties, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useAsync } from '../lib/useAsync';

interface ActiveBRMViewProps {
  userId: string;
  role: UserRole;
}

export default function ActiveBRMView({ userId, role }: ActiveBRMViewProps) {
  const { data, loading, error } = useAsync(async () => {
    const coachId = await resolveCoachId(userId, role);
    return getActiveBRM(coachId);
  }, [userId, role]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin"></span>
        <span className="text-12 font-mono text-text-muted mt-3">Loading active BRM protocol from database...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 flex items-start gap-3">
        <AlertTriangle size={18} className="text-signal-risk shrink-0 mt-0.5" />
        <p className="text-14 text-text-primary leading-relaxed">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center bg-surface border border-border rounded-[6px]">
        <span className="text-14 text-text-muted">No active BRM configuration found.</span>
      </div>
    );
  }

  const { config, version, bands, levels } = data;

  return (
    <div className="bg-surface border border-border rounded-[6px] flex flex-col overflow-hidden animate-fade-in font-sans">
      
      {/* Read-Only Padlock Banner */}
      <div className="bg-surface-raised/80 border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-ink border border-border flex items-center justify-center text-text-muted">
            <Lock size={15} />
          </div>
          <div className="flex flex-col">
            <span className="text-12 font-mono text-text-muted uppercase tracking-wider">
              BANKROLL RISK SAFEGUARDS
            </span>
            <span className="text-14 font-medium text-text-primary">
              Active BRM Protocol Configuration is Locked
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-ink border border-border px-3 py-1 rounded-[999px]">
          <ShieldCheck size={13} className="text-signal-caution" />
          <span className="text-10 font-mono text-text-muted uppercase">BRM v{version.version_number} ACTIVE</span>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-8">
        
        {/* Core ID Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-ink/40 border border-border p-4 rounded-[6px] flex flex-col gap-1">
            <span className="text-12 font-mono text-text-muted uppercase">BRM CONFIGURATION ID</span>
            <span className="text-14 font-mono font-medium text-text-primary select-all">
              {config.id}
            </span>
          </div>

          <div className="bg-ink/40 border border-border p-4 rounded-[6px] flex flex-col gap-1">
            <span className="text-12 font-mono text-text-muted uppercase">VERSION & ACTIVATION DATE</span>
            <span className="text-14 font-mono font-medium text-text-primary">
              v{version.version_number}.0 (Generated {version.created_at ? new Date(version.created_at).toLocaleDateString() : '—'})
            </span>
          </div>
        </div>

        {/* Section 1: Bankroll Bands Table */}
        <div className="flex flex-col gap-3">
          <h3 className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <TableProperties size={13} className="text-text-muted" /> Bankroll Bands Protocol
          </h3>
          <div className="overflow-x-auto border border-border rounded-[6px] bg-ink/25">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-raised text-11 font-mono text-text-muted">
                  <th className="p-3 font-semibold">LEVEL</th>
                  <th className="p-3 font-semibold text-right">MIN BANKROLL</th>
                  <th className="p-3 font-semibold text-right">MAX BANKROLL</th>
                  <th className="p-3 font-semibold text-right">SESSION STOP LOSS</th>
                  <th className="p-3 font-semibold text-right">DAY STOP LOSS</th>
                  <th className="p-3 font-semibold text-right">WEEK STOP LOSS</th>
                </tr>
              </thead>
              <tbody className="text-12 font-sans text-text-primary">
                {bands.map((band) => (
                  <tr key={band.id} className="border-b border-border/50 hover:bg-surface-raised/30 transition-colors">
                    <td className="p-3 font-semibold font-mono">
                      Level {band.level_index}
                    </td>
                    {/* Financial figures strictly formatted in neutral text-primary and font-mono */}
                    <td className="p-3 text-right font-mono text-text-primary">
                      {formatCurrency(band.min_bankroll)}
                    </td>
                    <td className="p-3 text-right font-mono text-text-primary">
                      {formatCurrency(band.max_bankroll)}
                    </td>
                    <td className="p-3 text-right font-mono text-text-primary font-medium">
                      {formatCurrency(band.session_stop_loss)}
                    </td>
                    <td className="p-3 text-right font-mono text-text-primary font-medium">
                      {formatCurrency(band.day_stop_loss)}
                    </td>
                    <td className="p-3 text-right font-mono text-text-primary font-medium">
                      {formatCurrency(band.week_stop_loss)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="text-11 text-text-faint font-sans">
            * Bankroll tiers enforce automatic level progression. Exposure adjustments apply instantly once thresholds cross.
          </span>
        </div>

        {/* Section 2: Levels & Exposure Limits */}
        <div className="flex flex-col gap-3">
          <h3 className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <ListCollapse size={13} className="text-text-muted" /> Stake Limits & Exposure Caps per Level
          </h3>
          <div className="overflow-x-auto border border-border rounded-[6px] bg-ink/25">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-raised text-11 font-mono text-text-muted">
                  <th className="p-3 font-semibold">LEVEL</th>
                  <th className="p-3 font-semibold text-right">MAX TOURNAMENT BUY-IN</th>
                  <th className="p-3 font-semibold text-right">MAX SESSION EXPOSURE</th>
                </tr>
              </thead>
              <tbody className="text-12 font-sans text-text-primary">
                {levels.map((lvl) => (
                  <tr key={lvl.id} className="border-b border-border/50 hover:bg-surface-raised/30 transition-colors">
                    <td className="p-3 font-semibold font-mono">
                      Level {lvl.level_index}
                    </td>
                    {/* Financial figures strictly formatted in neutral text-primary and font-mono */}
                    <td className="p-3 text-right font-mono text-text-primary font-medium">
                      {lvl.max_tournament_buy_in !== null ? formatCurrency(lvl.max_tournament_buy_in) : '—'}
                    </td>
                    <td className="p-3 text-right font-mono text-text-primary font-medium">
                      {lvl.max_session_exposure !== null ? formatCurrency(lvl.max_session_exposure) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hard rule reminder card */}
        <div className="bg-ink/50 border border-border p-4 rounded-[6px] flex items-start gap-3">
          <Lock size={14} className="text-text-muted shrink-0 mt-0.5" />
          <p className="text-12 text-text-muted leading-relaxed">
            Coaching protocols dictate absolute segregation between money metrics and qualitative evaluations. Under strict compliance guidelines, financial limits are displayed neutrally regardless of sign or threshold adherence to emphasize absolute outcome independence.
          </p>
        </div>

      </div>

    </div>
  );
}
