-- Adds player-facing completion tracking to Intervention Assignments
-- (PRD §16). Previously only the coach could ever transition
-- intervention_assignments.status (interventions.ts's setAssignmentStatus,
-- used from the coach-only InterventionsConfigView screen) and there was
-- no column carrying the player's own comment, distinct from the coach's
-- own intervention_effectiveness_reviews rating. The player now gets a
-- read + "mark complete with a note" path of their own.

ALTER TABLE "public"."intervention_assignments"
  ADD COLUMN "player_notes" "text";

-- Mirrors the existing "Players stop own active sessions" pattern (a
-- player may only move THEIR OWN row through one specific state
-- transition): USING restricts which rows are even visible to this policy
-- (the player's own, currently ASSIGNED), WITH CHECK restrains what the
-- row is allowed to become (COMPLETED) once updated. Coaches keep their
-- existing "Coaches manage their players' assignments" full-CRUD policy —
-- assigning and cancelling remain coach-only; this only ever opens the
-- ASSIGNED -> COMPLETED transition to the assignment's own player.
CREATE POLICY "Players complete own assignments" ON "public"."intervention_assignments"
  FOR UPDATE
  USING ((("player_id" = "auth"."uid"()) AND ("status" = 'ASSIGNED'::"public"."intervention_status")))
  WITH CHECK ((("player_id" = "auth"."uid"()) AND ("status" = 'COMPLETED'::"public"."intervention_status")));
