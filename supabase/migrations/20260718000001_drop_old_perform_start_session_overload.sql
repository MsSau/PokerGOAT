-- CREATE OR REPLACE FUNCTION with an appended defaulted parameter creates a
-- new overload rather than replacing the existing one (confirmed via
-- `supabase db dump` after applying 20260718000000: both the old 1-arg and
-- new 2-arg perform_start_session existed side by side). The old 1-arg
-- overload has no Preparation Check-in gate at all, so leaving it in place
-- would let any direct RPC caller bypass the requirement added in the
-- previous migration. Drop it so perform_start_session(uuid, uuid) is the
-- only entry point.
DROP FUNCTION IF EXISTS "public"."perform_start_session"("p_contract_id" "uuid");
