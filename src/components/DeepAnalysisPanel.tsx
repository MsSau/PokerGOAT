// src/components/DeepAnalysisPanel.tsx
//
// PRD §14 / §2.11 Deep Analysis: player-initiated, conversational, text +
// voice input. First-ever-open disclosure banner ("Your coach can see this
// conversation"), persisted afterward as a small composer-bar icon instead
// of repeating the banner. Context chips show what evidence is actually
// loaded — only what assembleDeepAnalysisContext really assembled, never
// implying more than is true. Voice input uses the browser's built-in
// SpeechRecognition Web API where available (no external speech backend
// exists in this codebase) and degrades to a disabled mic icon elsewhere.

import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Mic, MicOff, Eye, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  fetchOrCreateThreadForVerdict,
  fetchThreadMessages,
  sendDeepAnalysisMessage,
  assembleDeepAnalysisContext,
  DeepAnalysisMessage,
  DeepAnalysisContext,
} from '../lib/deepAnalysis';
import { VerdictDetail } from '../lib/verdicts';
import { getErrorMessage } from '../lib/utils';
import { MinimalSpeechRecognition, getSpeechRecognitionCtor } from '../lib/speechRecognition';
import { PlayerId, CoachId, DeepAnalysisThreadId } from '../types/ids';

interface Props {
  playerId: PlayerId;
  coachId: CoachId;
  verdict: VerdictDetail;
  onClose: () => void;
}

const DISCLOSURE_KEY = 'pokergoat_deep_analysis_disclosed';

function MessageBubble({ message }: { message: DeepAnalysisMessage }) {
  const isPlayer = message.senderType === 'PLAYER';
  return (
    <div className={`flex ${isPlayer ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-[8px] px-3.5 py-2.5 text-13 leading-relaxed ${
          isPlayer ? 'bg-accent-bronze/15 border border-accent-bronze/30 text-text-primary' : 'bg-surface-raised border border-border text-text-primary'
        }`}
      >
        {message.content}
        {message.createdAt && (
          <div className="text-[10px] font-mono text-text-faint mt-1">
            {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeepAnalysisPanel({ playerId, coachId, verdict, onClose }: Props) {
  const [threadId, setThreadId] = useState<DeepAnalysisThreadId | null>(null);
  const [messages, setMessages] = useState<DeepAnalysisMessage[]>([]);
  const [context, setContext] = useState<DeepAnalysisContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [listening, setListening] = useState(false);

  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechSupported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(DISCLOSURE_KEY)) {
      setShowDisclosure(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const id = await fetchOrCreateThreadForVerdict(playerId, coachId, verdict.id);
        const [msgs, ctx] = await Promise.all([fetchThreadMessages(id), assembleDeepAnalysisContext(playerId, verdict)]);
        if (!alive) return;
        setThreadId(id);
        setMessages(msgs);
        setContext(ctx);
      } catch (err) {
        if (alive) setLoadError(getErrorMessage(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, coachId, verdict.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function dismissDisclosure() {
    window.localStorage.setItem(DISCLOSURE_KEY, 'true');
    setShowDisclosure(false);
  }

  function toggleVoice() {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[event.resultIndex]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function handleSend() {
    const content = input.trim();
    if (!content || !threadId || !context || sending) return;
    setSending(true);
    setSendError(null);
    setInput('');
    const priorHistory = messages;
    // Optimistic append so the player's own line shows immediately.
    const optimistic: DeepAnalysisMessage = { id: `pending-${Date.now()}`, threadId, senderType: 'PLAYER', content, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const result = await sendDeepAnalysisMessage(threadId, priorHistory, content, context);
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutOptimistic, result.playerMessage, ...(result.aiMessage ? [result.aiMessage] : [])];
      });
      if (result.aiError) setSendError(result.aiError);
    } catch (err) {
      setSendError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm flex justify-end" role="dialog" aria-modal="true">
      <div className="w-full max-w-md h-full bg-surface border-l border-border flex flex-col animate-fade-in">
        {/* Header */}
        <div className="h-16 border-b border-border px-5 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <span className="text-14 font-semibold text-text-primary">Deep Analysis</span>
            <span className="text-11 text-text-faint truncate max-w-[280px]">{verdict.headline}</span>
          </div>
          <div className="flex items-center gap-3">
            <span title="Your coach can see this conversation." className="text-text-faint">
              <Eye size={15} />
            </span>
            <button type="button" onClick={onClose} className="text-text-faint hover:text-text-primary transition-colors cursor-pointer">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Context chips */}
        {context && (
          <div className="px-5 py-3 border-b border-border flex items-center gap-1.5 flex-wrap shrink-0">
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-accent-steel/30 bg-accent-steel/10 text-accent-steel">
              Verdict
            </span>
            {(context.behavioralSummary?.length ?? 0) > 0 && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-signal-process/30 bg-signal-process/10 text-signal-process">
                Behavioral Profile
              </span>
            )}
            {context.coachDirective && (
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border border-signal-caution/30 bg-signal-caution/10 text-signal-caution">
                Coach Directive
              </span>
            )}
          </div>
        )}

        {/* Disclosure banner — first ever open only */}
        {showDisclosure && (
          <div className="mx-5 mt-3 bg-signal-caution/10 border border-signal-caution/30 rounded-[6px] p-3 flex items-start justify-between gap-3 shrink-0">
            <p className="text-12 text-text-primary leading-relaxed">Your coach can see this conversation.</p>
            <button type="button" onClick={dismissDisclosure} className="text-11 text-text-muted hover:text-text-primary cursor-pointer shrink-0">
              Got it
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {loadError && (
            <div className="bg-surface-raised border border-signal-risk/30 rounded-[6px] p-3 text-12 text-signal-risk">{loadError}</div>
          )}
          {!loading && !loadError && messages.length === 0 && (
            <span className="text-13 text-text-faint italic text-center mt-8">
              Ask about this Verdict, your Behavioral Profile trend, or what to change next session.
            </span>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-surface-raised border border-border rounded-[8px] px-3.5 py-2.5">
                <span className="w-3.5 h-3.5 border-2 border-text-faint border-t-transparent rounded-full animate-spin inline-block" />
              </div>
            </div>
          )}
        </div>

        {sendError && (
          <div className="mx-5 mb-2 flex items-center gap-2 text-11 text-signal-risk">
            <AlertTriangle size={12} className="shrink-0" />
            <span>{sendError}</span>
            <button type="button" onClick={() => setInput((i) => i || '')} className="ml-auto flex items-center gap-1 hover:underline cursor-pointer">
              <RotateCcw size={11} /> Retry by resending
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-border p-3 flex items-end gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleVoice}
            disabled={!speechSupported}
            title={speechSupported ? (listening ? 'Stop voice input' : 'Voice input') : 'Voice input not supported in this browser'}
            className={`p-2.5 rounded-[6px] border shrink-0 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              listening ? 'border-signal-risk/40 bg-signal-risk/10 text-signal-risk' : 'border-border text-text-muted hover:text-text-primary'
            }`}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            disabled={loading || sending || !threadId}
            className="flex-1 bg-ink border border-border focus:border-accent-bronze focus:outline-none rounded-[6px] px-3 py-2.5 text-13 text-text-primary placeholder:text-text-faint transition-colors resize-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || sending || loading || !threadId}
            className="p-2.5 rounded-[6px] bg-accent-bronze text-text-primary shrink-0 hover:bg-accent-bronze/95 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
