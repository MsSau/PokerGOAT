// src/components/CoachDeepAnalysisViewer.tsx
//
// Read-only coach-side counterpart to DeepAnalysisPanel.tsx. The player's
// "Your coach can see this conversation" disclosure (PRD §14) was true at
// the RLS/data layer (deep_analysis_threads/messages already grant the
// coach SELECT) but had no actual UI path — this closes that gap. Reuses
// MessageBubble from DeepAnalysisPanel so formatting stays identical to what
// the player sees; everything else here is deliberately thinner than that
// panel — no composer, no voice input, no disclosure banner, since a coach
// can only ever read, never post into, a player's thread.

import React, { useEffect, useState } from 'react';
import { X, MessageSquareOff } from 'lucide-react';
import { fetchThreadForVerdict, fetchThreadMessages, DeepAnalysisMessage } from '../lib/deepAnalysis';
import { getErrorMessage } from '../lib/utils';
import { MessageBubble } from './DeepAnalysisPanel';
import { PlayerId, VerdictId } from '../types/ids';

interface Props {
  playerId: PlayerId;
  verdictId: VerdictId;
  verdictHeadline: string;
  onClose: () => void;
}

export default function CoachDeepAnalysisViewer({ playerId, verdictId, verdictHeadline, onClose }: Props) {
  const [messages, setMessages] = useState<DeepAnalysisMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const threadId = await fetchThreadForVerdict(playerId, verdictId);
        const msgs = threadId ? await fetchThreadMessages(threadId) : [];
        if (alive) setMessages(msgs);
      } catch (err) {
        if (alive) setError(getErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [playerId, verdictId]);

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex justify-end" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl h-full bg-surface border-l border-border flex flex-col animate-fade-in">
        {/* Header */}
        <div className="h-16 border-b border-border px-5 flex items-center justify-between shrink-0">
          <div className="flex flex-col min-w-0">
            <span className="text-14 font-semibold text-text-primary">Deep Analysis Conversation</span>
            <span className="text-11 text-text-faint truncate max-w-[400px]">{verdictHeadline}</span>
          </div>
          <button type="button" onClick={onClose} className="text-text-faint hover:text-text-primary transition-colors cursor-pointer shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Messages — read-only */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{error}</div>}
          {!loading && !error && messages?.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <MessageSquareOff size={20} className="text-text-faint" />
              <span className="text-13 text-text-faint italic">This player hasn't opened Deep Analysis for this Verdict.</span>
            </div>
          )}
          {messages?.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
