-- Tournament slot rules (max buy-ins per BRM-permitted slot number) were
-- hardcoded in src/lib/brmRules.ts (DEFAULT_SLOT_RULES, keyed by level_index,
-- shared by every coach) instead of living in each coach's versioned BRM
-- configuration alongside bankroll bands and buy-in/exposure caps. This
-- makes them coach-configurable and versioned the same way: one row per
-- (brm_level, slot_number), scoped to that level's specific version via
-- brm_level_id -> brm_levels.version_id, so slot rules are pinned to the
-- historical version a Weekly Game Plan actually validated against, exactly
-- like max_tournament_buy_in/max_session_exposure already are.
--
-- brmRules.ts's DEFAULT_SLOT_RULES/getSlotRulesForLevel stay put — repointed
-- to only serve as the shipped-defaults prefill for a brand-new BRM config
-- (mirroring DEFAULT_BRM_ROWS' role for bands/levels), never as the live
-- source WeeklyGamePlanView validates against.

CREATE TABLE IF NOT EXISTS "public"."brm_level_slot_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brm_level_id" "uuid" NOT NULL,
    "slot_number" integer NOT NULL,
    "max_buy_ins" integer NOT NULL
);

ALTER TABLE "public"."brm_level_slot_rules" OWNER TO "postgres";

ALTER TABLE ONLY "public"."brm_level_slot_rules"
    ADD CONSTRAINT "brm_level_slot_rules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."brm_level_slot_rules"
    ADD CONSTRAINT "brm_level_slot_rules_brm_level_id_slot_number_key" UNIQUE ("brm_level_id", "slot_number");

ALTER TABLE ONLY "public"."brm_level_slot_rules"
    ADD CONSTRAINT "brm_level_slot_rules_brm_level_id_fkey" FOREIGN KEY ("brm_level_id") REFERENCES "public"."brm_levels"("id");

-- Same open-read shape as its sibling brm_levels/brm_bankroll_bands: any
-- authenticated user (coach or player) can read slot rules, since a
-- player's own Weekly Game Plan validation needs to read their coach's
-- configured rules directly.
CREATE POLICY "Authenticated read BRM slot rules" ON "public"."brm_level_slot_rules" FOR SELECT USING (true);

-- Coaches manage slot rules for their own BRM levels only, scoped through
-- the same brm_level -> version -> config -> coach_id chain used elsewhere.
CREATE POLICY "Coaches manage own BRM slot rules" ON "public"."brm_level_slot_rules"
  FOR ALL TO "authenticated"
  USING (
    "brm_level_id" IN (
      SELECT "bl"."id" FROM "public"."brm_levels" "bl"
      JOIN "public"."brm_config_versions" "bcv" ON "bcv"."id" = "bl"."version_id"
      JOIN "public"."brm_configurations" "bc" ON "bc"."id" = "bcv"."config_id"
      WHERE "bc"."coach_id" = "auth"."uid"()
    )
  )
  WITH CHECK (
    "brm_level_id" IN (
      SELECT "bl"."id" FROM "public"."brm_levels" "bl"
      JOIN "public"."brm_config_versions" "bcv" ON "bcv"."id" = "bl"."version_id"
      JOIN "public"."brm_configurations" "bc" ON "bc"."id" = "bcv"."config_id"
      WHERE "bc"."coach_id" = "auth"."uid"()
    )
  );

GRANT ALL ON TABLE "public"."brm_level_slot_rules" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."brm_level_slot_rules" TO "authenticated";

-- Bug (found while building the above): brm_bankroll_bands and brm_levels
-- have only ever had a SELECT RLS policy (initial schema) — no INSERT policy
-- was ever added for either, unlike brm_config_versions which got its
-- INSERT/UPDATE gap fixed in 20260721010000. So createBRMConfig/
-- reviseBRMConfig (brmConfig.ts) can create the brm_config_versions row
-- (that policy exists) but then fail on the very next insert into
-- brm_bankroll_bands/brm_levels with a 42501 RLS violation — every
-- "Save Changes"/"Create & Activate BRM Configuration" click was silently
-- broken. Worse, because the version row insert already succeeded before
-- the failing bands insert, this repeatedly left an empty, orphaned,
-- is_activated = true brm_config_versions row behind — the exact
-- two-simultaneously-active-versions corruption 20260721010000 already had
-- to repair once, from the same missing-UPDATE-policy bug on
-- brm_config_versions itself.
CREATE POLICY "Coaches write own BRM levels" ON "public"."brm_levels"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "version_id" IN (
      SELECT "bcv"."id" FROM "public"."brm_config_versions" "bcv"
      JOIN "public"."brm_configurations" "bc" ON "bc"."id" = "bcv"."config_id"
      WHERE "bc"."coach_id" = "auth"."uid"()
    )
  );

CREATE POLICY "Coaches write own bankroll bands" ON "public"."brm_bankroll_bands"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "version_id" IN (
      SELECT "bcv"."id" FROM "public"."brm_config_versions" "bcv"
      JOIN "public"."brm_configurations" "bc" ON "bc"."id" = "bcv"."config_id"
      WHERE "bc"."coach_id" = "auth"."uid"()
    )
  );
