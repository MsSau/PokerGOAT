-- Reverts 20260724115748_dev_relax_session_cap.sql, per that file's own
-- "TO REVERT" instructions: re-applies 20260720063139_fix_poker_day_session_
-- cap.sql's CREATE OR REPLACE FUNCTION body verbatim (>= 2, not >= 1000).
-- That migration was explicitly DEV-ONLY and self-documented as something
-- to undo "before any real player-facing usage" — a deployment-readiness
-- pass is exactly that point. The two-sessions-per-Poker-Day cap is a real
-- PRD-specified guardrail, not dead code.
--
-- NOT auto-applied to the shared dev/test Supabase project by this branch's
-- setup work — re-enabling the real cap changes live behavior for whoever
-- is currently testing against it, which is a product decision, not a repo-
-- hygiene one. Apply this migration when actually promoting toward
-- production use.
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

  select coalesce(timezone, 'UTC') into v_player_timezone
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

  -- Max two sessions per Poker Day is enforced here, not just in the UI
  if (
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
