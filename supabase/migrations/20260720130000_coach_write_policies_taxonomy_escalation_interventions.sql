-- Coach-side write access needed for the Taxonomy, Escalation, and
-- Interventions coach config screens (PRD §10 Execution Action governance,
-- §12 Behavioral Escalation Engine coach overrides, §16 Intervention
-- eligibility mapping). Several of these tables previously had only read
-- policies (or none at all) for the coach role — this migration adds the
-- missing write paths, scoped the same way the rest of the schema scopes
-- coach ownership (via fn_is_coach_of() for player-scoped rows, via the
-- owning parent record's coach_id for config rows).

-- --- Execution Actions (Taxonomy) -------------------------------------------
-- Coaches can already SELECT every execution_action (open read policy).
-- They need write access to: create canonical actions directly, edit an
-- existing canonical action's fields, and approve/reject a player-proposed
-- action (which requires setting dimension/base_severity/hard-gate/detection
-- method per PRD §3.3 before it can move to CANONICAL_ACTIVE, and
-- re-pointing it at the coach's own taxonomy version). Scope: the action
-- already belongs to one of the coach's own taxonomy versions, OR it was
-- proposed by one of the coach's own players (covers approving a proposal
-- stamped with a stale/older taxonomy_version_id). change_reason mirrors the
-- column already added to framework_versions/brm_config_versions for the
-- mandatory-reason modal (§3.3) — editing an already-CANONICAL_ACTIVE
-- action's scoring-relevant fields goes through it; occurrences and
-- assessments snapshot their own severity/hard-gate state at write time, so
-- this is a plain in-place edit rather than a new-version-row scheme.
ALTER TABLE "public"."execution_actions" ADD COLUMN IF NOT EXISTS "change_reason" "text";

CREATE POLICY "Coaches manage own execution actions" ON "public"."execution_actions"
  FOR ALL TO "authenticated"
  USING (
    ("taxonomy_version_id" IN (
      SELECT "tv"."id" FROM "public"."taxonomy_versions" "tv"
      JOIN "public"."execution_taxonomies" "et" ON "et"."id" = "tv"."taxonomy_id"
      WHERE "et"."coach_id" = "auth"."uid"()
    ))
    OR ("proposed_by" IS NOT NULL AND "public"."fn_is_coach_of"("proposed_by"))
  )
  WITH CHECK (
    "taxonomy_version_id" IN (
      SELECT "tv"."id" FROM "public"."taxonomy_versions" "tv"
      JOIN "public"."execution_taxonomies" "et" ON "et"."id" = "tv"."taxonomy_id"
      WHERE "et"."coach_id" = "auth"."uid"()
    )
  );

-- --- Escalation overrides ---------------------------------------------------
-- PRD §12: "coach can override any stage transition or de-escalation with a
-- mandatory reason ... Historical Escalation Events remain immutable
-- regardless of later overrides — an override creates a new event
-- referencing the one it supersedes, it does not edit history." The events
-- table was SELECT-only (via parent track) with no reason/override/
-- supersedes columns; tracks were SELECT-only too, but an override must
-- still update the live current_stage_index the deterministic engine reads.
ALTER TABLE "public"."escalation_events" ADD COLUMN IF NOT EXISTS "reason" "text";
ALTER TABLE "public"."escalation_events" ADD COLUMN IF NOT EXISTS "is_override" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."escalation_events" ADD COLUMN IF NOT EXISTS "supersedes_event_id" "uuid" REFERENCES "public"."escalation_events"("id");

CREATE POLICY "Coaches override their players tracks" ON "public"."escalation_tracks"
  FOR UPDATE TO "authenticated"
  USING ("public"."fn_is_coach_of"("player_id"))
  WITH CHECK ("public"."fn_is_coach_of"("player_id"));

CREATE POLICY "Coaches write override events for their players" ON "public"."escalation_events"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "track_id" IN (
      SELECT "id" FROM "public"."escalation_tracks" WHERE "public"."fn_is_coach_of"("player_id")
    )
  );

-- escalation_rule_versions has no coach_id (a single shared ruleset, same
-- "global defaults until customized" posture the BRM bands shipped with
-- before any coach-scoped config existed) and ships with zero rows —
-- nothing could ever insert the first one. Let any authenticated user seed
-- it, matching the table's existing unscoped SELECT policy.
CREATE POLICY "Authenticated seed escalation rule versions" ON "public"."escalation_rule_versions"
  FOR INSERT TO "authenticated"
  WITH CHECK (true);

-- --- Intervention eligibility mappings --------------------------------------
-- PRD §16: coach maps interventions to Execution Actions / minimum
-- escalation stage. Only a SELECT policy existed (via the parent library
-- item).
CREATE POLICY "Coaches manage own eligibility mappings" ON "public"."intervention_eligibility_mappings"
  FOR ALL TO "authenticated"
  USING (
    "intervention_id" IN (SELECT "id" FROM "public"."intervention_library" WHERE "coach_id" = "auth"."uid"())
  )
  WITH CHECK (
    "intervention_id" IN (SELECT "id" FROM "public"."intervention_library" WHERE "coach_id" = "auth"."uid"())
  );
