-- The two-sessions-per-Poker-Day cap (restored to real enforcement in
-- 20260726030000) needs a single, explicit exception for the demo account
-- used to showcase the product without hitting a real PRD guardrail mid-
-- demo. A dedicated profiles.is_demo flag (rather than hardcoding this
-- account's UUID inside perform_start_session) keeps the exception visible
-- in the schema and doesn't require a function edit if the demo account
-- ever changes — set once here for the current demo account
-- (saumyabharati18@gmail.com), toggled via this column going forward, not
-- by editing the function again.
ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false;

UPDATE "public"."profiles"
SET "is_demo" = true
WHERE "email" = 'saumyabharati18@gmail.com';

-- Body-only change to perform_start_session: skips the cap entirely for
-- is_demo accounts, everyone else unaffected. Everything else in the
-- function is unchanged from 20260726030000.
CREATE OR REPLACE FUNCTION "public"."perform_start_session"(
  "p_contract_id" "uuid",
  "p_preparation_id" "uuid" DEFAULT NULL
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_player_id uuid;
  v_status contract_status;
  v_session_id uuid := gen_random_uuid();
  v_player_timezone text;
  v_boundary_time time;
  v_now_local timestamp;
  v_local_date date;
  v_poker_day_start timestamptz;
  v_poker_day_end timestamptz;
  v_is_demo boolean;
begin
  select player_id, status into v_player_id, v_status
  from session_contracts
  where id = p_contract_id;

  if v_player_id is null then
    raise exception 'perform_start_session: contract % not found', p_contract_id;
  end if;

  if v_player_id <> auth.uid() then
    raise exception 'perform_start_session: not authorized for this contract';
  end if;

  if v_status = 'LOCKED' then
    raise exception 'perform_start_session: contract already locked';
  end if;

  if p_preparation_id is null then
    raise exception 'perform_start_session: a Preparation Check-in is required before starting a session';
  end if;

  if not exists (
    select 1 from preparation_records
    where id = p_preparation_id and player_id = v_player_id
  ) then
    raise exception 'perform_start_session: preparation record % not found for this player', p_preparation_id;
  end if;

  if exists (select 1 from sessions where preparation_id = p_preparation_id) then
    raise exception 'perform_start_session: this Preparation Check-in has already been used to start a session';
  end if;

  -- Resolve this player's actual Poker Day boundary (defaults to 10:00:00,
  -- mirroring the client-side fallback) and their declared timezone.
  select coalesce(pwbc.poker_day_boundary_time, '10:00:00'::time)
  into v_boundary_time
  from session_contracts sc
  join weekly_game_plans wgp on wgp.id = sc.weekly_game_plan_id
  join poker_weeks pw on pw.id = wgp.poker_week_id
  left join poker_week_boundary_configs pwbc on pwbc.id = pw.boundary_config_id
  where sc.id = p_contract_id;

  if v_boundary_time is null then
    v_boundary_time := '10:00:00'::time;
  end if;

  select coalesce(timezone, 'UTC'), coalesce(is_demo, false) into v_player_timezone, v_is_demo
  from profiles where id = v_player_id;

  -- "Today" (the current Poker Day) starts at the most recent boundary
  -- crossing in the player's local time, not at midnight and not on a
  -- rolling 24h lookback from now().
  v_now_local := (now() at time zone v_player_timezone);
  v_local_date := v_now_local::date;
  if v_now_local::time < v_boundary_time then
    v_local_date := v_local_date - 1;
  end if;
  v_poker_day_start := (v_local_date + v_boundary_time) at time zone v_player_timezone;
  v_poker_day_end := v_poker_day_start + interval '1 day';

  -- Max two sessions per Poker Day is enforced here, not just in the UI —
  -- except for the demo account (see this migration's header), which is
  -- exempt so a live demo never trips a real PRD guardrail.
  if not v_is_demo and (
    select count(*) from sessions s
    join session_contracts sc on sc.id = s.contract_id
    where s.player_id = v_player_id
      and s.start_time >= v_poker_day_start
      and s.start_time < v_poker_day_end
  ) >= 2 then
    raise exception 'perform_start_session: maximum two sessions per poker day already reached';
  end if;

  update session_contracts
  set status = 'LOCKED', locked_at = now()
  where id = p_contract_id;

  insert into sessions (id, player_id, contract_id, status, start_time, preparation_id)
  values (v_session_id, v_player_id, p_contract_id, 'ACTIVE', now(), p_preparation_id);

  -- Pre-authorize a tournament shell for every tournament the player picked
  -- into this Session Contract, so it's already visible (as "authorized",
  -- not unauthorized/unplanned) the moment the session starts, instead of
  -- the player having to retype the same name in the Tournament Log. No
  -- buy-in $ amount exists anywhere upstream of this (Weekly Game Plan /
  -- Session Contract only carry a permitted/intended *count*), so the first
  -- tournament_entries row — the actual capital-at-risk record — still has
  -- to be logged by the player once they buy in; never fabricate a $ amount.
  insert into tournaments (id, session_id, name, is_unplanned, is_unauthorized)
  select gen_random_uuid(), v_session_id, sct.tournament_name, false, false
  from session_contract_tournaments sct
  where sct.session_contract_id = p_contract_id;

  return jsonb_build_object('session_id', v_session_id, 'contract_id', p_contract_id, 'locked_at', now());
end;
$$;
