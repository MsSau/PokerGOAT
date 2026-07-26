-- Workflow & Trust-Boundary Audit, finding H2: rls_auto_enable() has
-- existed as a function body since the initial schema, but nothing ever
-- attached it to ddl_command_end — CLAUDE.md's claim that new tables get
-- RLS automatically was only ever true if someone ran this by hand against
-- the live database. brm_level_slot_rules (20260721020000) is the
-- confirmed casualty: its CREATE POLICY statements exist but are inert on
-- a fresh migration replay because RLS was never enabled on the table.
--
-- Binding the trigger only protects tables created from this point
-- forward, so brm_level_slot_rules also gets enabled retroactively here —
-- confirmed (via a full diff of every CREATE TABLE against every ENABLE
-- ROW LEVEL SECURITY across supabase/migrations/) to be the only table
-- missing it.
CREATE EVENT TRIGGER "trg_rls_auto_enable" ON "ddl_command_end"
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

ALTER TABLE "public"."brm_level_slot_rules" ENABLE ROW LEVEL SECURITY;
