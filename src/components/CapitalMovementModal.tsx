// src/components/CapitalMovementModal.tsx
//
// Confirmation dialog for a player self-logging a Capital Deposit or
// Withdrawal against their own bankroll (see lib/bankroll.ts). Modeled on
// ReasonModal's fixed-overlay dialog pattern: a ledger write is permanent
// and append-only, so it goes through an explicit Confirm step rather than
// a single inline submit button.

import React, { useState } from 'react';
import { Wallet, X, Plus, Minus } from 'lucide-react';
import { CapitalMovementType } from '../lib/bankroll';

interface CapitalMovementModalProps {
  submitting?: boolean;
  error?: string | null;
  onConfirm: (type: CapitalMovementType, amount: number, note: string) => void;
  onCancel: () => void;
}

export default function CapitalMovementModal({ submitting, error, onConfirm, onCancel }: CapitalMovementModalProps) {
  const [movementType, setMovementType] = useState<CapitalMovementType>('DEPOSIT');
  const [amountInput, setAmountInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const parsedAmount = Number(amountInput);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleConfirm = () => {
    if (!amountValid || submitting) return;
    onConfirm(movementType, parsedAmount, noteInput.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="bg-surface border border-border rounded-[6px] w-full max-w-md flex flex-col overflow-hidden animate-fade-in">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Wallet size={16} className="text-accent-steel shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-14 font-semibold text-text-primary">Manage Capital</span>
              <span className="text-12 text-text-muted leading-relaxed">
                Record a deposit or withdrawal against your bankroll. This entry is permanent once confirmed.
              </span>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-text-faint hover:text-text-primary transition-colors cursor-pointer shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMovementType('DEPOSIT')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-12 font-medium transition-colors cursor-pointer border ${
                movementType === 'DEPOSIT'
                  ? 'bg-accent-steel border-accent-steel text-text-primary'
                  : 'bg-transparent border-border text-text-muted hover:text-text-primary'
              }`}
            >
              <Plus size={14} /> Deposit
            </button>
            <button
              type="button"
              onClick={() => setMovementType('WITHDRAWAL')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded text-12 font-medium transition-colors cursor-pointer border ${
                movementType === 'WITHDRAWAL'
                  ? 'bg-accent-steel border-accent-steel text-text-primary'
                  : 'bg-transparent border-border text-text-muted hover:text-text-primary'
              }`}
            >
              <Minus size={14} /> Withdrawal
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Amount (₹)</label>
            <input
              autoFocus
              type="number"
              min="0"
              step="1"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0"
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint font-mono w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-12 font-mono text-text-muted uppercase tracking-wider">Note (optional)</label>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="e.g. Added funds from savings"
              className="bg-ink border border-border focus:border-accent-steel focus:outline-none rounded-[6px] px-3 py-2 text-14 text-text-primary placeholder:text-text-faint w-full"
            />
          </div>

          {error && <p className="text-12 text-signal-risk">{error}</p>}
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
            onClick={handleConfirm}
            disabled={!amountValid || submitting}
            className="px-3.5 py-2 rounded bg-accent-steel text-text-primary text-12 font-semibold hover:bg-accent-steel/95 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : movementType === 'DEPOSIT' ? 'Confirm Deposit' : 'Confirm Withdrawal'}
          </button>
        </div>
      </div>
    </div>
  );
}
