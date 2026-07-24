-- Two column-smuggling gaps found while auditing the tables perform_start_
-- session/perform_end_session (both SECURITY DEFINER) write to, in the same
-- family as 20260724020000's direct-session-insert bypass:
--
-- 1. sessions: "Players stop own active sessions" and "Players resume own
--    sessions for editing" (initial schema + 20260722040000) only constrain
--    player_id/status in their WITH CHECK clauses. RLS WITH CHECK does not
--    restrict which OTHER columns an UPDATE touches — combined with the
--    blanket `GRANT UPDATE ON sessions TO authenticated`, a player could
--    call `.update({ status: 'REVIEW_PENDING', execution_medal: 'GOLD',
--    outcome_medal: 'GOLD' })` directly and forge the exact fields
--    perform_end_session computes deterministically, without ever running
--    it. The only legitimate client-side updates (endSession.ts's
--    stopSessionForReview/resumeSessionForEditing) touch only status and
--    end_time, so restricting the grant to those two columns closes the
--    hole with no functional change.
--
-- 2. session_contracts: "Players manage own session contracts" has no
--    WITH CHECK beyond player_id and covers ALL commands, so a player could
--    UPDATE any column on their own contract at any time — including
--    forging status='LOCKED' directly, and (more seriously) rewriting
--    effective_session_loss_limit_at_creation/remaining_day_capacity_
--    snapshot/remaining_week_capacity_snapshot, which tournaments.ts's
--    computeRemainingCapacity() trusts as ground truth for the
--    loggedAfterStopLoss compliance flag. No client code ever calls
--    .update() or .delete() on session_contracts (creation is INSERT-only,
--    locking happens exclusively via the SECURITY DEFINER perform_start_
--    session RPC, which bypasses RLS/grants as the function owner) — so
--    revoking UPDATE/DELETE entirely removes the hole with no functional
--    change.

REVOKE UPDATE ON TABLE "public"."sessions" FROM "authenticated";
GRANT UPDATE ("status", "end_time") ON TABLE "public"."sessions" TO "authenticated";

REVOKE UPDATE, DELETE ON TABLE "public"."session_contracts" FROM "authenticated";
