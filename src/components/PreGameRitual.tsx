import React, { useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { fetchCurrentPokerWeek, fetchLockedWeeklyGamePlan } from '../lib/sessionContract';
import { useAsync } from '../lib/useAsync';
import { formatCurrency } from '../lib/utils';
import { PlayerId } from '../types/ids';

type Step =
  | 'entry'
  | 'intent'
  | 'stop-line'
  | 'focus'
  | 'energy'
  | 'urge'
  | 'identity'
  | 'brm-pressure'
  | 'process'
  | 'ego'
  | 'pledge'
  | 'close';

const NUMBERED_STEPS: Step[] = [
  'intent',
  'stop-line',
  'focus',
  'energy',
  'urge',
  'identity',
  'brm-pressure',
  'process',
  'ego',
  'pledge',
];

const URGE_MOVES = ['Take the timer break', 'Stop at my line, no negotiation', 'Message my coach', 'Step away from the table for 5 minutes'];
const BRM_PRESSURE_MOVES = ['Close the app', 'Call my coach', 'Walk away from the table', 'Re-read my Stop line'];
const ENERGY_TAGS = ['Tired', 'Distracted', 'Anxious', 'Low motivation'];

const DEFAULT_PLEDGE =
  "I show up tonight to execute, not to chase. My intent is set. My stop is decided before I see a single card. I expect the urges — tilt, greed, fear, boredom — I don't pretend they won't come. I already know my move when they do. I don't break BRM, because breaking BRM isn't who I'm building myself to be. Win or lose tonight, the process is the standard I'm judged by. That's the champion in me. That's the beast in me. Amen.";

const PLEDGE_HOLD_MS = 1500;

export interface RitualFreeText {
  intent: string;
  identityLine: string;
  processDefinition: string;
}

interface PreGameRitualProps {
  userId: PlayerId;
  sleepHours: number | null;
  meditationMinutes: number | null;
  defaultStopLoss: number;
  onComplete: (ritualText: RitualFreeText) => void;
  onExit: () => void;
}

// PRD §7 "Pre-Game Ritual ('Get into the mindset') — optional". Every
// screen's copy below is taken verbatim from the PRD. Most of the chip/
// numeric answers collected here (stop-line, energy tags, urge move, BRM
// pressure move, ego check) still have no backing column and stay
// genuinely ephemeral, in local state only — this remains an in-the-moment
// precommitment exercise, not a data-collection form. The three free-text
// prompts (Intent, Identity line, Process definition) are the exception:
// they're reported back to the caller on completion and persisted onto the
// same preparation_records row (`ritual_intent`/`ritual_identity_line`/
// `ritual_process_definition`) so they can feed the Verdict Card's
// AI Reflection section — a deliberate product decision to make these
// three specific answers visible to the coach, unlike the rest of the
// ritual.
export default function PreGameRitual({
  userId,
  sleepHours,
  meditationMinutes,
  defaultStopLoss,
  onComplete,
  onExit,
}: PreGameRitualProps) {
  const [step, setStep] = useState<Step>('entry');
  const [intent, setIntent] = useState('');
  const [stopWin, setStopWin] = useState('');
  const [stopLoss, setStopLoss] = useState(String(defaultStopLoss || ''));
  const [energyFeelsRight, setEnergyFeelsRight] = useState<boolean | null>(null);
  const [energyTags, setEnergyTags] = useState<Set<string>>(new Set());
  const [urgeMove, setUrgeMove] = useState<string | null>(null);
  const [identityLine, setIdentityLine] = useState('');
  const [brmMove, setBrmMove] = useState<string | null>(null);
  const [processDefinition, setProcessDefinition] = useState('');
  const [egoCheck, setEgoCheck] = useState<'PROVING' | 'PLAYING' | null>(null);
  const [pledgeText] = useState(DEFAULT_PLEDGE);
  const [holding, setHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  // Weekly Intention/Focus reminder — replaces the old "Locked in?"
  // tournament-chip step (which read the Session Contract's status, but the
  // contract is still VALIDATED, not LOCKED, at this point in the flow —
  // §5's sequence is Prep Check-in -> Ritual -> Medal -> Start Session,
  // i.e. before the contract locks — so that step never actually had
  // anything to show). This reads straight off the locked Weekly Game Plan
  // instead, which exists well before ritual time.
  const { data: weeklyPlanSummary, loading: loadingWeeklyPlan } = useAsync(async () => {
    const week = await fetchCurrentPokerWeek(userId);
    if (!week) return null;
    const wgp = await fetchLockedWeeklyGamePlan(userId, week.id);
    if (!wgp) return null;
    return { intention: wgp.plan.weekly_intention, focus: wgp.plan.weekly_focus };
  }, [userId]);

  const stepIndex = NUMBERED_STEPS.indexOf(step);
  const progressPct = stepIndex >= 0 ? ((stepIndex + 1) / NUMBERED_STEPS.length) * 100 : 0;

  const goNext = (next: Step) => setStep(next);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHold = () => {
    setHolding(true);
    setHoldProgress(0);
    const startedAt = Date.now();
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress(Math.min(100, ((Date.now() - startedAt) / PLEDGE_HOLD_MS) * 100));
    }, 30);
    holdTimerRef.current = setTimeout(() => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
      setHolding(false);
      setHoldProgress(100);
      goNext('close');
    }, PLEDGE_HOLD_MS);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    setHolding(false);
    setHoldProgress(0);
  };

  const toggleEnergyTag = (tag: string) => {
    setEnergyTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-ink flex flex-col">
      <div className="h-16 flex items-center justify-between px-6 shrink-0">
        <div className="h-1 flex-1 bg-border rounded-full overflow-hidden mr-4">
          {stepIndex >= 0 && (
            <div className="h-full bg-accent-steel transition-all duration-300" style={{ width: `${progressPct}%` }} />
          )}
        </div>
        <button type="button" onClick={onExit} className="text-text-faint hover:text-text-primary shrink-0">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-8 pb-16">
        <div className="w-full max-w-md flex flex-col gap-6 animate-fade-in">
          {step === 'entry' && (
            <div className="flex flex-col items-center text-center gap-6">
              <h2 className="font-display text-28 text-text-primary">Pre-Game Ritual.</h2>
              <p className="text-16 text-text-muted">Thirty seconds. Then you play.</p>
              <button
                type="button"
                onClick={() => goNext('intent')}
                className="h-11 px-6 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1.5"
              >
                Begin <ChevronRight size={14} />
              </button>
            </div>
          )}

          {step === 'intent' && (
            <RitualCard question="What's your intent tonight?" onNext={() => goNext('stop-line')}>
              <input
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Play my A-game."
                className="input w-full text-center text-16"
                autoFocus
              />
            </RitualCard>
          )}

          {step === 'stop-line' && (
            <RitualCard question="Where do you stop — win or lose?" onNext={() => goNext('focus')}>
              <div className="flex gap-3">
                <label className="flex-1 flex flex-col gap-1.5">
                  <span className="text-11 font-mono text-text-muted uppercase text-center">Stop-Win ₹</span>
                  <input
                    type="number"
                    value={stopWin}
                    onChange={(e) => setStopWin(e.target.value)}
                    className="input text-center"
                  />
                </label>
                <label className="flex-1 flex flex-col gap-1.5">
                  <span className="text-11 font-mono text-text-muted uppercase text-center">Stop-Loss ₹</span>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    className="input text-center"
                  />
                </label>
              </div>
              <p className="text-11 text-text-faint text-center mt-2">
                You can play tighter than your BRM limit ({formatCurrency(defaultStopLoss)}). Never looser.
              </p>
            </RitualCard>
          )}

          {step === 'focus' && (
            <RitualCard question="This week's standard." onNext={() => goNext('energy')}>
              {loadingWeeklyPlan ? (
                <span className="text-13 text-text-faint text-center block">Loading your Weekly Game Plan…</span>
              ) : weeklyPlanSummary?.intention || weeklyPlanSummary?.focus ? (
                <div className="flex flex-col gap-4 items-center">
                  {weeklyPlanSummary.intention && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-11 font-mono text-text-muted uppercase tracking-wider">Weekly Intention</span>
                      <span className="text-16 text-text-primary text-center">{weeklyPlanSummary.intention}</span>
                    </div>
                  )}
                  {weeklyPlanSummary.focus && (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-11 font-mono text-text-muted uppercase tracking-wider">Weekly Focus</span>
                      <span className="text-16 text-text-primary text-center">{weeklyPlanSummary.focus}</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-13 text-text-faint text-center block">No weekly intention or focus set for this week.</span>
              )}
            </RitualCard>
          )}

          {step === 'energy' && (
            <RitualCard question="Energy check." onNext={() => goNext('urge')}>
              <div className="bg-surface-raised/40 border border-border rounded-[4px] p-4 flex justify-around text-center mb-4">
                <div className="flex flex-col">
                  <span className="text-11 font-mono text-text-muted uppercase">Sleep</span>
                  <span className="text-16 text-text-primary">{sleepHours ?? '—'}h</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-11 font-mono text-text-muted uppercase">Meditation</span>
                  <span className="text-16 text-text-primary">{meditationMinutes ?? '—'}m</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEnergyFeelsRight(true)}
                  className={`flex-1 h-10 rounded-[4px] text-13 font-medium border ${
                    energyFeelsRight === true ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                  }`}
                >
                  Feels right
                </button>
                <button
                  type="button"
                  onClick={() => setEnergyFeelsRight(false)}
                  className={`flex-1 h-10 rounded-[4px] text-13 font-medium border ${
                    energyFeelsRight === false ? 'border-signal-caution bg-signal-caution/10 text-text-primary' : 'border-border text-text-muted'
                  }`}
                >
                  Something's off
                </button>
              </div>
              {energyFeelsRight === false && (
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {ENERGY_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleEnergyTag(tag)}
                      className={`text-12 px-3 py-1.5 rounded-full border ${
                        energyTags.has(tag) ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </RitualCard>
          )}

          {step === 'urge' && (
            <RitualCard question="If tilt, greed, fear, or boredom shows up tonight — what's your move?" onNext={() => goNext('identity')}>
              <div className="flex flex-col gap-2">
                {URGE_MOVES.map((move) => (
                  <button
                    key={move}
                    type="button"
                    onClick={() => setUrgeMove(move)}
                    className={`h-11 rounded-[4px] text-13 font-medium border px-4 text-left ${
                      urgeMove === move ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                    }`}
                  >
                    {move}
                  </button>
                ))}
              </div>
            </RitualCard>
          )}

          {step === 'identity' && (
            <RitualCard question="Finish it: 'Tonight I am a player who ___'" onNext={() => goNext('brm-pressure')}>
              <input
                value={identityLine}
                onChange={(e) => setIdentityLine(e.target.value)}
                placeholder="...trusts the process."
                className="input w-full text-center text-16"
                autoFocus
              />
            </RitualCard>
          )}

          {step === 'brm-pressure' && (
            <RitualCard question="If the pull to break BRM shows up — what's your exact move?" onNext={() => goNext('process')}>
              <div className="flex flex-col gap-2">
                {BRM_PRESSURE_MOVES.map((move) => (
                  <button
                    key={move}
                    type="button"
                    onClick={() => setBrmMove(move)}
                    className={`h-11 rounded-[4px] text-13 font-medium border px-4 text-left ${
                      brmMove === move ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                    }`}
                  >
                    {move}
                  </button>
                ))}
              </div>
            </RitualCard>
          )}

          {step === 'process' && (
            <RitualCard question="What does good process look like tonight — win or lose?" onNext={() => goNext('ego')}>
              <input
                value={processDefinition}
                onChange={(e) => setProcessDefinition(e.target.value)}
                placeholder="Playing every hand the same way I would on camera."
                className="input w-full text-center text-16"
                autoFocus
              />
            </RitualCard>
          )}

          {step === 'ego' && (
            <RitualCard question="Playing to prove something, or playing your game?" onNext={() => goNext('pledge')} nextDisabled={!egoCheck}>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEgoCheck('PROVING')}
                  className={`flex-1 h-16 rounded-[4px] text-13 font-medium border ${
                    egoCheck === 'PROVING' ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                  }`}
                >
                  Proving something
                </button>
                <button
                  type="button"
                  onClick={() => setEgoCheck('PLAYING')}
                  className={`flex-1 h-16 rounded-[4px] text-13 font-medium border ${
                    egoCheck === 'PLAYING' ? 'border-accent-steel bg-accent-steel/10 text-text-primary' : 'border-border text-text-muted'
                  }`}
                >
                  Playing my game
                </button>
              </div>
              {egoCheck === 'PROVING' && (
                <p className="text-12 text-text-faint text-center mt-3">Worth noticing. Proceed when ready.</p>
              )}
            </RitualCard>
          )}

          {step === 'pledge' && (
            <div className="flex flex-col gap-6">
              <p className="text-14 text-text-primary leading-loose text-center">{pledgeText}</p>
              <button
                type="button"
                onMouseDown={startHold}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={startHold}
                onTouchEnd={cancelHold}
                className="relative h-14 rounded-[4px] border border-accent-steel text-text-primary text-14 font-medium overflow-hidden select-none"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-accent-steel/30 transition-none"
                  style={{ width: `${holding ? holdProgress : 0}%` }}
                />
                <span className="relative">I'm in</span>
              </button>
            </div>
          )}

          {step === 'close' && (
            <div className="flex flex-col items-center text-center gap-6">
              <span className="font-display text-20 text-text-primary">Champion.</span>
              <p className="text-14 text-text-muted">Locked in. See you on the other side.</p>
              <button
                type="button"
                onClick={() => onComplete({ intent, identityLine, processDefinition })}
                className="h-11 px-6 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium flex items-center gap-1.5"
              >
                Go back to the preparation engine <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RitualCard({
  question,
  children,
  onNext,
  nextDisabled,
}: {
  question: string;
  children: React.ReactNode;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-20 text-text-primary text-center">{question}</h2>
      {children}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="self-center h-10 px-6 bg-accent-steel text-text-primary rounded-[4px] text-13 font-medium disabled:opacity-40 flex items-center gap-1.5 mt-2"
      >
        Next <ChevronRight size={13} />
      </button>
    </div>
  );
}
