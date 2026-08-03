import React, { useMemo, useState } from 'react';
import { ArrowUp, ArrowRight, ArrowDown, AlertTriangle, Repeat, Sparkles } from 'lucide-react';
import {
  fetchBehavioralProfile,
  computeBehavioralCategory,
  DimensionProfile,
  DimensionState,
  EvidenceWindow,
  BehavioralCategory,
  BEHAVIORAL_CATEGORY_LABELS,
} from '../lib/behavioralProfile';
import { Dimension, DIMENSION_LABELS } from '../lib/behavioralProfileEngine';
import { proposeExecutionAction } from '../lib/taxonomy';
import { resolveCoachId } from '../lib/supabase';
import { getErrorMessage } from '../lib/utils';
import { useAsync } from '../lib/useAsync';
import { PlayerId } from '../types/ids';
import ProposeActionModal from './ProposeActionModal';

interface BehavioralProfileViewProps {
  userId: PlayerId;
  showRadar?: boolean;
  allowWindowControl?: boolean;
  // Only the player's own Progress tab can propose an Execution Action for
  // themselves — CoachShell renders this same component for whichever
  // player it has selected, where userId is the player being *viewed*, not
  // the signed-in user, so proposing here would fail RLS's proposed_by =
  // auth.uid() check (and would be the wrong actor anyway).
  canPropose?: boolean;
  onProposed?: () => void;
}

// The Execution taxonomy only scores these 4 dimensions (see
// executionEngine.ts's Dimension comment) — Preparation and Outcomes below
// are scored by separate medal systems and never appear as a proposable
// Execution Action dimension, even though they're part of this screen's
// 6-axis radar. Same restricted set as SessionReview.tsx/TaxonomyConfigView.tsx.
const PROPOSABLE_DIMENSION_TABS: { key: Dimension; label: string }[] = [
  { key: 'DISCIPLINE_PROCESS', label: 'Discipline/Process' },
  { key: 'TECHNICAL_PLAY', label: 'Technical' },
  { key: 'MENTAL_GAME', label: 'Mental' },
  { key: 'LEARNING_IMPROVEMENT', label: 'Learning' },
];

const WINDOW_OPTIONS: { value: EvidenceWindow | 'AUTO'; label: string }[] = [
  { value: 'AUTO', label: 'Auto (recommended)' },
  { value: 'RECENT', label: 'Recent (7 days)' },
  { value: 'SHORT_TERM', label: 'Short-term (30 days)' },
  { value: 'LONG_TERM', label: 'Long-term (all history)' },
];

