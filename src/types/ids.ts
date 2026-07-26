// Nominal/branded ID types. Every entity id in this codebase is a plain
// `string` at the database layer (src/types/database.ts is auto-generated —
// every id/foreign-key column comes out as `string`, never hand-edited to
// change that). Branding happens one layer up, here, so that e.g.
// `sessionId` and `tournamentId` can no longer be passed to each other by
// accident even though both are UUIDs under the hood. A branded type is a
// subtype of `string` (erases to a plain string at runtime, zero cost) —
// it can always be passed where a plain `string` is expected (e.g. a
// Supabase `.eq('id', someBrandedId)` call), but a plain `string` cannot be
// passed where a branded type is expected without an explicit `asXxxId`
// cast. Cast at the point a raw id first flows out of a Supabase query
// result and into one of these slots.

declare const brand: unique symbol;
export type Brand<B extends string> = string & { readonly [brand]: B };

export type PlayerId = Brand<'PlayerId'>;
export type CoachId = Brand<'CoachId'>;
export type SessionId = Brand<'SessionId'>;
export type SessionContractId = Brand<'SessionContractId'>;
export type TournamentId = Brand<'TournamentId'>;
export type TournamentEntryId = Brand<'TournamentEntryId'>;
export type PreparationId = Brand<'PreparationId'>;
export type PokerWeekId = Brand<'PokerWeekId'>;
export type BoundaryConfigId = Brand<'BoundaryConfigId'>;
export type WeeklyGamePlanId = Brand<'WeeklyGamePlanId'>;
export type WGPTournamentSlotId = Brand<'WGPTournamentSlotId'>;
export type WGPConditionalTournamentId = Brand<'WGPConditionalTournamentId'>;
export type BRMAssignmentId = Brand<'BRMAssignmentId'>;
export type BRMConfigId = Brand<'BRMConfigId'>;
export type BRMConfigVersionId = Brand<'BRMConfigVersionId'>;
export type BRMLevelId = Brand<'BRMLevelId'>;
export type BankrollBandId = Brand<'BankrollBandId'>;
export type FrameworkId = Brand<'FrameworkId'>;
export type FrameworkVersionId = Brand<'FrameworkVersionId'>;
export type ExecutionActionId = Brand<'ExecutionActionId'>;
export type TaxonomyVersionId = Brand<'TaxonomyVersionId'>;
export type EscalationTrackId = Brand<'EscalationTrackId'>;
export type EscalationRuleVersionId = Brand<'EscalationRuleVersionId'>;
export type EscalationEventId = Brand<'EscalationEventId'>;
export type InterventionLibraryItemId = Brand<'InterventionLibraryItemId'>;
export type InterventionAssignmentId = Brand<'InterventionAssignmentId'>;
export type VerdictId = Brand<'VerdictId'>;
export type DeepAnalysisThreadId = Brand<'DeepAnalysisThreadId'>;
export type ExecutionAssessmentId = Brand<'ExecutionAssessmentId'>;
export type OutcomeAssessmentId = Brand<'OutcomeAssessmentId'>;

export const asPlayerId = (id: string): PlayerId => id as PlayerId;
export const asCoachId = (id: string): CoachId => id as CoachId;
export const asSessionId = (id: string): SessionId => id as SessionId;
export const asSessionContractId = (id: string): SessionContractId => id as SessionContractId;
export const asTournamentId = (id: string): TournamentId => id as TournamentId;
export const asTournamentEntryId = (id: string): TournamentEntryId => id as TournamentEntryId;
export const asPreparationId = (id: string): PreparationId => id as PreparationId;
export const asPokerWeekId = (id: string): PokerWeekId => id as PokerWeekId;
export const asBoundaryConfigId = (id: string): BoundaryConfigId => id as BoundaryConfigId;
export const asWeeklyGamePlanId = (id: string): WeeklyGamePlanId => id as WeeklyGamePlanId;
export const asWGPTournamentSlotId = (id: string): WGPTournamentSlotId => id as WGPTournamentSlotId;
export const asWGPConditionalTournamentId = (id: string): WGPConditionalTournamentId => id as WGPConditionalTournamentId;
export const asBRMAssignmentId = (id: string): BRMAssignmentId => id as BRMAssignmentId;
export const asBRMConfigId = (id: string): BRMConfigId => id as BRMConfigId;
export const asBRMConfigVersionId = (id: string): BRMConfigVersionId => id as BRMConfigVersionId;
export const asBRMLevelId = (id: string): BRMLevelId => id as BRMLevelId;
export const asBankrollBandId = (id: string): BankrollBandId => id as BankrollBandId;
export const asFrameworkId = (id: string): FrameworkId => id as FrameworkId;
export const asFrameworkVersionId = (id: string): FrameworkVersionId => id as FrameworkVersionId;
export const asExecutionActionId = (id: string): ExecutionActionId => id as ExecutionActionId;
export const asTaxonomyVersionId = (id: string): TaxonomyVersionId => id as TaxonomyVersionId;
export const asEscalationTrackId = (id: string): EscalationTrackId => id as EscalationTrackId;
export const asEscalationRuleVersionId = (id: string): EscalationRuleVersionId => id as EscalationRuleVersionId;
export const asEscalationEventId = (id: string): EscalationEventId => id as EscalationEventId;
export const asInterventionLibraryItemId = (id: string): InterventionLibraryItemId => id as InterventionLibraryItemId;
export const asInterventionAssignmentId = (id: string): InterventionAssignmentId => id as InterventionAssignmentId;
export const asVerdictId = (id: string): VerdictId => id as VerdictId;
export const asDeepAnalysisThreadId = (id: string): DeepAnalysisThreadId => id as DeepAnalysisThreadId;
export const asExecutionAssessmentId = (id: string): ExecutionAssessmentId => id as ExecutionAssessmentId;
export const asOutcomeAssessmentId = (id: string): OutcomeAssessmentId => id as OutcomeAssessmentId;
