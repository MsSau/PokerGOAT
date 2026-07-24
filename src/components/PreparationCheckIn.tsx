import React, { useState } from 'react';
import { Moon, Wind, Sparkles, ChevronRight, Info } from 'lucide-react';
import { PhysicalReadiness } from '../lib/preparationEngine';
import { PreparationCheckInInput } from '../lib/preparation';

export type CheckInValues = Omit<PreparationCheckInInput, 'preGameRitualCompleted'>;

interface PreparationCheckInProps {
  onSkipRitual: (values: CheckInValues) => void;
  onBeginRitual: (values: CheckInValues) => void;
}

const DEFAULT_SLEEP_HOURS = 7;
const DEFAULT_MEDITATION_MINUTES = 20;

const PHYSICAL_READINESS_INFO: Record<PhysicalReadiness, string> = {
  NONE: 'Physically depleted or significantly fatigued. Prioritise recovery.',
  LIGHT: 'Some fatigue or discomfort, but able to play normally.',
  FULL: 'Rested, comfortable, and physically ready for sustained focus.',
};

// PRD §7 "Default core preparation inputs" — the ~30-60 second Check-in that
// always runs, whether or not the player continues into the optional
// Pre-Game Ritual. Sleep and Meditation are the two primary readiness
// signals; everything else here is a "supporting component" — see
// preparationEngine.ts's countSupportingComponents.
export default function PreparationCheckIn({ onSkipRitual, onBeginRitual }: PreparationCheckInProps) {
  const [sleepHours, setSleepHours] = useState(DEFAULT_SLEEP_HOURS);
  const [meditationMinutes, setMeditationMinutes] = useState(DEFAULT_MEDITATION_MINUTES);
  const [physicalReadiness, setPhysicalReadiness] = useState<PhysicalReadiness | null>(null);
  const [mentalPriming, setMentalPriming] = useState(false);
  const [noSmoking, setNoSmoking] = useState(false);
  const [noPmo, setNoPmo] = useState(false);
  const [note, setNote] = useState('');

  const values = (): CheckInValues => ({
    sleepHours,
    meditationMinutes,
    physicalReadiness,
    mentalPriming,
    impulseControlSmoking: noSmoking ? false : null,
    impulseControlPmo: noPmo ? false : null,
    // Adequate rest / recovery is no longer a separate check-in question;
    // Impulse Control now hinges only on the No Smoking / No PMO cards.
    impulseControlRecovery: true,
    optionalNote: note.trim() || null,
  });

  return (
    <div className="bg-surface border border-border rounded-[6px] p-6 flex flex-col gap-6">
      <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Preparation Check-in</span>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Moon size={12} /> Sleep
            </span>
            <span className="text-text-primary">{sleepHours}h</span>
          </span>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value))}
            className="w-full accent-accent-steel"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-mono text-text-muted uppercase flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Wind size={12} /> Meditation / Pranayama
            </span>
            <span className="text-text-primary">{meditationMinutes}m</span>
          </span>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={meditationMinutes}
            onChange={(e) => setMeditationMinutes(Number(e.target.value))}
            className="w-full accent-accent-steel"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-12 font-mono text-text-muted uppercase flex items-center gap-1.5">
          Physical Readiness
          <span className="group relative inline-flex">
            <Info size={12} className="text-text-faint cursor-help" />
            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-[4px] border border-border bg-surface-raised text-11 normal-case font-sans text-text-muted leading-relaxed z-10 shadow-lg">
              <p><span className="text-text-primary font-medium">None</span> — Physically depleted or significantly fatigued. Prioritise recovery.</p>
              <p className="mt-1.5"><span className="text-text-primary font-medium">Light</span> — Some fatigue or discomfort, but able to play normally.</p>
              <p className="mt-1.5"><span className="text-text-primary font-medium">Full</span> — Rested, comfortable, and physically ready for sustained focus.</p>
            </div>
          </span>
        </span>
        <div className="flex gap-2">
          {(['NONE', 'LIGHT', 'FULL'] as const).map((option) => (
            <button
              key={option}
              type="button"
              title={PHYSICAL_READINESS_INFO[option]}
              onClick={() => setPhysicalReadiness(option)}
              className={`flex-1 h-10 rounded-[4px] text-13 font-medium border transition-colors ${
                physicalReadiness === option
                  ? 'border-accent-steel bg-accent-steel/10 text-text-primary'
                  : 'border-border text-text-muted hover:text-text-primary'
              }`}
            >
              {option === 'NONE' ? 'None' : option === 'LIGHT' ? 'Light' : 'Full'}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-3 p-3 bg-surface-raised/40 rounded-[4px] border border-border cursor-pointer">
        <input type="checkbox" checked={mentalPriming} onChange={(e) => setMentalPriming(e.target.checked)} />
        <div className="flex flex-col">
          <span className="text-13 text-text-primary">Mental Priming completed</span>
          <span className="text-11 text-text-muted">Purpose Review done before this check-in.</span>
        </div>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-12 font-mono text-text-muted uppercase">Impulse Control</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNoSmoking((prev) => !prev)}
            className={`flex-1 h-10 rounded-[4px] text-13 font-medium border transition-colors ${
              noSmoking
                ? 'border-accent-steel bg-accent-steel/10 text-text-primary'
                : 'border-border text-text-muted hover:text-text-primary'
            }`}
          >
            No Smoking
          </button>
          <button
            type="button"
            onClick={() => setNoPmo((prev) => !prev)}
            className={`flex-1 h-10 rounded-[4px] text-13 font-medium border transition-colors ${
              noPmo
                ? 'border-accent-steel bg-accent-steel/10 text-text-primary'
                : 'border-border text-text-muted hover:text-text-primary'
            }`}
          >
            No PMO
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-12 font-mono text-text-muted uppercase">Note (optional)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything on your mind before tonight?"
          className="input"
        />
      </label>

      <div className="flex flex-col md:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={() => onSkipRitual(values())}
          className="flex-1 h-11 border border-border rounded-[4px] text-13 font-medium text-text-muted hover:text-text-primary transition-colors"
        >
          Skip Ritual — See Medal
        </button>
        <button
          type="button"
          onClick={() => onBeginRitual(values())}
          className="flex-1 h-11 bg-accent-steel text-text-primary rounded-[4px] text-13 font-medium hover:bg-accent-steel/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <Sparkles size={14} /> Begin Pre-Game Ritual <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