const STATE_LABELS: Record<DimensionState, string> = {
  IMPROVING: 'Improving',
  STABLE: 'Stable',
  DETERIORATING: 'Deteriorating',
  INSUFFICIENT_RECENT_DATA: 'Insufficient Recent Data',
  NOT_CURRENTLY_OBSERVABLE: 'Not Currently Observable',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Six-axis radar per PRD §2.12 — single series, single hue, hairline hex
// grid at 25/50/75/100% rings. Missing evidence (radarIndex === null) plots
// as 0 — a dip toward center is itself an honest "no evidence yet" signal.
// Short per-line labels (rather than the full DIMENSION_LABELS string) keep
// each axis label narrow regardless of anchor side, so nothing runs past
// the viewBox edge and gets clipped.
const DIMENSION_LABEL_LINES: Record<Dimension, string[]> = {
  PREPARATION: ['Preparation'],
  DISCIPLINE_PROCESS: ['Discipline', 'Process'],
  TECHNICAL_PLAY: ['Technical', 'Play'],
  MENTAL_GAME: ['Mental', 'Game'],
  LEARNING_IMPROVEMENT: ['Learning', 'Improvement'],
  OUTCOMES: ['Results', 'Outcomes'],
};

function RadarChart({ profiles }: { profiles: DimensionProfile[] }) {
  const size = 380;
  const cx = size / 2;
  const cy = size / 2;
  const R = 95;
  const n = profiles.length;

  const pointAt = (index: number, fraction: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return { x: cx + fraction * R * Math.cos(angle), y: cy + fraction * R * Math.sin(angle) };
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const dataPoints = profiles.map((p, i) => pointAt(i, (p.radarIndex ?? 0) / 100));
  const dataPath = dataPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[340px] mx-auto" role="img" aria-label="Behavioral Profile radar chart">
      {rings.map((r) => {
        const ringPoints = profiles.map((_, i) => pointAt(i, r));
        return (
          <polygon
            key={r}
            points={ringPoints.map((pt) => `${pt.x},${pt.y}`).join(' ')}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        );
      })}

      {profiles.map((_, i) => {
        const outer = pointAt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="var(--border)" strokeWidth={1} />;
      })}

      <polygon points={dataPath} fill="var(--signal-process)" fillOpacity={0.18} stroke="var(--signal-process)" strokeWidth={1.5} />

      {profiles.map((p, i) => {
        const labelPt = pointAt(i, 1.25);
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const cos = Math.cos(angle);
        const anchor = cos > 0.3 ? 'start' : cos < -0.3 ? 'end' : 'middle';
        const lines = DIMENSION_LABEL_LINES[p.dimension];
        const startDy = lines.length > 1 ? -3 : 3;
        return (
          <text
            key={p.dimension}
            x={labelPt.x}
            y={labelPt.y}
            textAnchor={anchor}
            className="fill-text-muted"
            style={{ fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase' }}
          >
            {lines.map((line, li) => (
              <tspan key={li} x={labelPt.x} dy={li === 0 ? startDy : 12}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

function TrendRow({ profile, expanded, onToggle }: { profile: DimensionProfile; expanded: boolean; onToggle: () => void }) {
  const showValue = profile.state === 'IMPROVING' || profile.state === 'STABLE' || profile.state === 'DETERIORATING';
  const Icon = profile.state === 'IMPROVING' ? ArrowUp : profile.state === 'DETERIORATING' ? ArrowDown : ArrowRight;
  const colorClass =
    profile.state === 'IMPROVING' ? 'text-signal-process' : profile.state === 'DETERIORATING' ? 'text-signal-risk' : 'text-text-muted';

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2.5 text-left cursor-pointer"
      >
        <span className="text-13 text-text-primary">{DIMENSION_LABELS[profile.dimension]}</span>
        <span className={`flex items-center gap-1.5 text-13 font-mono ${showValue ? colorClass : 'text-text-muted'}`}>
          {showValue ? (
            <>
              <Icon size={13} /> {STATE_LABELS[profile.state]}
              {profile.radarIndex !== null && <span className="text-11 text-text-faint">({profile.radarIndex})</span>}
            </>
          ) : (
            STATE_LABELS[profile.state]
          )}
        </span>
      </button>

      {expanded && (
        <div className="pb-3 flex flex-col gap-1.5 text-12 text-text-muted">
          {profile.strongestPositiveSignal && (
            <div className="flex items-center justify-between bg-signal-process/5 border border-signal-process/20 rounded-[4px] px-2.5 py-1.5">
              <span>Strongest signal: {profile.strongestPositiveSignal.label}</span>
              <span className="text-11 text-text-faint font-mono">{formatDate(profile.strongestPositiveSignal.occurredAt)}</span>
            </div>
          )}
          {profile.biggestConcern && (
            <div className="flex items-center justify-between bg-signal-risk/5 border border-signal-risk/20 rounded-[4px] px-2.5 py-1.5">
              <span>Biggest concern: {profile.biggestConcern.label}</span>
              <span className="text-11 text-text-faint font-mono">{formatDate(profile.biggestConcern.occurredAt)}</span>
            </div>
          )}
          {!profile.strongestPositiveSignal && !profile.biggestConcern && (
            <span className="text-text-faint">No evidence logged for this dimension yet.</span>
          )}
          {profile.recurringPatterns.length > 0 && (
            <div className="flex flex-col gap-1">
              {profile.recurringPatterns.map((pattern, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-signal-caution/5 border border-signal-caution/20 rounded-[4px] px-2.5 py-1.5">
                  <Repeat size={11} className="text-signal-caution shrink-0" />
                  <span>Recurring pattern: {pattern}</span>
                </div>
              ))}
            </div>
          )}
          <span className="text-11 text-text-faint font-mono">
            {profile.evidenceCount} evidence point{profile.evidenceCount === 1 ? '' : 's'} · {profile.evidenceWindow.replace('_', ' ').toLowerCase()} window
          </span>
        </div>
      )}
    </div>
  );
}

const CATEGORY_TONE: Record<BehavioralCategory, string> = {
  TILT_CHASER: 'text-signal-risk border-signal-risk/30 bg-signal-risk/10',
  LUCKY_RULE_BREAKER: 'text-signal-risk border-signal-risk/30 bg-signal-risk/10',
  GREED_LEAKER: 'text-signal-risk border-signal-risk/30 bg-signal-risk/10',
  KNOWLEDGE_EXECUTION_GAP: 'text-signal-caution border-signal-caution/30 bg-signal-caution/10',
  STAGNANT_GRINDER: 'text-signal-caution border-signal-caution/30 bg-signal-caution/10',
  DISCIPLINED_GRINDER: 'text-signal-process border-signal-process/30 bg-signal-process/10',
  IMPROVING_PROFESSIONAL: 'text-signal-process border-signal-process/30 bg-signal-process/10',
};

function CategoryPill({ category }: { category: BehavioralCategory }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-12 font-semibold px-2.5 py-1 rounded-full border ${CATEGORY_TONE[category]}`}>
      <Sparkles size={12} />
      {BEHAVIORAL_CATEGORY_LABELS[category]}
    </span>
  );
}

export default function BehavioralProfileView({
  userId,
  showRadar = true,
  allowWindowControl = false,
  canPropose = false,
  onProposed,
}: BehavioralProfileViewProps) {
  const [windowOverride, setWindowOverride] = useState<EvidenceWindow | 'AUTO'>('AUTO');
  const { data: profiles, loading, error } = useAsync(
    () => fetchBehavioralProfile(userId, windowOverride === 'AUTO' ? undefined : windowOverride),
    [userId, windowOverride],
  );
  const [expandedDim, setExpandedDim] = useState<Dimension | null>(null);
  const [proposeModalOpen, setProposeModalOpen] = useState(false);
  const [proposeSubmitting, setProposeSubmitting] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposeConfirmation, setProposeConfirmation] = useState<string | null>(null);

  const rows = profiles ?? [];
  const category = useMemo(() => computeBehavioralCategory(rows), [rows]);

  const defaultProposeDimension: Dimension =
    (expandedDim && PROPOSABLE_DIMENSION_TABS.some((t) => t.key === expandedDim) ? expandedDim : null) ??
    PROPOSABLE_DIMENSION_TABS[0].key;

  async function handleProposeSubmit(fields: { name: string; description: string | null; dimension: Dimension }) {
    setProposeSubmitting(true);
    setProposeError(null);
    try {
      const coachId = await resolveCoachId(userId, 'PLAYER');
      await proposeExecutionAction(userId, coachId, fields);
      setProposeModalOpen(false);
      setProposeConfirmation("Submitted — pending your coach's approval.");
      onProposed?.();
    } catch (err) {
      setProposeError(getErrorMessage(err));
    } finally {
      setProposeSubmitting(false);
    }
  }

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

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Behavioral Profile</span>
        {allowWindowControl && (
          <div className="flex items-center gap-2">
            <label className="text-11 font-mono text-text-muted uppercase tracking-wider">Evidence Window</label>
            <select
              value={windowOverride}
              onChange={(e) => setWindowOverride(e.target.value as EvidenceWindow | 'AUTO')}
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-2.5 py-1.5 text-12 text-text-primary transition-colors"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showRadar && (
        <>
          {(category.primary || category.secondary) ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {category.primary && <CategoryPill category={category.primary} />}
                {category.secondary && <CategoryPill category={category.secondary} />}
              </div>
              <span className="text-11 text-text-faint">
                {category.secondary ? 'Primary and secondary behavioral state' : 'Primary behavioral state'} · derived from current evidence, may change daily
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <span className="text-11 text-text-faint italic">Not enough evidence yet to classify a behavioral state.</span>
            </div>
          )}
          <RadarChart profiles={rows} />
        </>
      )}

      <div className="flex flex-col">
        {rows.map((p) => (
          <TrendRow
            key={p.dimension}
            profile={p}
            expanded={expandedDim === p.dimension}
            onToggle={() => setExpandedDim((cur) => (cur === p.dimension ? null : p.dimension))}
          />
        ))}
      </div>

      {canPropose && (
        <div className="flex justify-end">
          {!proposeConfirmation ? (
            <button
              type="button"
              onClick={() => { setProposeError(null); setProposeModalOpen(true); }}
              className="text-12 font-medium text-accent-steel hover:text-accent-steel/80 transition-colors cursor-pointer"
            >
              + Propose a new action
            </button>
          ) : (
            <span className="text-12 text-signal-process">{proposeConfirmation}</span>
          )}
        </div>
      )}
      {proposeError && (
        <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{proposeError}</div>
      )}

      <p className="text-11 text-text-faint leading-relaxed border-t border-border pt-4">
        Computed from your logged Preparation Medals, Execution dimension ratings, and Outcome Medals.
        Never used to determine Medals, escalation, or interventions — only to show your own trend.
      </p>

      {proposeModalOpen && (
        <ProposeActionModal
          dimensionOptions={PROPOSABLE_DIMENSION_TABS}
          defaultDimension={defaultProposeDimension}
          submitting={proposeSubmitting}
          onConfirm={handleProposeSubmit}
          onCancel={() => setProposeModalOpen(false)}
        />
      )}
    </div>
  );
}
