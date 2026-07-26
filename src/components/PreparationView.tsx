import React, { useState } from 'react';
import { Award, AlertTriangle } from 'lucide-react';
import PreparationCheckIn, { CheckInValues } from './PreparationCheckIn';
import PreGameRitual, { RitualFreeText } from './PreGameRitual';
import { createPreparationRecord, PreparationRecordRow } from '../lib/preparation';
import { resolveCoachId } from '../lib/supabase';
import { getErrorMessage, medalColorClass } from '../lib/utils';
import { PlayerId } from '../types/ids';

type Stage = 'checkin' | 'ritual' | 'medal';

interface PreparationViewProps {
  userId: PlayerId;
  defaultStopLoss: number;
  onGoToTournamentSelection: () => void;
}

const MEDAL_COPY: Record<string, string> = {
  GOLD: 'Sleep and meditation both cleared target, with strong supporting readiness.',
  SILVER: 'Sleep and meditation both cleared target.',
  BRONZE: 'One of Sleep or Meditation is below target tonight.',
  NONE: 'Both Sleep and Meditation are below target tonight.',
};

// PRD §5/§7: Preparation Check-in -> Optional Pre-Game Ritual -> Preparation
// Medal -> (player proceeds to Play / Start Session on their own). This
// component never creates or touches the Session Contract itself.
export default function PreparationView({ userId, defaultStopLoss, onGoToTournamentSelection }: PreparationViewProps) {
  const [stage, setStage] = useState<Stage>('checkin');
  const [checkInValues, setCheckInValues] = useState<CheckInValues | null>(null);
  const [record, setRecord] = useState<PreparationRecordRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: CheckInValues, ritualCompleted: boolean, ritualText?: RitualFreeText) => {
    setSaving(true);
    setError(null);
    try {
      const coachId = await resolveCoachId(userId, 'PLAYER');
      const created = await createPreparationRecord(userId, coachId, {
        ...values,
        preGameRitualCompleted: ritualCompleted,
        ritualIntent: ritualText?.intent || null,
        ritualIdentityLine: ritualText?.identityLine || null,
        ritualProcessDefinition: ritualText?.processDefinition || null,
      });
      setRecord(created);
      setStage('medal');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (stage === 'ritual' && checkInValues) {
    return (
      <PreGameRitual
        userId={userId}
        sleepHours={checkInValues.sleepHours}
        meditationMinutes={checkInValues.meditationMinutes}
        defaultStopLoss={defaultStopLoss}
        onExit={() => setStage('checkin')}
        onComplete={(ritualText) => submit(checkInValues, true, ritualText)}
      />
    );
  }

  if (stage === 'medal' && record) {
    return (
      <div className="bg-surface border border-border rounded-[6px] p-8 flex flex-col items-center gap-4 text-center">
        <span className="text-12 font-mono text-text-muted uppercase tracking-wider">Preparation Medal</span>
        <Award size={40} className={medalColorClass(record.medal_tier)} />
        <span className={`font-display text-28 ${medalColorClass(record.medal_tier)}`}>{record.medal_tier}</span>
        <p className="text-14 text-text-muted max-w-sm">{MEDAL_COPY[record.medal_tier] ?? ''}</p>
        <button
          type="button"
          onClick={onGoToTournamentSelection}
          className="mt-2 h-11 px-6 bg-accent-steel text-text-primary rounded-[4px] text-14 font-medium"
        >
          Continue to Play
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2 text-signal-risk bg-signal-risk/10 p-3 rounded-[4px] border border-signal-risk/25 text-12">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <PreparationCheckIn
        onSkipRitual={(values) => {
          setCheckInValues(values);
          submit(values, false);
        }}
        onBeginRitual={(values) => {
          setCheckInValues(values);
          setStage('ritual');
        }}
      />
      {saving && <span className="text-12 text-text-faint text-center">Saving…</span>}
    </div>
  );
}
