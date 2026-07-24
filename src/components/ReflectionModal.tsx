import React from 'react';
import { X } from 'lucide-react';

interface ReflectionModalProps {
  sessionLabel: string;
  reflectionNote: string;
  onClose: () => void;
}

// Shared by SessionLog.tsx (player) and CoachBriefView.tsx (coach) — both
// "See Reflection" links open the same read-only view of the player's raw
// post-session reflection note (verdicts.reflection_note), never the
// AI-paraphrased reflection_prose shown elsewhere on the Verdict Card.
export default function ReflectionModal({ sessionLabel, reflectionNote, onClose }: ReflectionModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-11 font-mono text-text-muted uppercase tracking-wider">Reflection</span>
            <span className="text-13 text-text-primary">{sessionLabel}</span>
          </div>
          <button type="button" onClick={onClose} className="text-text-faint hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <p className="text-14 text-text-primary leading-relaxed whitespace-pre-wrap">{reflectionNote}</p>
      </div>
    </div>
  );
}
