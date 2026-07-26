import React, { useState, useMemo, useRef } from 'react';
import { CheckCircle2, ChevronRight, Mic, MicOff, Type } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSessionTournaments, TournamentRow } from '../lib/tournaments';
import { endSession, EndSessionResult, TournamentFinish, MistakeTagInput } from '../lib/endSession';
import { useAsync } from '../lib/useAsync';
import { getErrorMessage, medalColorClass } from '../lib/utils';
import { MinimalSpeechRecognition, getSpeechRecognitionCtor } from '../lib/speechRecognition';
import { SessionId, PlayerId, asTournamentId, asExecutionActionId } from '../types/ids';

interface Props {
  sessionId: SessionId;
  playerId: PlayerId;
  onComplete: (result: EndSessionResult) => void;
  onGoBackToEdit: () => Promise<void>;
}

type Step = 'confirm-entries' | 'finalize' | 'mistakes' | 'reflection' | 'submitting' | 'done';

interface CanonicalAction { id: string; name: string; description: string | null; dimension: string; detection_method: string | null; }

// Actions the system already detects on its own (TournamentLog's compliance
// flag detection — see tournaments.ts's flagOccurrences) must never appear
// as a manually-tappable mistake here, regardless of whether one actually
// fired this session — offering them invites double-tagging the same
// occurrence, and the whole point of "System-detected"/"System-derived" in
// the coach's taxonomy (TaxonomyConfigView.tsx's Detection Method field) is
// that the player never has to self-report them.
//
// Live data carries this in two different formats — 'SYSTEM_DETECTED'
// (upper-snake-case, older/seeded rows) alongside 'System-detected'
// (hyphenated, entered via TaxonomyConfigView.tsx's dropdown) — so this
// compares a normalized (uppercased, punctuation-stripped) form rather than
// an exact string, and catches both without needing a data migration.
function isSystemOnlyDetection(method: string | null): boolean {
  if (!method) return false;
  return method.toUpperCase().replace(/[^A-Z]/g, '').startsWith('SYSTEM');
}

const DIMENSION_TABS = [
  { key: 'DISCIPLINE_PROCESS', label: 'Discipline/Process' },
  { key: 'TECHNICAL_PLAY', label: 'Technical' },
  { key: 'MENTAL_GAME', label: 'Mental' },
  { key: 'LEARNING_IMPROVEMENT', label: 'Learning' },
];

