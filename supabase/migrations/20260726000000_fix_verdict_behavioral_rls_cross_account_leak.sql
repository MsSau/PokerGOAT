-- Workflow & Trust-Boundary Audit, finding C2: verdict_evidence_items,
-- verdict_generation_context, behavioral_dimension_assessments, and
-- behavioral_pattern_evidence each had exactly one SELECT policy checking
-- only "does the parent row exist" (e.g. `verdict_id IN (SELECT id FROM
-- verdicts)`) rather than "does the parent row belong to me" — true for
-- every verdict/snapshot/pattern ever created, so any authenticated user
-- could read any other player's Verdict evidence and Behavioral Profile
-- data. Re-created here following the same established pattern every
-- correctly-scoped "Access via parent X" policy already uses elsewhere
-- (contract, review, thread, track); verdicts itself has no player_id
-- column, so the two verdict-scoped policies join through sessions the
-- same way the existing "Players/Coaches read own/their players' verdicts"
-- policies already do.
--
-- The original finding undercounted: querying live pg_policies for every
-- "Access via parent X"-shaped policy (not just the four named above)
-- turned up three more with the identical bug, all confirmed exploitable
-- against the live database directly (not just in the migration replay):
--   - session_execution_dimension_assessments (SELECT) — any authenticated
--     user could read any player's execution dimension ratings.
--   - tournament_mistakes — the ONE policy here has no `FOR SELECT`, i.e.
--     covers ALL commands, so this was read AND write/delete exposure:
--     any authenticated user could tamper with any player's tagged
--     mistakes on any tournament. Worst of the seven.
--   - framework_versions (SELECT) — any authenticated user could read any
--     coach's Performance Framework content regardless of relationship;
--     its INSERT/UPDATE policies were already correctly scoped to
--     coach_id = auth.uid(), only the read side was missing the check.
-- Fixed below using each table's own established ownership path — same
-- session_id -> sessions.player_id join session_execution_assessments'
-- own policies already use for the first two, and the same
-- coach-or-their-player check performance_frameworks' own read policy
-- already uses for the third.

DROP POLICY IF EXISTS "Access via parent verdict" ON "public"."verdict_evidence_items";
CREATE POLICY "Access via parent verdict" ON "public"."verdict_evidence_items" FOR SELECT USING (
  "verdict_id" IN (
    SELECT "v"."id"
    FROM "public"."verdicts" "v"
    JOIN "public"."sessions" "s" ON "s"."id" = "v"."session_id"
    WHERE ("s"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("s"."player_id")
  )
);

DROP POLICY IF EXISTS "Access via parent verdict context" ON "public"."verdict_generation_context";
CREATE POLICY "Access via parent verdict context" ON "public"."verdict_generation_context" FOR SELECT USING (
  "verdict_id" IN (
    SELECT "v"."id"
    FROM "public"."verdicts" "v"
    JOIN "public"."sessions" "s" ON "s"."id" = "v"."session_id"
    WHERE ("s"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("s"."player_id")
  )
);

DROP POLICY IF EXISTS "Access via parent snapshot" ON "public"."behavioral_dimension_assessments";
CREATE POLICY "Access via parent snapshot" ON "public"."behavioral_dimension_assessments" FOR SELECT USING (
  "snapshot_id" IN (
    SELECT "bps"."id"
    FROM "public"."behavioral_profile_snapshots" "bps"
    WHERE ("bps"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("bps"."player_id")
  )
);

DROP POLICY IF EXISTS "Access via parent pattern" ON "public"."behavioral_pattern_evidence";
CREATE POLICY "Access via parent pattern" ON "public"."behavioral_pattern_evidence" FOR SELECT USING (
  "pattern_id" IN (
    SELECT "bp"."id"
    FROM "public"."behavioral_patterns" "bp"
    WHERE ("bp"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("bp"."player_id")
  )
);

-- session_execution_dimension_assessments — same session_id -> sessions
-- join session_execution_assessments' own two policies ("Coaches read
-- their players execution assessments" / "Players read own execution
-- assessments") already use.
DROP POLICY IF EXISTS "Access via parent assessment" ON "public"."session_execution_dimension_assessments";
CREATE POLICY "Access via parent assessment" ON "public"."session_execution_dimension_assessments" FOR SELECT USING (
  "assessment_id" IN (
    SELECT "sea"."id"
    FROM "public"."session_execution_assessments" "sea"
    JOIN "public"."sessions" "s" ON "s"."id" = "sea"."session_id"
    WHERE ("s"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("s"."player_id")
  )
);

-- tournament_mistakes — no client code reads or writes this table today
-- (mistake tags only ever go through perform_end_session's SECURITY
-- DEFINER path), but PostgREST exposes it directly to any authenticated
-- caller regardless of what the app's own UI does, so the unscoped policy
-- was real read/write exposure, not just theoretical. No `FOR SELECT`
-- here (covers ALL commands) — matches "Access via parent contract"'s
-- style and tournaments' own "Players manage own tournaments" ALL policy.
DROP POLICY IF EXISTS "Access via parent tournament" ON "public"."tournament_mistakes";
CREATE POLICY "Access via parent tournament" ON "public"."tournament_mistakes" USING (
  "tournament_id" IN (
    SELECT "t"."id"
    FROM "public"."tournaments" "t"
    JOIN "public"."sessions" "s" ON "s"."id" = "t"."session_id"
    WHERE ("s"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("s"."player_id")
  )
);

-- framework_versions — SELECT only; INSERT ("Coaches manage own framework
-- versions") and UPDATE ("Coaches deactivate their own framework
-- versions") were already correctly scoped to coach_id = auth.uid(). Read
-- access mirrors performance_frameworks' own "Players read active
-- frameworks of their coach" policy: the owning coach, or a player whose
-- profiles.coach_id points at that coach.
DROP POLICY IF EXISTS "Read framework versions via parent access" ON "public"."framework_versions";
CREATE POLICY "Read framework versions via parent access" ON "public"."framework_versions" FOR SELECT USING (
  "framework_id" IN (
    SELECT "pf"."id"
    FROM "public"."performance_frameworks" "pf"
    WHERE ("pf"."coach_id" = "auth"."uid"())
       OR ("pf"."coach_id" = ( SELECT "profiles"."coach_id" FROM "public"."profiles" WHERE "profiles"."id" = "auth"."uid"() ))
  )
);
