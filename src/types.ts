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
  id: string | null;           // sessions.id — needed by TournamentLog
  contractId: string | null;   // sessions.contract_id
  isActive: boolean;
  startTime: string | null;
  sessionLimit: number;
  dayLimit: number;
  weekLimit: number;
  stopLossConsumed: number;
  confidenceScore: number;
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
  poker_week_id: string
  brm_levels?: {
    level_index: number;
    
  };
}

// --- append to src/types.ts ---

export type WGPStatus = 'DRAFT' | 'LOCKED'; // ⚠️ verify against your actual enum labels

export interface PokerWeek {
  id: string;
  player_id: string;
  start_timestamp: string;
  end_timestamp: string;
  is_finalized: boolean;
  boundary_config_id: string | null;
  player_timezone_snapshot: string;
}

export interface WeeklyGamePlan {
  id: string;
  player_id: string;
  poker_week_id: string;
  framework_version_id: string | null;
  brm_assignment_id: string | null;
  status: WGPStatus;
  weekly_intention: string | null;
  weekly_focus: string | null;
  created_at: string;
  locked_at: string | null;
}

export interface WeeklyGamePlanPlayingDay {
  id: string;
  weekly_game_plan_id: string;
  planned_date: string;
  planned_session_allocation: number;
}

export interface WeeklyGamePlanTournament {
  id: string;
  weekly_game_plan_id: string;
  slot_number: number;
  tournament_name: string;
  permitted_buy_ins: number;
  intended_buy_ins: number;
  planned_date: string | null;
  created_at: string;
}

export interface WeeklyGamePlanConditionalTournament {
  id: string;
  weekly_game_plan_id: string;
  tournament_name: string;
  activation_condition: string;
  permitted_buy_ins: number;
  created_at: string;
}

export interface WeeklyGamePlanCommitment {
  id: string;
  weekly_game_plan_id: string;
  commitment_text: string;
  created_at: string;
}

export interface WeeklyGamePlanAmendment {
  id: string;
  weekly_game_plan_id: string;
  player_id: string;
  amendment_type: string;
  original_reference: unknown;
  proposed_new_value: unknown;
  reason: string;
  validation_result: unknown;
  is_violation: boolean;
  related_execution_action_id: string | null;
  created_at: string;
}

