-- session_contract_substitutions only ever recorded a permitted buy-in
-- *count* (replacement_permitted_buy_ins), never the monetary amount the
-- player entered when validating the substitution against BRM's flat
-- per-tournament cap. Storing it lets TournamentLog's "Log Buy-in" action
-- prefill the first entry against the replacement tournament from what was
-- already entered at substitution time, instead of asking the player to
-- retype it. Nullable: substitutions recorded before this column existed
-- have no amount on file, which is fine — "Log Buy-in" just falls back to
-- an empty, player-filled input in that case.
ALTER TABLE "public"."session_contract_substitutions"
  ADD COLUMN IF NOT EXISTS "replacement_buy_in_amount" numeric;
