import React, { useState } from 'react';
import { Award, AlertTriangle, ArrowUp, ArrowRight, ArrowDown, Info } from 'lucide-react';
import { fetchWeeklyCoachBrief } from '../lib/coachBrief';
import { formatCurrency, medalColorClass } from '../lib/utils';
import { useAsync } from '../lib/useAsync';
import ReflectionModal from './ReflectionModal';
import CoachDeepAnalysisViewer from './CoachDeepAnalysisViewer';
import { PlayerId, CoachId, VerdictId, asVerdictId } from '../types/ids';

interface CoachBriefViewProps {
  playerId: PlayerId;
  coachId: CoachId;
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border pb-3 mb-4">
      <h3 className="text-14 font-semibold uppercase tracking-wider text-text-primary">{title}</h3>
      <span title={hint} className="text-text-faint cursor-help">
        <Info size={13} />
      </span>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-[6px] p-6">{children}</div>;
}

// PRD §21/3.1 order, pruned to what belongs on the Brief specifically:
// Since Last Review -> Critical Alerts (only if non-empty) -> P.E.O summary
// -> Repeat-Offence Tracker -> Learning Implementation -> AI Conversation
// Signals -> Suggested Agenda. Behavioral Profile trend and Verdict
// Timeline were dropped (Behavioral trend now lives only in the dedicated
// Behavioral tab, which also owns the radar); Financial and BRM Review
// moved to the BRM tab (BRMConfigView's "Player Financial & BRM Review"
// section); Intervention Review moved to the Interventions tab, which
// already lists every assignment per player in its Assignments section.
export default function CoachBriefView({ playerId, coachId }: CoachBriefViewProps) {
  const { data: brief, loading, error } = useAsync(() => fetchWeeklyCoachBrief(playerId, coachId), [playerId, coachId]);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [viewingReflection, setViewingReflection] = useState<{ label: string; note: string } | null>(null);
  const [viewingConversation, setViewingConversation] = useState<{ verdictId: VerdictId; headline: string } | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
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

  if (!brief) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* 1. Since Last Review */}
      <Section>
        <SectionHeader title="Since Last Review" hint="A plain-language summary of activity since the last locked Coach Review." />
        <p className="text-14 text-text-primary leading-relaxed">{brief.sinceLastReview}</p>
      </Section>

      {/* 2. Critical Alerts — only rendered if non-empty, per PRD */}
      {brief.criticalAlerts.length > 0 && (
        <Section>
          <SectionHeader title="Critical Alerts" hint="Non-compliant or hard-gate Execution Action occurrences in the last 14 days." />
          <div className="flex flex-col gap-3">
            {brief.criticalAlerts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between p-3.5 rounded-[4px] border gap-3 ${
                  a.isHardGate ? 'border-signal-risk/30 bg-signal-risk/5' : 'border-signal-caution/30 bg-signal-caution/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle size={16} className={a.isHardGate ? 'text-signal-risk shrink-0 mt-0.5' : 'text-signal-caution shrink-0 mt-0.5'} />
                  <span className="text-14 text-text-primary">
                    {a.actionName} {a.isHardGate && <span className="text-11 font-mono text-signal-risk uppercase ml-1">Hard Gate</span>}
                  </span>
                </div>
                <span className="text-11 font-mono text-text-faint">{new Date(a.occurredAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 3. Preparation -> Execution -> Outcome summary */}
      <Section>
        <SectionHeader title="Preparation - Execution - Outcome" hint="Same P.E.O medal-glyph pattern as the player's session history." />
        {brief.peoSummary.length === 0 ? (
          <span className="text-12 text-text-muted italic">No sessions logged yet.</span>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-11 font-mono text-text-muted">
                <th className="p-3">SESSION</th>
                <th className="p-3">MEDALS (P·E·O)</th>
                <th className="p-3">VERDICT</th>
                <th className="p-3 text-right">P&L</th>
                <th className="p-3">REFLECTION</th>
                <th className="p-3">DEEP ANALYSIS</th>
              </tr>
            </thead>
            <tbody className="text-12 font-sans text-text-primary">
              {brief.peoSummary.map((s) => {
                const verdict = s.verdicts?.[0];
                const prepRel = s.preparation_records;
                const prepMedal = (Array.isArray(prepRel) ? prepRel[0]?.medal_tier : prepRel?.medal_tier) || 'NONE';
                const execMedal = s.session_execution_assessments?.[0]?.system_execution_medal || 'NONE';
                const outcomeMedal = s.session_outcome_assessments?.[0]?.system_outcome_medal || 'NONE';
                const pnl = s.session_outcome_assessments?.[0]?.final_session_net_pnl || 0;
                const sessionLabel = s.start_time ? new Date(s.start_time).toLocaleDateString() : 'Session';
                return (
                  <tr key={s.id} className="border-b border-border">
                    <td className="p-3 font-mono">{sessionLabel}</td>
                    <td className="p-3 text-11">
                      <div className="flex gap-2">
                        {[prepMedal, execMedal, outcomeMedal].map((medal, i) => (
                          <div key={i} className="flex flex-col items-center">
                            <Award size={14} className={medalColorClass(medal)} />
                            <span className={`text-[9px] font-bold ${medalColorClass(medal)}`}>{medal}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-12">{verdict?.headline || 'No verdict'}</td>
                    <td className="p-3 text-right font-mono text-text-primary">{formatCurrency(pnl)}</td>
                    <td className="p-3">
                      {s.reflection_note?.trim() ? (
                        <button
                          type="button"
                          onClick={() => setViewingReflection({ label: sessionLabel, note: s.reflection_note! })}
                          className="text-accent-steel hover:underline cursor-pointer"
                        >
                          See Reflection
                        </button>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {verdict?.id ? (
                        <button
                          type="button"
                          onClick={() => setViewingConversation({ verdictId: asVerdictId(verdict.id), headline: verdict.headline })}
                          className="text-accent-steel hover:underline cursor-pointer"
                        >
                          View Conversation
                        </button>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* 4. Repeat-Offence Tracker */}
      <Section>
        <SectionHeader title="Repeat-Offence Tracker" hint="Execution Actions currently past stage 0 on the escalation ladder." />
        {brief.repeatOffences.length === 0 ? (
          <span className="text-12 text-text-muted italic">No active repeat-offence tracks.</span>
        ) : (
          <div className="flex flex-col">
            {brief.repeatOffences.map((o) => {
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
                    <p className="text-11 text-text-faint pb-2">
                      Last occurrence: {o.lastOccurrenceAt ? new Date(o.lastOccurrenceAt).toLocaleString() : 'unknown'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 5. Learning Implementation */}
      <Section>
        <SectionHeader title="Learning Implementation" hint="Did the player act on the coaching points from their last review?" />
        {brief.learningImplementation.length === 0 ? (
          <span className="text-12 text-text-muted italic">No prior review recorded yet.</span>
        ) : (
          <div className="flex flex-col gap-2">
            {brief.learningImplementation.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-13">
                <span className="text-text-primary">{p.description}</span>
                <span className="text-11 font-mono text-text-muted uppercase">{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 6. AI Conversation Signals */}
      <Section>
        <SectionHeader title="AI Conversation Signals" hint="Engagement signal, not a score." />
        <p className="text-14 text-text-primary">
          {brief.aiConversationMessageCount} message{brief.aiConversationMessageCount === 1 ? '' : 's'} in the last 14 days.
        </p>
        <p className="text-11 text-text-faint mt-1">Engagement signal, not a score.</p>
      </Section>

      {/* 7. Suggested Agenda — always last */}
      <Section>
        <SectionHeader title="Suggested Agenda" hint="Suggested — edit before the call." />
        <ul className="flex flex-col gap-2 list-disc list-inside">
          {brief.suggestedAgenda.map((item, i) => (
            <li key={i} className="text-14 text-text-primary">{item}</li>
          ))}
        </ul>
      </Section>

      {viewingReflection && (
        <ReflectionModal
          sessionLabel={viewingReflection.label}
          reflectionNote={viewingReflection.note}
          onClose={() => setViewingReflection(null)}
        />
      )}

      {viewingConversation && (
        <CoachDeepAnalysisViewer
          playerId={playerId}
          verdictId={viewingConversation.verdictId}
          verdictHeadline={viewingConversation.headline}
          onClose={() => setViewingConversation(null)}
        />
      )}
    </div>
  );
}