export default function SessionReview({ sessionId, playerId, onComplete, onGoBackToEdit }: Props) {
  const [step, setStep] = useState<Step>('confirm-entries');
  const [finishes, setFinishes] = useState<Record<string, Partial<TournamentFinish>>>({});
  const [activeTab, setActiveTab] = useState(DIMENSION_TABS[0].key);
  const [selectedTags, setSelectedTags] = useState<Record<string, { actionId: string; tournamentId?: string }>>({});
  const [bustedIds, setBustedIds] = useState<Set<string>>(new Set());
  const [reflection, setReflection] = useState('');
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<EndSessionResult | null>(null);
  const [goingBack, setGoingBack] = useState(false);

  const recognitionRef = useRef<MinimalSpeechRecognition | null>(null);
  const speechSupported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor();

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
      if (transcript) setReflection((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  const { data, loading, error, setError } = useAsync(async () => {
    const tournaments = await fetchSessionTournaments(sessionId);
    const { data, error: aErr } = await supabase
      .from('execution_actions')
      .select('id, name, description, dimension, detection_method, taxonomy_versions!inner(is_activated)')
      .eq('status', 'CANONICAL_ACTIVE')
      .eq('taxonomy_versions.is_activated', true);
    if (aErr) throw aErr;

    return { tournaments, actions: (data || []) as CanonicalAction[] };
  }, [sessionId]);
  const tournaments = data?.tournaments ?? [];
  const actions = data?.actions ?? [];
  const taggableActions = useMemo(
    () => actions.filter((a) => !isSystemOnlyDetection(a.detection_method)),
    [actions]
  );

  // A tournament that was authorized via the Session Contract but never
  // actually bought into (0 entries) isn't "unfinalized" — there's no result
  // to ask for. Only tournaments with a real buy-in logged need finalizing.
  const unfinalized = useMemo(
    () => tournaments.filter((t) => t.net_return === null && (t.tournament_entries?.length ?? 0) > 0),
    [tournaments]
  );

  const updateFinish = (tid: string, patch: Partial<TournamentFinish>) =>
    setFinishes((prev) => ({ ...prev, [tid]: { ...prev[tid], ...patch } }));

  const toggleTag = (actionId: string) => {
    setSelectedTags((prev) => {
      const next = { ...prev };
      if (next[actionId]) delete next[actionId];
      else next[actionId] = { actionId };
      return next;
    });
  };

  const handleSubmit = async () => {
    setStep('submitting');
    setError(null);
    try {
      const tournamentFinishes: TournamentFinish[] = unfinalized.map((t) => ({
        tournamentId: asTournamentId(t.id),
        winningsGross: Number(finishes[t.id]?.winningsGross ?? 0),
        bestRank: finishes[t.id]?.bestRank,
        worstRank: finishes[t.id]?.worstRank,
        itmYn: !!finishes[t.id]?.itmYn,
        finalTableYn: !!finishes[t.id]?.finalTableYn,
        comments: finishes[t.id]?.comments,
      }));
      const mistakeTags: MistakeTagInput[] = Object.values(selectedTags).map((v) => ({ executionActionId: asExecutionActionId(v.actionId) }));
      const res = await endSession({ sessionId, playerId, tournamentFinishes, mistakeTags, reflectionNote: reflection });
      setResult(res);
      setStep('done');
      onComplete(res);
    } catch (e) {
      setError(getErrorMessage(e));
      setStep('reflection');
    }
  };

  // Backs out of review entirely — resumes the ACTIVE session so
  // TournamentLog reappears and the player can fix/add entries. Only
  // offered from the very first step, before anything else in this review
  // has been touched.
  const handleGoBack = async () => {
    setGoingBack(true);
    setError(null);
    try {
      await onGoBackToEdit();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setGoingBack(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
      <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <div className="text-12 text-signal-risk bg-signal-risk/10 border border-signal-risk/25 rounded-[4px] p-3">{error}</div>}

      {/* Thin progress bar — never a percentage/count, per §7 tone guidance */}
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent-steel transition-all" style={{
          width: step === 'confirm-entries' ? '20%' : step === 'finalize' ? '45%' : step === 'mistakes' ? '70%' : step === 'reflection' ? '90%' : '100%',
        }} />
      </div>

      {step === 'confirm-entries' && (
        <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
          <span className="text-14 font-medium text-text-primary">Confirm all entries are logged.</span>
          <div className="flex flex-col gap-2">
            {tournaments.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-13 bg-surface-raised/40 rounded-[4px] px-3 py-2">
                <span className="text-text-primary">{t.name}</span>
                <span className="font-mono text-text-muted">{t.tournament_entries?.length ?? 0} entries</span>
              </div>
            ))}
            {tournaments.length === 0 && <span className="text-12 text-text-faint">No tournaments logged this session.</span>}
          </div>
          <div className="self-end flex items-center gap-3">
            <button type="button" onClick={handleGoBack} disabled={goingBack}
              className="h-10 px-4 border border-border rounded-[4px] text-13 text-text-muted hover:text-text-primary hover:border-text-faint transition-colors disabled:opacity-50">
              {goingBack ? 'Returning…' : 'Edit Entries'}
            </button>
            <button type="button" onClick={() => setStep(unfinalized.length ? 'finalize' : 'mistakes')} disabled={goingBack}
              className="h-10 px-5 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1 disabled:opacity-50">
              Confirmed <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 'finalize' && (
        <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-5">
          <span className="text-14 font-medium text-text-primary">Finalize remaining tournaments.</span>
          {unfinalized.map((t) => (
            <div key={t.id} className="border border-border rounded-[4px] p-4 flex flex-col gap-3">
              <span className="text-13 font-semibold text-text-primary">{t.name}</span>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-11 font-mono text-text-muted uppercase">Gross Winnings (₹)</span>
                  <div className="flex items-center gap-3">
                    <input type="number" className="input flex-1" onChange={(e) => updateFinish(t.id, { winningsGross: Number(e.target.value) })} />
                    <label className="flex items-center gap-1.5 text-12 text-text-primary cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={bustedIds.has(t.id)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setBustedIds((prev) => {
                            const next = new Set(prev);
                            checked ? next.add(t.id) : next.delete(t.id);
                            return next;
                          });
                          if (checked) updateFinish(t.id, { itmYn: false, finalTableYn: false }); // can't have either — busting excludes ITM and the final table
                        }}
                      />
                      Busted
                    </label>
                  </div>
                </label>
                <label className="flex flex-col gap-1"><span className="text-11 font-mono text-text-muted uppercase">Best Rank</span>
                  <input type="number" className="input" onChange={(e) => updateFinish(t.id, { bestRank: Number(e.target.value) })} /></label>
              </div>
              <div className="flex gap-4">
                <label className={`flex items-center gap-2 text-13 ${bustedIds.has(t.id) ? 'text-text-faint cursor-not-allowed' : 'text-text-primary'}`}>
                  <input
                    type="checkbox"
                    checked={!!finishes[t.id]?.itmYn}
                    disabled={bustedIds.has(t.id)}
                    onChange={(e) => updateFinish(t.id, { itmYn: e.target.checked })}
                  /> ITM</label>
                <label className={`flex items-center gap-2 text-13 ${bustedIds.has(t.id) ? 'text-text-faint cursor-not-allowed' : 'text-text-primary'}`}>
                  <input
                    type="checkbox"
                    checked={!!finishes[t.id]?.finalTableYn}
                    disabled={bustedIds.has(t.id)}
                    onChange={(e) => updateFinish(t.id, { finalTableYn: e.target.checked })}
                  /> Final Table</label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-11 font-mono text-text-muted uppercase">What happened? (optional)</span>
                <textarea rows={2} className="input" onChange={(e) => updateFinish(t.id, { comments: e.target.value })} />
              </label>
            </div>
          ))}
          <button type="button" onClick={() => setStep('mistakes')}
            className="self-end h-10 px-5 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1">
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {step === 'mistakes' && (
        <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
          <span className="text-14 font-medium text-text-primary">Tag mistakes from the canonical taxonomy.</span>
          <div className="flex gap-2 border-b border-border pb-2">
            {DIMENSION_TABS.map((tab) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                className={`text-12 px-3 py-1.5 rounded-[4px] ${activeTab === tab.key ? 'bg-accent-steel/15 text-accent-steel' : 'text-text-muted'}`}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
            {taggableActions.filter((a) => a.dimension === activeTab).map((a) => {
              const selected = !!selectedTags[a.id];
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleTag(a.id)}
                  title={a.description ?? undefined}
                  className={`flex items-center justify-between gap-2 p-3 rounded-[6px] border text-left transition-colors cursor-pointer ${
                    selected ? 'border-accent-steel bg-accent-steel/10' : 'border-border hover:border-text-faint hover:bg-surface-raised/40'
                  }`}
                >
                  <span className="text-13 font-medium text-text-primary">{a.name}</span>
                  {selected && <CheckCircle2 size={14} className="text-accent-steel shrink-0" />}
                </button>
              );
            })}
          </div>
          <span className="text-12 text-text-muted">{Object.keys(selectedTags).length} selected</span>
          <button type="button" onClick={() => setStep('reflection')}
            className="self-end h-10 px-5 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1">
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {step === 'reflection' && (
        <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-4">
          <span className="text-14 font-medium text-text-primary">Be specific. This is for you as much as your coach.</span>
          <div className="flex items-center gap-2">
            <span className="text-12 px-2 py-1 rounded flex items-center gap-1 text-text-muted"><Type size={12} /> Text</span>
            <button
              type="button"
              onClick={toggleVoice}
              disabled={!speechSupported}
              title={speechSupported ? (listening ? 'Stop voice input' : 'Voice input') : 'Voice input not supported in this browser'}
              className={`text-12 px-2 py-1 rounded flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed ${
                listening ? 'text-signal-risk' : 'text-text-muted hover:text-accent-steel'
              }`}
            >
              {listening ? <MicOff size={12} /> : <Mic size={12} />} {listening ? 'Listening…' : 'Voice'}
            </button>
          </div>
          <textarea rows={6} value={reflection} onChange={(e) => setReflection(e.target.value)} className="input" placeholder="What happened, and why?" />
          <button type="button" onClick={handleSubmit}
            className="self-end h-10 px-5 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1">
            Submit Review <CheckCircle2 size={14} />
          </button>
        </div>
      )}

      {step === 'submitting' && (
        <div className="flex items-center justify-center py-12 bg-surface rounded-[6px] border border-border">
          <span className="w-6 h-6 border-2 border-accent-steel border-t-transparent rounded-full animate-spin" />
          <span className="text-12 font-mono text-text-muted ml-3">Computing Execution Profile, Outcome, and Verdict…</span>
        </div>
      )}

      {step === 'done' && result && (
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-3">
            <span className="text-12 font-mono text-text-muted uppercase">Execution Profile</span>
            {result.dimensionResults.map((d) => (
              <div key={d.dimension} className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-14 text-text-primary">{d.dimension.replace(/_/g, ' ')}</span>
                <span className={`text-14 font-medium ${d.rating === 'Critical' ? 'text-signal-risk' : d.rating === 'Weak' ? 'text-signal-caution' : 'text-text-primary'}`}>{d.rating}</span>
              </div>
            ))}
          </div>
          <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-2">
            <span className="text-11 text-text-muted uppercase tracking-wide">Results — measures outcome only, not skill</span>
            <span className={`font-display text-28 ${medalColorClass(result.outcomeMedal)}`}>{result.outcomeMedal}</span>
          </div>
          <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-2">
            <span className="text-12 font-mono text-text-muted uppercase">Verdict</span>
            <span className="font-display text-28 text-text-primary">{result.verdictHeadline}</span>
          </div>
        </div>
      )}
    </div>
  );
}