import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, ChevronRight, Mic, Type } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchSessionTournaments, TournamentRow } from '../lib/tournaments';
import { endSession, EndSessionResult, TournamentFinish, MistakeTagInput } from '../lib/endSession';

interface Props {
  sessionId: string;
  playerId: string;
  onComplete: (result: EndSessionResult) => void;
}

type Step = 'confirm-entries' | 'finalize' | 'mistakes' | 'reflection' | 'submitting' | 'done';

interface CanonicalAction { id: string; name: string; description: string | null; dimension: string; }

const DIMENSION_TABS = [
  { key: 'DISCIPLINE_PROCESS', label: 'Discipline/Process' },
  { key: 'TECHNICAL_PLAY', label: 'Technical' },
  { key: 'MENTAL_GAME', label: 'Mental' },
  { key: 'LEARNING_IMPROVEMENT', label: 'Learning' },
];

export default function SessionReview({ sessionId, playerId, onComplete }: Props) {
  const [step, setStep] = useState<Step>('confirm-entries');
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishes, setFinishes] = useState<Record<string, Partial<TournamentFinish>>>({});
  const [actions, setActions] = useState<CanonicalAction[]>([]);
  const [activeTab, setActiveTab] = useState(DIMENSION_TABS[0].key);
  const [selectedTags, setSelectedTags] = useState<Record<string, { actionId: string; tournamentId?: string }>>({});
  const [reflection, setReflection] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [result, setResult] = useState<EndSessionResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTournaments(await fetchSessionTournaments(sessionId));
      const { data, error: aErr } = await supabase
        .from('execution_actions')
        .select('id, name, description, dimension, taxonomy_versions!inner(is_activated)')
        .eq('status', 'CANONICAL_ACTIVE')
        .eq('taxonomy_versions.is_activated', true);
      if (aErr) throw aErr;
      setActions((data || []) as CanonicalAction[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const unfinalized = useMemo(() => tournaments.filter((t) => t.net_return === null), [tournaments]);

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
        tournamentId: t.id,
        winningsGross: Number(finishes[t.id]?.winningsGross ?? 0),
        bestRank: finishes[t.id]?.bestRank,
        worstRank: finishes[t.id]?.worstRank,
        itmYn: !!finishes[t.id]?.itmYn,
        finalTableYn: !!finishes[t.id]?.finalTableYn,
      }));
      const mistakeTags: MistakeTagInput[] = Object.values(selectedTags).map((v) => ({ executionActionId: v.actionId }));
      const res = await endSession({ sessionId, playerId, tournamentFinishes, mistakeTags, reflectionNote: reflection });
      setResult(res);
      setStep('done');
      onComplete(res);
    } catch (e: any) {
      setError(e.message);
      setStep('reflection');
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
          <button type="button" onClick={() => setStep(unfinalized.length ? 'finalize' : 'mistakes')}
            className="self-end h-10 px-5 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1">
            Confirmed <ChevronRight size={14} />
          </button>
        </div>
      )}

      {step === 'finalize' && (
        <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-5">
          <span className="text-14 font-medium text-text-primary">Finalize remaining tournaments.</span>
          {unfinalized.map((t) => (
            <div key={t.id} className="border border-border rounded-[4px] p-4 flex flex-col gap-3">
              <span className="text-13 font-semibold text-text-primary">{t.name}</span>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1"><span className="text-11 font-mono text-text-muted uppercase">Gross Winnings (₹)</span>
                  <input type="number" className="input" onChange={(e) => updateFinish(t.id, { winningsGross: Number(e.target.value) })} /></label>
                <label className="flex flex-col gap-1"><span className="text-11 font-mono text-text-muted uppercase">Best Rank</span>
                  <input type="number" className="input" onChange={(e) => updateFinish(t.id, { bestRank: Number(e.target.value) })} /></label>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-13 text-text-primary">
                  <input type="checkbox" onChange={(e) => updateFinish(t.id, { itmYn: e.target.checked })} /> ITM</label>
                <label className="flex items-center gap-2 text-13 text-text-primary">
                  <input type="checkbox" onChange={(e) => updateFinish(t.id, { finalTableYn: e.target.checked })} /> Final Table</label>
              </div>
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
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
            {actions.filter((a) => a.dimension === activeTab).map((a) => (
              <label key={a.id} className="flex items-start gap-3 p-2.5 rounded-[4px] hover:bg-surface-raised/40 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={!!selectedTags[a.id]} onChange={() => toggleTag(a.id)} />
                <div className="flex flex-col">
                  <span className="text-13 text-text-primary">{a.name}</span>
                  {a.description && <span className="text-11 text-text-muted">{a.description}</span>}
                </div>
              </label>
            ))}
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
          <div className="flex gap-2">
            <button type="button" onClick={() => setVoiceMode(false)} className={`text-12 px-2 py-1 rounded flex items-center gap-1 ${!voiceMode ? 'text-accent-steel' : 'text-text-muted'}`}><Type size={12} /> Text</button>
            <button type="button" onClick={() => setVoiceMode(true)} className={`text-12 px-2 py-1 rounded flex items-center gap-1 ${voiceMode ? 'text-accent-steel' : 'text-text-muted'}`}><Mic size={12} /> Voice</button>
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
            <span className="font-display text-28 text-accent-bronze">{result.outcomeMedal}</span>
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