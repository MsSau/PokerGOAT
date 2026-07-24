// src/components/VerdictsView.tsx
//
// Player-facing Verdicts tab (PRD §13 / §2.10 Verdict Card). Left: a
// collapsible rail of browsable Verdict history, collapsed by default so
// the selected Verdict stays the focal point. Remaining width: the full
// Verdict Card for the selected Verdict, in PRD's fixed section order, each
// claim anchored by an Evidence Chip (§0.1's "signature element" — a
// confidence-level pill with a tap target to reveal the underlying
// evidence). "Go Deeper" (§14 Deep Analysis) renders per spec as a single
// quiet text link beneath the card and opens DeepAnalysisPanel, a real
// Gemini-backed conversation (server.ts) grounded in this same Verdict's
// evidence.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, Sparkles } from 'lucide-react';
import {
  fetchVerdictHistory,
  fetchVerdictDetail,
  fetchSessionMistakes,
  CLASSIFICATION_TONE,
  VERDICT_CARD_SECTIONS,
  VerdictDetail,
  VerdictEvidenceItem,
  EvidenceConfidence,
  MistakeOccurrence,
} from '../lib/verdicts';
import { buildHeadline } from '../lib/verdictEngine';
import { resolveCoachId } from '../lib/supabase';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';
import DeepAnalysisPanel from './DeepAnalysisPanel';

interface Props {
  userId: string;
}

const CONFIDENCE_TONE: Record<EvidenceConfidence, string> = {
  HIGH: 'text-signal-process border-signal-process/30 bg-signal-process/10',
  MEDIUM: 'text-signal-caution border-signal-caution/30 bg-signal-caution/10',
  LOW: 'text-text-muted border-border bg-surface-raised',
};

// Single source of truth for section titles (verdicts.ts / PRD §2.10), keyed
// for O(1) lookup by the section-specific renderers below.
const SECTION = Object.fromEntries(VERDICT_CARD_SECTIONS.map((s) => [s.key, s])) as Record<
  (typeof VERDICT_CARD_SECTIONS)[number]['key'],
  (typeof VERDICT_CARD_SECTIONS)[number]
>;

function ConfidenceBadge({ item, align = 'start' }: { item: VerdictEvidenceItem; align?: 'start' | 'end' }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`flex items-center gap-1 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors ${CONFIDENCE_TONE[item.confidenceLevel]}`}
      >
        {item.confidenceLevel}
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {expanded && (
        <div className={`text-11 text-text-faint font-mono ${align === 'end' ? 'text-right' : ''}`}>
          Source: {item.evidenceEntityType.replace(/_/g, ' ')}
          {item.createdAt && ` · ${new Date(item.createdAt).toLocaleString()}`}
        </div>
      )}
    </div>
  );
}

// A "Factor" row — the mockup's structural unit for the two evidence
// columns: an ordinal eyebrow, the claim itself, and its Evidence Chip
// pinned to the row's trailing edge instead of stacked beneath the text.
function FactorRow({ index, item }: { index: number; item: VerdictEvidenceItem }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-border/40 last:border-b-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-10 font-mono uppercase text-text-faint tracking-wider">Factor {String(index + 1).padStart(2, '0')}</span>
        <span className="text-14 text-text-primary leading-snug">{item.claimText}</span>
      </div>
      <ConfidenceBadge item={item} align="end" />
    </div>
  );
}

