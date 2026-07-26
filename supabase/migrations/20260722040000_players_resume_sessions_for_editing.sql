-- Adds the reverse transition of "Players stop own active sessions"
-- (REVIEW_PENDING -> ACTIVE), so a player can back out of the post-session
-- review to fix/add tournament entries in TournamentLog before finalizing
-- (SessionReview.tsx's confirm-entries step, "Edit Entries" button beside
-- "Confirmed"). A second permissive policy, not a rewrite of the existing
-- one-way policy — Postgres OR's multiple permissive policies for the same
-- command together, so this purely adds capability without touching the
-- forward transition's own USING/WITH CHECK clauses.
--
-- Once a session reaches FINALIZED, fn_check_session_finalized's BEFORE
-- UPDATE trigger on sessions blocks any mutation regardless of RLS, so this
-- can never be used to un-finalize a session — only to step back from
-- REVIEW_PENDING to ACTIVE before perform_end_session has run.
CREATE POLICY "Players resume own sessions for editing" ON "public"."sessions" FOR UPDATE
  USING ((("player_id" = "auth"."uid"()) AND ("status" = 'REVIEW_PENDING'::"public"."session_status")))
  WITH CHECK ((("player_id" = "auth"."uid"()) AND ("status" = 'ACTIVE'::"public"."session_status")));
