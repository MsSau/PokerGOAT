import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency, medalColorClass } from '../lib/utils';
import { Award } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import ReflectionModal from './ReflectionModal';
import { PlayerId } from '../types/ids';

interface SessionLogRow {
  id: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  preparation_medal: string | null;
  execution_medal: string | null;
  outcome_medal: string | null;
  verdict_headline: string | null;
  final_pnl: number | null;
  tournament_count: number;
  reflection_note: string | null;
}

export default function SessionLog({ userId }: { userId: PlayerId }) {
  const [viewingReflection, setViewingReflection] = useState<{ label: string; note: string } | null>(null);

  const { data, loading, error } = useAsync(async () => {
    // Only FINALIZED sessions belong in the historical register —
    // ACTIVE/REVIEW_PENDING sessions live under Play, not Log.
    const { data, error: sErr } = await supabase
      .from('sessions')
      .select(`
        id, start_time, end_time, status, execution_medal, outcome_medal, reflection_note,
        preparation_records ( medal_tier ),
        verdicts ( headline, is_current ),
        session_outcome_assessments ( final_session_net_pnl, is_current ),
        tournaments ( id )
      `)
      .eq('player_id', userId)
      .eq('status', 'FINALIZED')
      .order('start_time', { ascending: false })
      .limit(30);
    if (sErr) throw sErr;

    return (data || []).map((s): SessionLogRow => {
      const currentVerdict = s.verdicts.find((v) => v.is_current) ?? s.verdicts[0];
      const currentOutcome = s.session_outcome_assessments.find((o) => o.is_current) ?? s.session_outcome_assessments[0];
      const preparationRel = s.preparation_records as { medal_tier: string } | { medal_tier: string }[] | null;
      const preparationMedal = Array.isArray(preparationRel) ? preparationRel[0]?.medal_tier : preparationRel?.medal_tier;
      return {
        id: s.id,
        start_time: s.start_time,
        end_time: s.end_time,
        status: s.status,
        preparation_medal: preparationMedal ?? null,
        execution_medal: s.execution_medal,
        outcome_medal: s.outcome_medal,
        verdict_headline: currentVerdict?.headline ?? null,
        final_pnl: currentOutcome?.final_session_net_pnl ?? null,
        tournament_count: (s.tournaments || []).length,
        reflection_note: s.reflection_note,
      };
    });
  }, [userId]);
  const rows = data ?? [];

  const medalGlyph = (medal: string | null) => {
    if (!medal || medal === 'NONE') {
      return <span className="text-[10px] font-mono text-text-faint">None</span>;
    }
    const className = medalColorClass(medal);
    return (
      <span className={`flex items-center gap-1 text-[10px] font-mono ${className}`}>
        <Award size={12} className={className} /> {medal}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 text-14 text-signal-risk">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
      <span className="text-12 font-mono text-text-muted uppercase">Session Register</span>
      {rows.length === 0 ? (
        <span className="text-12 text-text-faint italic">No sessions logged yet.</span>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-raised text-11 font-mono text-text-muted">
                <th className="p-3">SESSION</th>
                <th className="p-3">TOURNAMENTS</th>
                <th className="p-3">PREP</th>
                <th className="p-3">EXECUTION</th>
                <th className="p-3">OUTCOME</th>
                <th className="p-3">VERDICT</th>
                <th className="p-3 text-right">P&L</th>
                <th className="p-3">REFLECTION</th>
              </tr>
            </thead>
            <tbody className="text-12 font-sans text-text-primary">
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-surface-raised/30 transition-colors">
                  <td className="p-3 font-mono">{r.start_time ? new Date(r.start_time).toLocaleDateString() : '—'}</td>
                  <td className="p-3 font-mono text-text-muted">{r.tournament_count}</td>
                  <td className="p-3">{medalGlyph(r.preparation_medal)}</td>
                  <td className="p-3">{medalGlyph(r.execution_medal)}</td>
                  <td className="p-3">{medalGlyph(r.outcome_medal)}</td>
                  <td className="p-3">{r.verdict_headline ?? '—'}</td>
                  {/* Money always neutral text-primary/mono regardless of sign — §0.2 hard rule */}
                  <td className="p-3 text-right font-mono text-text-primary">
                    {r.final_pnl !== null ? formatCurrency(r.final_pnl) : '—'}
                  </td>
                  <td className="p-3">
                    {r.reflection_note?.trim() ? (
                      <button
                        type="button"
                        onClick={() =>
                          setViewingReflection({
                            label: r.start_time ? new Date(r.start_time).toLocaleDateString() : 'Session',
                            note: r.reflection_note!,
                          })
                        }
                        className="text-accent-steel hover:underline cursor-pointer"
                      >
                        See Reflection
                      </button>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewingReflection && (
        <ReflectionModal
          sessionLabel={viewingReflection.label}
          reflectionNote={viewingReflection.note}
          onClose={() => setViewingReflection(null)}
        />
      )}
    </div>
  );
}