// Lazy on-demand list behind "Where You Failed the Standard" — only
// fetched once the player actually taps the link, not on every Verdict
// Card render (most views never need the raw occurrence list, just the
// summarized evidence bullets above it).
function MistakesLink({ sessionId }: { sessionId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState<MistakeOccurrence[] | null>(null);

  const handleClick = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && mistakes === null) {
      setLoading(true);
      setError(null);
      try {
        setMistakes(await fetchSessionMistakes(sessionId));
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-signal-risk/20">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-1 text-11 font-mono uppercase tracking-wider text-signal-risk hover:underline cursor-pointer"
      >
        {expanded ? 'Hide mistakes' : 'View mistakes'}
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {loading && <span className="text-12 text-text-faint">Loading…</span>}
          {error && <span className="text-12 text-signal-risk">{error}</span>}
          {!loading && !error && mistakes?.length === 0 && (
            <span className="text-12 text-text-faint italic">No flagged mistakes this session.</span>
          )}
          {!loading && mistakes?.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 text-12">
              <span className="text-text-primary">
                {m.actionName}
                {m.tournamentName && <span className="text-text-faint"> — {m.tournamentName}</span>}
              </span>
              <span className="text-11 font-mono text-text-faint uppercase shrink-0">{m.severity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceColumn({
  title,
  items,
  tone,
  sessionId,
}: {
  title: string;
  items: VerdictEvidenceItem[];
  tone: 'neutral' | 'risk';
  sessionId?: string;
}) {
  const isRisk = tone === 'risk';
  return (
    <div>
      <h3 className={`text-12 font-semibold uppercase tracking-wider mb-3 ${isRisk ? 'text-signal-risk' : 'text-text-primary'}`}>{title}</h3>
      <div
        className={`rounded-[6px] p-4 border ${isRisk ? 'border-signal-risk/30 bg-signal-risk/5' : 'border-border bg-surface-raised/40'}`}
      >
        {items.length === 0 ? (
          <span className="text-13 text-text-faint italic">No evidence recorded for this section.</span>
        ) : (
          <div className="flex flex-col">
            {items.map((item, i) => (
              <FactorRow key={item.id} index={i} item={item} />
            ))}
          </div>
        )}
        {isRisk && sessionId && <MistakesLink sessionId={sessionId} />}
      </div>
    </div>
  );
}

function PatternCheckSection({ items }: { items: VerdictEvidenceItem[] }) {
  return (
    <div className="pt-2 border-t border-border">
      <h3 className="text-11 font-mono uppercase tracking-wider text-text-faint mb-3">{SECTION.PATTERN_CHECK.title}</h3>
      {items.length === 0 ? (
        <span className="text-13 text-text-faint italic">No evidence recorded for this section.</span>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[6px] border border-border bg-surface-raised/30 p-3 flex flex-col gap-2">
              <span className="text-13 text-text-primary leading-snug">{item.claimText}</span>
              <ConfidenceBadge item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutcomeRealitySection({ item }: { item: VerdictEvidenceItem | undefined }) {
  return (
    <div className="bg-surface-raised/60 rounded-[6px] p-4">
      <h3 className="text-12 font-semibold uppercase tracking-wider mb-3 text-text-primary">
        {SECTION.OUTCOME_REALITY.title}
        <span className="text-10 text-text-faint font-normal normal-case ml-2">— outcome-only commentary</span>
      </h3>
      {!item ? (
        <span className="text-13 text-text-faint italic">No evidence recorded for this section.</span>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-14 text-text-primary leading-relaxed">{item.claimText}</span>
          <ConfidenceBadge item={item} />
        </div>
      )}
    </div>
  );
}

function NextStandardSection({ item }: { item: VerdictEvidenceItem | undefined }) {
  return (
    <div className="rounded-[6px] border border-border bg-surface/40 p-4 flex items-start gap-3">
      <Target size={16} className="text-accent-steel shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-11 font-mono uppercase tracking-wider text-text-faint">{SECTION.NEXT_STANDARD.title}</span>
        {!item ? (
          <span className="text-13 text-text-faint italic">No evidence recorded for this section.</span>
        ) : (
          <>
            <span className="text-14 text-text-primary leading-relaxed italic">&ldquo;{item.claimText}&rdquo;</span>
            <ConfidenceBadge item={item} />
          </>
        )}
      </div>
    </div>
  );
}

// AI-generated closing paragraph (server.ts's POST /api/verdict-reflection),
// synthesized from this Verdict's evidence plus the player's own free text
// from earlier in the flow. Deliberately does NOT reuse ConfidenceBadge/
// FactorRow — no confidence pill, no "Factor NN" eyebrow, no expandable
// source disclosure — because it's synthesized narrative across several
// free-text snippets, not a single sourced claim, and must read as visually
// distinct from the evidence-traceable sections above it. Renders nothing
// when the player left every free-text source blank that session (or
// generation failed) — this section's whole value is quoting the player's
// own words back to them.
function ReflectionSection({ prose }: { prose: string | null }) {
  if (!prose) return null;
  return (
    <div className="rounded-[6px] border border-accent-steel/25 bg-accent-steel/5 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent-steel shrink-0" />
        <span className="text-11 font-mono uppercase tracking-wider text-accent-steel">AI Reflection</span>
      </div>
      <p className="text-14 text-text-primary leading-relaxed">{prose}</p>
      <span className="text-10 text-text-faint">Generated from your own notes and this session&apos;s evidence — not itself a sourced claim.</span>
    </div>
  );
}

function VerdictCard({ detail, onGoDeeper, goDeeperEnabled }: { detail: VerdictDetail; onGoDeeper: () => void; goDeeperEnabled: boolean }) {
  const { evidenceBySection } = detail;
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* 1. Verdict Headline */}
      <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className={`text-11 font-mono uppercase tracking-wider ${CLASSIFICATION_TONE[detail.classification]}`}>
            Primary Verdict
          </span>
          <span className="font-display text-40 uppercase text-text-primary leading-none">{buildHeadline(detail.classification)}</span>
        </div>
        {detail.createdAt && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-11 font-mono uppercase tracking-wider text-text-faint">Session Date</span>
            <span className="text-14 font-semibold text-text-primary">
              {new Date(detail.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* 2-3. What You Did Well / Where You Failed the Standard — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EvidenceColumn title={SECTION.WHAT_WENT_WELL.title} items={evidenceBySection.WHAT_WENT_WELL} tone="neutral" />
        <EvidenceColumn title={SECTION.WHERE_FAILED.title} items={evidenceBySection.WHERE_FAILED} tone="risk" sessionId={detail.sessionId} />
      </div>

      {/* 4. Pattern Check */}
      <PatternCheckSection items={evidenceBySection.PATTERN_CHECK} />

      {/* 5. Outcome Reality Check */}
      <OutcomeRealitySection item={evidenceBySection.OUTCOME_REALITY[0]} />

      {/* 6. Next Standard */}
      <NextStandardSection item={evidenceBySection.NEXT_STANDARD[0]} />

      {/* AI Reflection — closing synthesis from the player's own free text */}
      <ReflectionSection prose={detail.reflectionProse} />

      <div className="pt-2 border-t border-border">
        <button
          type="button"
          onClick={onGoDeeper}
          disabled={!goDeeperEnabled}
          className="text-12 text-text-muted hover:text-text-primary underline decoration-dotted cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Go Deeper
        </button>
      </div>
    </div>
  );
}

export default function VerdictsView({ userId }: Props) {
  const { data: history, loading: historyLoading, error: historyError } = useAsync(() => fetchVerdictHistory(userId), [userId]);
  const { data: coachId } = useAsync(() => resolveCoachId(userId, 'PLAYER'), [userId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepAnalysisOpen, setDeepAnalysisOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  useEffect(() => {
    if (!selectedId && history && history.length > 0) setSelectedId(history[0].id);
  }, [history, selectedId]);

  const { data: detail, loading: detailLoading, error: detailError } = useAsync(
    () => (selectedId ? fetchVerdictDetail(selectedId) : Promise.resolve(null)),
    [selectedId],
  );

  if (historyLoading) {
    return (
      <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
        <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="bg-surface border border-signal-risk/30 rounded-[6px] p-6 flex items-start gap-3">
        <AlertTriangle size={18} className="text-signal-risk shrink-0 mt-0.5" />
        <p className="text-14 text-text-primary leading-relaxed">{historyError}</p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-[6px] p-8 flex flex-col items-center gap-2 text-center">
        <span className="text-14 text-text-muted">No verdicts yet.</span>
        <span className="text-12 text-text-faint">Complete a session to receive your first Verdict.</span>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-[6px] flex overflow-hidden font-sans min-h-[600px] animate-fade-in">
      {/* HISTORY — collapsible rail */}
      <div
        className={`shrink-0 border-r border-border flex flex-col transition-[width] duration-200 ${railOpen ? 'w-1/3' : 'w-11'}`}
      >
        <button
          type="button"
          onClick={() => setRailOpen((o) => !o)}
          aria-label={railOpen ? 'Collapse verdict history' : 'Expand verdict history'}
          className="flex items-center gap-2 p-3 border-b border-border/60 text-text-muted hover:text-text-primary cursor-pointer shrink-0"
        >
          {railOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          {railOpen && <span className="text-11 font-mono uppercase tracking-wider">History</span>}
        </button>
        {railOpen && (
          <div className="overflow-y-auto">
            {history.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`w-full text-left p-4 border-b border-border/60 transition-colors cursor-pointer ${
                  selectedId === v.id ? 'bg-surface-raised' : 'hover:bg-surface-raised/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${CLASSIFICATION_TONE[v.classification]} border-current/30 bg-current/10`}
                  >
                    {buildHeadline(v.classification)}
                  </span>
                  {v.createdAt && (
                    <span className="text-11 font-mono text-text-faint ml-auto">
                      {new Date(v.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-13 text-text-primary line-clamp-2 leading-snug">{v.headline}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* DETAIL — remaining width */}
      <div className="flex-1 min-w-0 p-6 overflow-y-auto">
        {detailLoading && (
          <div className="flex items-center justify-center py-12">
            <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {detailError && <span className="text-14 text-signal-risk">{detailError}</span>}
        {!detailLoading && detail && (
          <VerdictCard detail={detail} goDeeperEnabled={!!coachId} onGoDeeper={() => setDeepAnalysisOpen(true)} />
        )}
      </div>

      {deepAnalysisOpen && detail && coachId && (
        <DeepAnalysisPanel playerId={userId} coachId={coachId} verdict={detail} onClose={() => setDeepAnalysisOpen(false)} />
      )}
    </div>
  );
}
