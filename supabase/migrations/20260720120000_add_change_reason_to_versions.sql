-- PRD §3: "Any coach modification to an active framework requires a reason
-- and creates an immutable audit record containing old value, new value,
-- coach, timestamp, and effective date." §3.3 requires every edit to a
-- record with historical dependents to pass through a mandatory-reason
-- modal before save.
--
-- framework_versions and brm_config_versions already enforce the
-- "old value / new value / immutable" half of this for free: the existing
-- tr_enforce_immutability_* triggers (fn_enforce_version_immutability) block
-- any content change to a row once is_activated = true, forcing a new
-- version row instead — that new row IS the audit record, and the coach +
-- timestamp are already covered by the parent config's coach_id and the
-- version's created_at. The one piece missing structurally is the reason
-- text itself, so add a nullable column to carry it. Populated only when a
-- new version supersedes a previously activated one (an "edit"); the very
-- first version of a brand-new framework/config has nothing to justify a
-- reason against, so it stays NULL there.
ALTER TABLE "public"."framework_versions" ADD COLUMN IF NOT EXISTS "change_reason" "text";
ALTER TABLE "public"."brm_config_versions" ADD COLUMN IF NOT EXISTS "change_reason" "text";
