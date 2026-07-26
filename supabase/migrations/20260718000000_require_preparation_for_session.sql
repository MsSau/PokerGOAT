-- Require a Preparation Check-in before a session can start, and link the
-- specific check-in used to the session it authorized (PRD §5's
-- "Preparation Check-in -> Optional Pre-Game Ritual -> Preparation Medal ->
-- Start Session" flow). sessions.preparation_id already existed as an FK to
-- preparation_records but nothing ever populated it; this migration makes
-- perform_start_session require and consume one preparation_records row per
-- session, mirroring the existing "max two sessions per poker day" pattern
-- of enforcing gates in the RPC itself, not just the UI.

-- A preparation record may back at most one session — enforced at the DB
-- level as a backstop against a race, in addition to the explicit check
-- inside perform_start_session below.
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_preparation_id_unique"
  ON "public"."sessions" ("preparation_id")
  WHERE "preparation_id" IS NOT NULL;

-- CREATE OR REPLACE FUNCTION can extend a parameter list without dropping
-- the function first, as long as the new parameter is appended at the end
-- with a default — this keeps existing grants intact.
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

  -- Max two sessions per poker day is enforced here, not just in the UI
  if (
    select count(*) from sessions s
    join session_contracts sc on sc.id = s.contract_id
    where s.player_id = v_player_id
      and s.start_time >= now() - interval '24 hours'
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

ALTER FUNCTION "public"."perform_start_session"("p_contract_id" "uuid", "p_preparation_id" "uuid") OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."perform_start_session"("p_contract_id" "uuid", "p_preparation_id" "uuid") TO "authenticated";
