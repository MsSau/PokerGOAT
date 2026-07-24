-- PRD §4 "Bankroll Accounting" describes an auditable ledger with capital
-- deposits/withdrawals stored separately from poker performance, but the
-- PRD itself never says who is allowed to log them, and until now
-- bankroll_ledger_entries only had "Players read own ledger" (SELECT) and
-- "Coaches manage their players' ledger" (ALL, via fn_is_coach_of) -- there
-- was no path for a player to record their own capital movement at all.
--
-- This is an intentional, explicitly-requested deviation from the PRD's
-- coach-only bankroll-editing posture: the player dashboard now lets a
-- player self-log a Deposit or Withdrawal against their own bankroll.
--
-- Scope is deliberately narrow:
--   - Only DEPOSIT/WITHDRAWAL are player-writable. OPENING_CAPITAL (the
--     starting ledger entry a coach establishes when onboarding a player)
--     and ADJUSTMENT (a coach's corrective entry) stay coach-only facts --
--     a player self-declaring either would let them silently reset their
--     own BRM band.
--   - player_id and recorded_by must both be the caller -- a player can
--     only log against their own bankroll, self-attributed, never on
--     another player's behalf.
--   - No UPDATE/DELETE for players. The ledger stays append-only for
--     everyone, same as every other evidentiary table in this schema; a
--     mis-entered deposit is corrected with a coach ADJUSTMENT, not edited
--     or deleted.
CREATE POLICY "Players log own capital deposits and withdrawals" ON "public"."bankroll_ledger_entries"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "player_id" = "auth"."uid"()
    AND "recorded_by" = "auth"."uid"()
    AND "entry_type" IN ('DEPOSIT', 'WITHDRAWAL')
  );

-- amount is always stored as a positive magnitude -- player_current_bankroll
-- flips the sign itself for WITHDRAWAL rows when summing. Enforce that at
-- the data layer rather than trusting every writer (player or coach) to
-- get the sign convention right.
ALTER TABLE "public"."bankroll_ledger_entries"
  ADD CONSTRAINT "bankroll_ledger_entries_amount_positive" CHECK ("amount" > 0);
