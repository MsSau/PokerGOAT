-- "Players insert own occurrence records" (initial schema) only checked that
-- the occurrence's session belongs to the player — nothing stopped a client
-- from inserting a row for a genuinely hard-gated execution_action with
-- hard_gate_triggered/is_non_compliant set to false, lying about their own
-- violation's severity.
--
-- perform_end_session's own scoring never trusts this stored column (its
-- escalation walk re-joins execution_actions.is_hard_gate fresh every time),
-- so this could never rig a medal or Verdict. What it could do: coachBrief.ts's
-- fetchCriticalAlerts filters directly on the stored column
-- (`.or('is_non_compliant.eq.true,hard_gate_triggered.eq.true')`), so a faked
-- row would silently never appear in the coach's Critical Alerts list, even
-- though the player's own Verdict correctly reflects the hard gate.
--
-- Only hard_gate_triggered is constrained here, not is_non_compliant —
-- tournaments.ts's recordExecutionOccurrence() always sets is_non_compliant
-- true for SYSTEM_DETECTED occurrences regardless of the action's hard-gate
-- status (a system-detected, non-hard-gated action is still legitimately
-- "non-compliant"), so coupling it to is_hard_gate would reject that
-- currently-valid insert shape. hard_gate_triggered is the one column whose
-- falsification actually suppressed the coach-alert filter above.
DROP POLICY IF EXISTS "Players insert own occurrence records" ON "public"."execution_action_occurrences";

CREATE POLICY "Players insert own occurrence records" ON "public"."execution_action_occurrences"
  FOR INSERT WITH CHECK (
    ("session_id" IN ( SELECT "sessions"."id" FROM "public"."sessions" WHERE ("sessions"."player_id" = "auth"."uid"()) ))
    AND ("hard_gate_triggered" = COALESCE(
      ( SELECT "execution_actions"."is_hard_gate" FROM "public"."execution_actions" WHERE "execution_actions"."id" = "execution_action_id" ),
      false
    ))
  );
