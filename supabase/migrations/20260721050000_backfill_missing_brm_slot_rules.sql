-- Fixes "BRM Level N table rules are not yet configured by your coach" on
-- the Weekly Game Plan screen (weeklyGamePlan.ts:283) for BRM configs that
-- predate the 20260721020000 migration (which introduced
-- brm_level_slot_rules). Any brm_levels row created before that migration
-- has zero matching brm_level_slot_rules rows, so
-- fetchSlotRulesForBRMLevel() (brmRules.ts) correctly returns null and
-- validateWeeklyGamePlan() correctly blocks — the application code here is
-- not the bug, the historical data is genuinely incomplete.
--
-- This can't be fixed by the coach re-saving BRM Config in the current UI:
-- weekly_brm_assignments.brm_level_id is locked to a specific brm_levels.id
-- for the whole Poker Week (PRD §4 — "BRM level switches only at the weekly
-- review boundary"), and brm_config_versions/brm_levels are immutable once
-- created, so revising the config creates a NEW version's rows rather than
-- retroactively attaching slot rules to the OLD, already-assigned one.
--
-- Backfills the PRD §4 shipped defaults (brmRules.ts's DEFAULT_SLOT_RULES —
-- the same values a brand-new BRM config is prefilled with) directly onto
-- any existing brm_levels row (any coach, any version) that currently has
-- no slot rules at all. Safe/idempotent: the NOT EXISTS guard means a level
-- with even one already-configured slot rule is left untouched, so this
-- never overwrites or duplicates a coach's real configuration — it only
-- fills in rows that are genuinely empty. Levels 6-8 have no PRD-documented
-- defaults (per brmRules.ts's own "do not invent values" stance) and are
-- correctly skipped, since they have no match in the VALUES list below.
DO $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO "public"."brm_level_slot_rules" ("id", "brm_level_id", "slot_number", "max_buy_ins")
    SELECT "gen_random_uuid"(), bl."id", defaults.slot_number, defaults.max_buy_ins
    FROM "public"."brm_levels" bl
    JOIN (
        VALUES
            (1, 1, 2),
            (2, 1, 2), (2, 2, 1), (2, 3, 2), (2, 4, 2), (2, 5, 2),
            (3, 1, 2), (3, 2, 2),
            (4, 1, 2), (4, 2, 2), (4, 3, 2),
            (5, 1, 2), (5, 2, 2), (5, 3, 2)
    ) AS defaults(level_index, slot_number, max_buy_ins)
      ON defaults.level_index = bl."level_index"
    WHERE NOT EXISTS (
        SELECT 1 FROM "public"."brm_level_slot_rules" existing WHERE existing."brm_level_id" = bl."id"
    );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % brm_level_slot_rules row(s) across BRM levels that had none configured.', v_count;
END $$;
