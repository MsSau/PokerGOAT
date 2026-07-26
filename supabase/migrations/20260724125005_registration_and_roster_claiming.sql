-- Self-service registration (Player or Coach) plus coach-side roster
-- claiming. Until now every profiles row was seeded manually — there was no
-- INSERT policy on profiles at all, and no way for a coach to attach a new
-- player to their own roster (profiles.coach_id).

-- Real display name for both roles — today CoachRosterEntry.displayName
-- (and similar) fall back to email.split('@')[0]; registration now collects
-- an actual name to store here instead.
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "display_name" "text";

-- A brand-new authenticated user has no profiles row yet — this is the
-- missing piece that made registration impossible.
CREATE POLICY "Users create own profile" ON "public"."profiles"
  FOR INSERT TO "authenticated"
  WITH CHECK ("id" = "auth"."uid"());

-- Mirrors fn_is_coach_of's existing style/pattern, just checking the
-- caller's own role instead of a specific player relationship.
CREATE OR REPLACE FUNCTION "public"."fn_is_coach"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'COACH'
    );
$$;

ALTER FUNCTION "public"."fn_is_coach"() OWNER TO "postgres";

-- Lets a coach's registration-time roster picker actually query the pool of
-- not-yet-claimed players. Scoped to coaches only (fn_is_coach()), not every
-- authenticated user, even though the rows exposed are limited to unclaimed
-- players' profiles.
CREATE POLICY "Coaches see unclaimed players" ON "public"."profiles"
  FOR SELECT TO "authenticated"
  USING ("coach_id" IS NULL AND "role" = 'PLAYER' AND "public"."fn_is_coach"());

-- A coach may only move a player from unclaimed -> themselves (USING gates
-- which existing rows qualify, WITH CHECK gates the resulting value) --
-- never re-assign a player who already has a coach.
CREATE POLICY "Coaches claim unassigned players" ON "public"."profiles"
  FOR UPDATE TO "authenticated"
  USING ("coach_id" IS NULL AND "role" = 'PLAYER')
  WITH CHECK ("coach_id" = "auth"."uid"());

-- DELIBERATE, DISCUSSED EXCEPTION to 20260721030000_players_log_capital_movements.sql's
-- "OPENING_CAPITAL and ADJUSTMENT remain coach-only entry types" rule. That
-- migration's own rationale still holds in general (a player self-declaring
-- opening capital could otherwise unlock a BRM band a coach never reviewed) --
-- this is a narrow, explicitly-requested exception for the registration flow
-- specifically, not a reversal of that rule. Scope is kept as tight as
-- possible: a player may self-insert OPENING_CAPITAL exactly ONCE ever (the
-- NOT EXISTS guard), at registration, self-attributed (player_id =
-- recorded_by = auth.uid()) -- never a standing ability to "reset" their own
-- bankroll. DEPOSIT/WITHDRAWAL self-logging is unaffected (still covered by
-- the existing policy); ADJUSTMENT stays coach-only, untouched here.
CREATE POLICY "Players self-declare opening capital once at registration" ON "public"."bankroll_ledger_entries"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "player_id" = "auth"."uid"()
    AND "recorded_by" = "auth"."uid"()
    AND "entry_type" = 'OPENING_CAPITAL'
    AND NOT EXISTS (
      SELECT 1 FROM "public"."bankroll_ledger_entries" "e"
      WHERE "e"."player_id" = "auth"."uid"() AND "e"."entry_type" = 'OPENING_CAPITAL'
    )
  );
