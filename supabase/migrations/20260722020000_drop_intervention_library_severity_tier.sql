-- Removes severity_tier from intervention_library (PRD §16 deviation — see
-- PokerGOAT_PRD.md "## 22. Feature Updates"). Escalation-stage linkage
-- (min_escalation_stage, added in 20260722010000) is now the only
-- organizing concept for library items; severity_tier duplicated a
-- classification Execution Actions already carry (base_severity) without
-- ever being cross-checked against it.
--
-- The severity_type ENUM itself is untouched — it's still used by
-- execution_actions.base_severity and the dormant intervention_policies
-- (Load Management) table, neither of which this migration touches.
ALTER TABLE "public"."intervention_library"
  DROP COLUMN "severity_tier";
