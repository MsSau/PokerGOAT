import { Database } from './types/database';
import { SessionId, SessionContractId } from './types/ids';

export type UserRole = Database['public']['Enums']['role_type'];

export type PlayerRoute =
  | 'dashboard'
  | 'prepare'
  | 'plan'
  | 'play'
  | 'log'
  | 'progress'
  | 'verdicts'
  | 'interventions';

export type CoachRoute =
  | 'brief'
  | 'behavioral'
  | 'framework'
  | 'brm'
  | 'taxonomy'
  | 'escalation'
  | 'interventions';

export interface ActiveSession {
  id: SessionId | null;           // sessions.id — needed by TournamentLog
  contractId: SessionContractId | null;   // sessions.contract_id
  isActive: boolean;
  status: 'NONE' | 'ACTIVE' | 'REVIEW_PENDING' | 'FINALIZED';
  startTime: string | null;
  sessionLimit: number;
  dayLimit: number;
  weekLimit: number;
  stopLossConsumed: number;
  confidenceScore: number;
}

// Row types mirroring Supabase tables, derived from the generated schema so
// they can never drift from the real column list/nullability (see
// src/types/database.ts — auto-generated, don't hand-edit). Every one of
// these is populated by a `select('*')` (or equivalent full column list) —
// narrower selects get their own `Pick<>` type co-located with the fetcher
// that uses them (e.g. sessionContract.ts's *Summary types) rather than
// living here.
export type PerformanceFramework = Database['public']['Tables']['performance_frameworks']['Row'];
export type FrameworkVersion = Database['public']['Tables']['framework_versions']['Row'];
export type BRMConfiguration = Database['public']['Tables']['brm_configurations']['Row'];
export type BRMConfigVersion = Database['public']['Tables']['brm_config_versions']['Row'];
export type BRMBankrollBand = Database['public']['Tables']['brm_bankroll_bands']['Row'];
export type BRMLevel = Database['public']['Tables']['brm_levels']['Row'];
export type BRMLevelSlotRule = Database['public']['Tables']['brm_level_slot_rules']['Row'];

export type WGPStatus = Database['public']['Enums']['wgp_status'];

export type PokerWeek = Database['public']['Tables']['poker_weeks']['Row'];
export type WeeklyGamePlan = Database['public']['Tables']['weekly_game_plans']['Row'];
export type WeeklyGamePlanPlayingDay = Database['public']['Tables']['weekly_game_plan_playing_days']['Row'];
export type WeeklyGamePlanTournament = Database['public']['Tables']['weekly_game_plan_tournaments']['Row'];
export type WeeklyGamePlanConditionalTournament = Database['public']['Tables']['weekly_game_plan_conditional_tournaments']['Row'];
export type WeeklyGamePlanCommitment = Database['public']['Tables']['weekly_game_plan_commitments']['Row'];
export type WeeklyGamePlanAmendment = Database['public']['Tables']['weekly_game_plan_amendments']['Row'];

// Taxonomy (§10), Escalation (§12), and Interventions (§16) coach config screens.
export type ExecutionTaxonomy = Database['public']['Tables']['execution_taxonomies']['Row'];
export type TaxonomyVersion = Database['public']['Tables']['taxonomy_versions']['Row'];
export type ExecutionAction = Database['public']['Tables']['execution_actions']['Row'];
export type ExecutionActionStatus = Database['public']['Enums']['execution_action_status'];

export type EscalationRuleVersion = Database['public']['Tables']['escalation_rule_versions']['Row'];
export type EscalationTrack = Database['public']['Tables']['escalation_tracks']['Row'];
export type EscalationEvent = Database['public']['Tables']['escalation_events']['Row'];

export type InterventionLibraryItem = Database['public']['Tables']['intervention_library']['Row'];
export type InterventionCandidate = Database['public']['Tables']['intervention_candidates']['Row'];
export type InterventionAssignment = Database['public']['Tables']['intervention_assignments']['Row'];

