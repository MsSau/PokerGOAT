-- Neither "public"."poker_weeks" nor "public"."weekly_brm_assignments" ever
-- had a write RLS policy — only SELECT, for both coach and player. Nothing
-- in this schema (no RPC, no trigger, no cron) ever created either row, so
-- every player's Weekly Game Plan validation ("No locked Weekly BRM
-- Assignment for this Poker Week") has been permanently failing from a
-- fresh database: resolveWGPContext (weeklyGamePlan.ts) and the Plan tab
-- can never find one because nothing could ever insert one.
--
-- PRD §4/§5: BRM Level is assigned at the Poker Week boundary using the
-- bankroll state at that boundary, and the Poker Week boundary is
-- coach-configured. Both actions are therefore coach-driven — mirrors the
-- fn_is_coach_of() scoping already used for every other player-owned,
-- coach-managed table (coach_directives, bankroll_ledger_entries, etc.).

CREATE POLICY "Coaches manage their players' poker weeks" ON "public"."poker_weeks"
  FOR ALL TO "authenticated"
  USING ("public"."fn_is_coach_of"("player_id"))
  WITH CHECK ("public"."fn_is_coach_of"("player_id"));

CREATE POLICY "Coaches assign their players' weekly BRM" ON "public"."weekly_brm_assignments"
  FOR INSERT TO "authenticated"
  WITH CHECK ("public"."fn_is_coach_of"("player_id"));

-- Locking a Weekly BRM Assignment fixes the player's stop-loss limits for
-- the entire Poker Week (PRD §4: "changes to bankroll during the week do
-- not change the active Weekly BRM Assignment") — a consequential,
-- week-long action, same weight as every other mandatory-reason-gated
-- coach action already in this schema (framework_versions.change_reason,
-- brm_config_versions.change_reason, execution_actions.change_reason,
-- escalation_events.reason). No UPDATE policy is added: once locked, an
-- assignment is immutable like everything else "locked" in this schema —
-- a mistaken assignment is a new, distinct row for a different poker week,
-- never an edit to this one.
ALTER TABLE "public"."weekly_brm_assignments" ADD COLUMN IF NOT EXISTS "change_reason" "text";
