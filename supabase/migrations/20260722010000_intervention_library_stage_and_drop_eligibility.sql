-- Simplifies the Intervention Engine (PRD §16) so escalation-stage linkage
-- lives directly on the Library item instead of a separate per-action
-- mapping table — see PokerGOAT_PRD.md "## 22. Feature Updates" for the
-- rationale. One library item now carries exactly one min_escalation_stage,
-- regardless of which Execution Action triggers it; the per-action nuance
-- intervention_eligibility_mappings allowed is deliberately dropped.
ALTER TABLE "public"."intervention_library"
  ADD COLUMN "min_escalation_stage" integer DEFAULT 0 NOT NULL;

-- intervention_eligibility_mappings is now fully superseded by the column
-- above. Drop both RLS policies before the table (Postgres would drop them
-- automatically with the table, but naming them documents exactly what's
-- being retired):
--   "Access via parent library item" (SELECT) — 00000000000000_initial_schema.sql
--   "Coaches manage own eligibility mappings" (ALL) — 20260720130000_coach_write_policies_taxonomy_escalation_interventions.sql
-- No CASCADE needed: nothing else references this table as an FK target.
DROP POLICY IF EXISTS "Access via parent library item" ON "public"."intervention_eligibility_mappings";
DROP POLICY IF EXISTS "Coaches manage own eligibility mappings" ON "public"."intervention_eligibility_mappings";
DROP TABLE IF EXISTS "public"."intervention_eligibility_mappings";
