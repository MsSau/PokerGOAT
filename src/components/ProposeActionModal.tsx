// src/components/ProposeActionModal.tsx
//
// Player-side counterpart to TaxonomyConfigView.tsx's "New Action" form
// (PRD §3.3): lets the player propose a custom Execution Action for their
// coach to review. Deliberately captures only Name/Dimension/Description —
// no severity, hard-gate, or detection-method fields, since the player
// cannot configure any scoring-relevant property, even on an action they
// proposed themselves.

import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Dimension } from '../lib/executionEngine';

interface ProposeActionModalProps {
  dimensionOptions: { key: Dimension; label: string }[];
  defaultDimension: Dimension;
  submitting?: boolean;
  onConfirm: (fields: { name: string; description: string | null; dimension: Dimension }) => void;
  onCancel: () => void;
}

export default function ProposeActionModal({
  dimensionOptions,
  defaultDimension,
  submitting,
  onConfirm,
  onCancel,
}: ProposeActionModalProps) {
  const [name, setName] = useState('');
  const [dimension, setDimension] = useState<Dimension>(defaultDimension);
  const [description, setDescription] = useState('');
  const nameValid = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="bg-surface border border-border rounded-[6px] w-full max-w-md flex flex-col overflow-hidden animate-fade-in">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Sparkles size={16} className="text-accent-steel shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-14 font-semibold text-text-primary">Propose a new action</span>
              <span className="text-12 text-text-muted leading-relaxed">
                Your coach reviews and sets its severity/scoring before it counts toward anything.
              </span>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-text-faint hover:text-text-primary transition-colors cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Played distracted while multitasking"
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary placeholder:text-text-faint transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Dimension</label>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as Dimension)}
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary transition-colors"
            >
              {dimensionOptions.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Description (optional)</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, so your coach has context..."
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] p-2.5 text-14 text-text-primary placeholder:text-text-faint transition-colors resize-none"
            />
          </div>
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
            onClick={() => onConfirm({ name: name.trim(), description: description.trim() || null, dimension })}
            disabled={!nameValid || submitting}
            className="px-3.5 py-2 rounded bg-accent-steel text-text-primary text-12 font-semibold hover:bg-accent-steel/90 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit for review'}
          </button>
        </div>
      </div>
    </div>
  );
}
