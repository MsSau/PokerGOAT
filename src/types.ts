export type UserRole = 'PLAYER' | 'COACH';

export type PlayerRoute =
  | 'dashboard'
  | 'prepare'
  | 'plan'
  | 'play'
  | 'log'
  | 'progress'
  | 'verdicts';

export type CoachRoute =
  | 'brief'
  | 'player'
  | 'verdicts'
  | 'behavioral'
  | 'framework'
  | 'brm'
  | 'taxonomy'
  | 'escalation'
  | 'interventions';

export interface UserProfile {
  id: string;
  role: UserRole;
  coach_id?: string | null;
  timezone?: string;
  email: string;
}

export interface ActiveSession {
  isActive: boolean;
  startTime: string | null;
  sessionLimit: number;
  dayLimit: number;
  weekLimit: number;
  stopLossConsumed: number; // in dollars
  confidenceScore: number; // percentage
}

// Supabase Database Schemas as specified in the guidelines
export interface PerformanceFramework {
  id: string;
  coach_id: string;
  status: 'Active' | 'Inactive' | string;
}

export interface FrameworkVersion {
  id: string;
  framework_id: string;
  version_number: number;
  primary_objective: string;
  start_date: string;
  end_date: string;
  is_activated: boolean;
  created_at: string;
}

export interface BRMConfiguration {
  id: string;
  coach_id: string;
}

export interface BRMConfigVersion {
  id: string;
  config_id: string;
  version_number: number;
  is_activated: boolean;
  created_at: string;
}

export interface BRMBankrollBand {
  id: string;
  version_id: string;
  min_bankroll: number;
  max_bankroll: number;
  session_stop_loss: number;
  day_stop_loss: number;
  week_stop_loss: number;
  level_index: number;
}

export interface BRMLevel {
  id: string;
  version_id: string;
  level_index: number;
  max_tournament_buy_in: number;
  max_session_exposure: number;
}

export interface Session {
  id: string;
  player_id: string;
  contract_id?: string;
  status: 'ACTIVE' | 'ENDED' | string;
  start_time: string;
  end_time?: string;
}

export interface Verdict {
  id: string;
  session_id: string;
  headline: string;
}

export interface ExecutionAssessment {
  id: string;
  session_id: string;
  system_execution_medal: string;
}

export interface OutcomeAssessment {
  id: string;
  session_id: string;
  final_session_net_pnl: number;
  system_outcome_medal: string;
}

export interface WeeklyBRMAssignment {
  id: string;
  player_id: string;
  brm_level_id: string;
  week_stop_loss_snapshot: number;
  session_stop_loss_snapshot: number;
  day_stop_loss_snapshot: number;
  locked_at: string;
  brm_levels?: {
    level_index: number;
  };
}

