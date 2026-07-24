// src/components/ReasonModal.tsx
//
// Generic mandatory-reason modal for coach configuration screens (PRD
// §3.3): "Every edit to a record with historical dependents triggers a
// mandatory-reason modal before save ... one component, reused everywhere,
// not bespoke per module." Used by FrameworkConfigView and BRMConfigView
// today; any future config screen (taxonomy, escalation, interventions)
// should reuse this rather than rolling its own.

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ReasonModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  submitting?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const MIN_REASON_LENGTH = 10;

export default function ReasonModal({ title, description, confirmLabel = 'Confirm & Save', submitting, onConfirm, onCancel }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const tooShort = reason.trim().length < MIN_REASON_LENGTH;

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="bg-surface border border-border rounded-[6px] w-full max-w-md flex flex-col overflow-hidden animate-fade-in">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={16} className="text-signal-caution shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-14 font-semibold text-text-primary">{title}</span>
              <span className="text-12 text-text-muted leading-relaxed">{description}</span>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-text-faint hover:text-text-primary transition-colors cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-2">
          <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Reason for this change</label>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this modification is necessary..."
            className="bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] p-3 text-14 text-text-primary placeholder:text-text-faint transition-colors resize-none"
          />
          <span className="text-11 text-text-faint">
            This reason, the old value, and the new value are stored permanently as an audit record.
          </span>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3.5 py-2 rounded text-12 font-medium text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={tooShort || submitting}
            className="px-3.5 py-2 rounded bg-accent-bronze text-text-primary text-12 font-semibold hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
