-- Bug: framework_versions and brm_config_versions only ever had an INSERT
-- RLS policy for coaches (from the initial schema) — never UPDATE. But
-- reviseActivatedFramework/activateFramework (performanceFramework.ts) and
-- reviseBRMConfig (brmConfig.ts) all rely on being able to UPDATE a row's
-- is_activated flag (the one field fn_enforce_version_immutability's
-- trigger explicitly permits changing even on an already-activated row).
-- Without an UPDATE policy, RLS silently matches zero rows — Postgres
-- doesn't error on an UPDATE that matches nothing, so the "deactivate the
-- previous version" step in those functions failed silently every time,
-- leaving TWO rows with is_activated = true for the same framework/config.
--
-- That corruption doesn't surface where it happened — it surfaces the next
-- time *anything* reads "the" active version via .maybeSingle() (which
-- errors on >1 row): getActiveFramework, getActiveBRM, and critically
-- resolveWGPContext's framework_versions lookup, which is what actually
-- broke the Player's Weekly Game Plan tab. The "No Poker Week has been
-- established" message the player saw was a red herring — the poker_weeks
-- lookup upstream of it was already fine; a later query in the same
-- function threw, so the whole context resolution failed and the UI's
-- generic "no context" branch rendered instead of anything mentioning the
-- real cause.

CREATE POLICY "Coaches deactivate their own framework versions" ON "public"."framework_versions"
  FOR UPDATE TO "authenticated"
  USING (
    "framework_id" IN (SELECT "id" FROM "public"."performance_frameworks" WHERE "coach_id" = "auth"."uid"())
  )
  WITH CHECK (
    "framework_id" IN (SELECT "id" FROM "public"."performance_frameworks" WHERE "coach_id" = "auth"."uid"())
  );

CREATE POLICY "Coaches deactivate their own BRM config versions" ON "public"."brm_config_versions"
  FOR UPDATE TO "authenticated"
  USING (
    "config_id" IN (SELECT "id" FROM "public"."brm_configurations" WHERE "coach_id" = "auth"."uid"())
  )
  WITH CHECK (
    "config_id" IN (SELECT "id" FROM "public"."brm_configurations" WHERE "coach_id" = "auth"."uid"())
  );

-- Repair already-corrupted data: for any framework/config left with more
-- than one is_activated = true version by the bug above, keep only the
-- most recently created one active (that's the version the coach's most
-- recent action actually intended to be live) and deactivate the rest.
-- Runs as the migration role, not subject to RLS.
UPDATE "public"."framework_versions" "fv"
SET "is_activated" = false
WHERE "fv"."is_activated" = true
  AND "fv"."id" <> (
    SELECT "fv2"."id" FROM "public"."framework_versions" "fv2"
    WHERE "fv2"."framework_id" = "fv"."framework_id" AND "fv2"."is_activated" = true
    ORDER BY "fv2"."created_at" DESC NULLS LAST, "fv2"."version_number" DESC
    LIMIT 1
  );

UPDATE "public"."brm_config_versions" "bcv"
SET "is_activated" = false
WHERE "bcv"."is_activated" = true
  AND "bcv"."id" <> (
    SELECT "bcv2"."id" FROM "public"."brm_config_versions" "bcv2"
    WHERE "bcv2"."config_id" = "bcv"."config_id" AND "bcv2"."is_activated" = true
    ORDER BY "bcv2"."created_at" DESC NULLS LAST, "bcv2"."version_number" DESC
    LIMIT 1
  );
