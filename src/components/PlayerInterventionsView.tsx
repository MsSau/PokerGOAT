// src/components/PlayerInterventionsView.tsx
//
// Player-facing Interventions tab (PRD §16): every intervention the coach
// has assigned to this player, with the library item's own description and
// requirements so the player knows what's being asked of them. A player can
// mark a currently-ASSIGNED intervention complete with an optional note —
// RLS ("Players complete own assignments") only allows that exact
// ASSIGNED -> COMPLETED transition on their own row, so assigning and
// cancelling stay coach-only (InterventionsConfigView). The coach reads the
// same note back on their own Assignments list.

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { fetchAssignmentsForPlayer, markAssignmentCompletedByPlayer, PlayerAssignment } from '../lib/interventions';
import { ESCALATION_LADDER, stageLabel } from '../lib/escalationConfig';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage } from '../lib/utils';

interface Props {
  userId: string;
  onAssignmentsChanged?: () => void;
}

const TIER_TONE: Record<string, string> = {
  BASELINE: 'text-text-muted border-border bg-surface-raised',
  MINOR: 'text-text-muted border-border bg-surface-raised',
  MAJOR: 'text-signal-caution border-signal-caution/30 bg-signal-caution/10',
  CRITICAL: 'text-signal-risk border-signal-risk/30 bg-signal-risk/10',
};

function stageToneFor(stage: number): string {
  return TIER_TONE[ESCALATION_LADDER.find((s) => s.index === stage)?.tier ?? 'BASELINE'];
}

function AssignmentCard({
  assignment,
  onComplete,
}: {
  assignment: PlayerAssignment;
  onComplete: (notes: string | null) => Promise<void>;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleComplete() {
    setSaving(true);
    setError(null);
    try {
      await onComplete(notes.trim() || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-[6px] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${stageToneFor(assignment.escalation_stage_at_assignment)}`}
            >
              {stageLabel(assignment.escalation_stage_at_assignment)}
            </span>
            <span className="text-14 font-medium text-text-primary">{assignment.library_item_name}</span>
          </div>
          <span className="text-11 text-text-faint">
            Triggered by {assignment.action_name} · assigned{' '}
            {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {assignment.library_item_description && (
        <p className="text-13 text-text-primary leading-relaxed">{assignment.library_item_description}</p>
      )}
      {assignment.library_item_requirements && (
        <div className="flex flex-col gap-1">
          <span className="text-10 font-mono text-text-faint uppercase tracking-wider">Requirements</span>
          <p className="text-12 text-text-muted leading-relaxed">{assignment.library_item_requirements}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-1 border-t border-border/50">
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional note for your coach — what you did, how it went..."
          className="input"
        />
        {error && <span className="text-11 text-signal-risk">{error}</span>}
        <button
          type="button"
          disabled={saving}
          onClick={handleComplete}
          className="self-start flex items-center gap-1.5 px-4 py-2 rounded bg-accent-steel text-text-primary text-12 font-semibold hover:bg-accent-steel/90 transition-colors cursor-pointer disabled:opacity-40"
        >
          <CheckCircle2 size={14} /> Mark Complete
        </button>
      </div>
    </div>
  );
}

function HistoryRow({ assignment }: { assignment: PlayerAssignment }) {
  return (
    <div className="border border-border/60 rounded-[6px] p-3.5 flex flex-col gap-1.5 opacity-80">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${stageToneFor(assignment.escalation_stage_at_assignment)}`}>
          {stageLabel(assignment.escalation_stage_at_assignment)}
        </span>
        <span className="text-13 font-medium text-text-primary">{assignment.library_item_name}</span>
        <span className="text-11 font-mono text-text-faint ml-auto">
          {assignment.status}
          {assignment.completed_at && ` · ${new Date(assignment.completed_at).toLocaleDateString()}`}
        </span>
      </div>
      {assignment.player_notes && <p className="text-12 text-text-muted leading-relaxed">{assignment.player_notes}</p>}
    </div>
  );
}

export default function PlayerInterventionsView({ userId, onAssignmentsChanged }: Props) {
  const { data: assignments, loading, error, reload } = useAsync(() => fetchAssignmentsForPlayer(userId), [userId]);

  const active = (assignments || []).filter((a) => a.status === 'ASSIGNED');
  const history = (assignments || []).filter((a) => a.status !== 'ASSIGNED');

  async function handleComplete(id: string, notes: string | null) {
    await markAssignmentCompletedByPlayer(id, notes);
    await reload();
    onAssignmentsChanged?.();
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
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex flex-col gap-3">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Active</span>
        {active.length === 0 ? (
          <div className="bg-surface border border-border rounded-[6px] p-8 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 size={18} className="text-text-faint" />
            <span className="text-14 text-text-muted">No interventions currently assigned.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {active.map((a) => (
              <AssignmentCard key={a.id} assignment={a} onComplete={(notes) => handleComplete(a.id, notes)} />
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-12 font-mono text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={12} /> History
          </span>
          <div className="flex flex-col gap-2">
            {history.map((a) => (
              <HistoryRow key={a.id} assignment={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
