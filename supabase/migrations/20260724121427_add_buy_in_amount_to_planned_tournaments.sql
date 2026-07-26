-- Weekly Game Plan / Session Contract tournaments so far only carried a buy-in
-- *count* (permitted_buy_ins / intended_buy_ins) — no planned monetary amount.
-- This adds a planned buy_in_amount alongside that count, on all four
-- fixed-slot/conditional tables (Weekly Game Plan level and its Session
-- Contract copy), so the amount can be set once when planning the week and
-- prefilled automatically when the player actually logs a buy-in during play
-- (src/components/TournamentLog.tsx), instead of retyping it every time.
-- Nullable + no default: a plan authored before this column existed (or one
-- where the coach/player hasn't set an amount yet) has no planned amount to
-- prefill, and TournamentLog falls back to an empty, player-filled input in
-- that case — this is additive, never a required field at the DB level.
ALTER TABLE "public"."weekly_game_plan_tournaments"
  ADD COLUMN IF NOT EXISTS "buy_in_amount" numeric;

ALTER TABLE "public"."weekly_game_plan_conditional_tournaments"
  ADD COLUMN IF NOT EXISTS "buy_in_amount" numeric;

ALTER TABLE "public"."session_contract_tournaments"
  ADD COLUMN IF NOT EXISTS "buy_in_amount" numeric;

ALTER TABLE "public"."session_contract_conditional_tournaments"
  ADD COLUMN IF NOT EXISTS "buy_in_amount" numeric;

-- DEV-ONLY backfill: sets 5500 on every existing row that predates this
-- column, so current in-progress test Weekly Game Plans/Session Contracts
-- don't hit a missing-amount case while exercising the new flow. On a fresh
-- database (no pre-existing rows) these are no-ops. New rows created going
-- forward always carry a real, explicitly-set amount from WeeklyGamePlanView.
UPDATE "public"."weekly_game_plan_tournaments" SET "buy_in_amount" = 5500 WHERE "buy_in_amount" IS NULL;
UPDATE "public"."weekly_game_plan_conditional_tournaments" SET "buy_in_amount" = 5500 WHERE "buy_in_amount" IS NULL;
UPDATE "public"."session_contract_tournaments" SET "buy_in_amount" = 5500 WHERE "buy_in_amount" IS NULL;
UPDATE "public"."session_contract_conditional_tournaments" SET "buy_in_amount" = 5500 WHERE "buy_in_amount" IS NULL;
