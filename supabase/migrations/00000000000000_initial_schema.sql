


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."autonomy_mode" AS ENUM (
    'RECOMMEND_ONLY',
    'AUTO_ASSIGN'
);


ALTER TYPE "public"."autonomy_mode" OWNER TO "postgres";


CREATE TYPE "public"."brief_validation" AS ENUM (
    'AGREE',
    'PARTIALLY_AGREE',
    'DISAGREE'
);


ALTER TYPE "public"."brief_validation" OWNER TO "postgres";


CREATE TYPE "public"."brm_status" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);


ALTER TYPE "public"."brm_status" OWNER TO "postgres";


CREATE TYPE "public"."contract_status" AS ENUM (
    'DRAFT',
    'VALIDATED',
    'LOCKED'
);


ALTER TYPE "public"."contract_status" OWNER TO "postgres";


CREATE TYPE "public"."dimension_type" AS ENUM (
    'DISCIPLINE_PROCESS',
    'TECHNICAL_PLAY',
    'MENTAL_GAME',
    'LEARNING_IMPROVEMENT',
    'PREPARATION',
    'OUTCOMES'
);


ALTER TYPE "public"."dimension_type" OWNER TO "postgres";


CREATE TYPE "public"."entry_status" AS ENUM (
    'COMPLETED',
    'VOID',
    'NON_COMPLIANT'
);


ALTER TYPE "public"."entry_status" OWNER TO "postgres";


CREATE TYPE "public"."execution_action_status" AS ENUM (
    'PLAYER_PROPOSED',
    'COACH_APPROVED',
    'CANONICAL_ACTIVE',
    'INACTIVE'
);


ALTER TYPE "public"."execution_action_status" OWNER TO "postgres";


CREATE TYPE "public"."framework_status" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);


ALTER TYPE "public"."framework_status" OWNER TO "postgres";


CREATE TYPE "public"."intervention_status" AS ENUM (
    'ASSIGNED',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE "public"."intervention_status" OWNER TO "postgres";


CREATE TYPE "public"."ledger_entry_type" AS ENUM (
    'OPENING_CAPITAL',
    'DEPOSIT',
    'WITHDRAWAL',
    'ADJUSTMENT'
);


ALTER TYPE "public"."ledger_entry_type" OWNER TO "postgres";


CREATE TYPE "public"."medal_type" AS ENUM (
    'GOLD',
    'SILVER',
    'BRONZE',
    'NONE'
);


ALTER TYPE "public"."medal_type" OWNER TO "postgres";


CREATE TYPE "public"."review_status" AS ENUM (
    'LOCKED',
    'DRAFT'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


CREATE TYPE "public"."role_type" AS ENUM (
    'PLAYER',
    'COACH'
);


ALTER TYPE "public"."role_type" OWNER TO "postgres";


CREATE TYPE "public"."sender_type" AS ENUM (
    'PLAYER',
    'AI',
    'SYSTEM'
);


ALTER TYPE "public"."sender_type" OWNER TO "postgres";


CREATE TYPE "public"."session_status" AS ENUM (
    'ACTIVE',
    'REVIEW_PENDING',
    'FINALIZED'
);


ALTER TYPE "public"."session_status" OWNER TO "postgres";


CREATE TYPE "public"."severity_type" AS ENUM (
    'MINOR',
    'MAJOR',
    'CRITICAL'
);


ALTER TYPE "public"."severity_type" OWNER TO "postgres";


CREATE TYPE "public"."verdict_classification" AS ENUM (
    'PROFESSIONAL_WIN',
    'PROFESSIONAL_LOSS',
    'LUCKY_ESCAPE',
    'DESERVED_LOSS',
    'MIXED_SESSION',
    'INSUFFICIENT_EVIDENCE'
);


ALTER TYPE "public"."verdict_classification" OWNER TO "postgres";


CREATE TYPE "public"."wgp_status" AS ENUM (
    'DRAFT',
    'LOCKED'
);


ALTER TYPE "public"."wgp_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_check_priority_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (SELECT COUNT(*) FROM public.coaching_priorities WHERE player_id = NEW.player_id AND status = 'ACTIVE') >= 3 THEN
        RAISE EXCEPTION 'Maximum 3 active coaching priorities allowed.';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_check_priority_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_check_session_finalized"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    target_session_id UUID;
    session_status session_status;
BEGIN
    IF TG_TABLE_NAME = 'sessions' THEN target_session_id := OLD.id;
    ELSIF TG_TABLE_NAME = 'tournaments' THEN target_session_id := COALESCE(NEW.session_id, OLD.session_id);
    ELSIF TG_TABLE_NAME = 'tournament_entries' THEN
        SELECT session_id INTO target_session_id FROM public.tournaments WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);
    END IF;

    SELECT status INTO session_status FROM public.sessions WHERE id = target_session_id;
    IF session_status = 'FINALIZED' THEN
        RAISE EXCEPTION 'FINALIZED_IMMUTABILITY_VIOLATION: Direct mutation of finalized session content is prohibited.';
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_check_session_finalized"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_enforce_version_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF OLD.is_activated = true THEN
        IF (to_jsonb(NEW) - 'is_activated') IS DISTINCT FROM (to_jsonb(OLD) - 'is_activated') THEN
            RAISE EXCEPTION 'ACTIVATED_VERSION_IMMUTABLE: cannot modify the content of an activated version (table: %). Create a new version instead.', TG_TABLE_NAME;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_enforce_version_immutability"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."player_accountability_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "motivators" "jsonb",
    "aversions" "jsonb",
    "preferred_methods" "jsonb",
    "ineffective_past" "jsonb",
    "prohibited_types" "jsonb",
    "coach_notes" "text",
    "boundaries" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."player_accountability_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_get_accountability_profile"("target_player_id" "uuid") RETURNS SETOF "public"."player_accountability_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'COACH' AND id = (SELECT coach_id FROM public.profiles WHERE id = target_player_id)) THEN
        RETURN QUERY SELECT * FROM public.player_accountability_profiles WHERE player_id = target_player_id;
    ELSE
        RAISE EXCEPTION 'Access Denied.';
    END IF;
END;
$$;


ALTER FUNCTION "public"."fn_get_accountability_profile"("target_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_handle_supersession"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.supersedes_id IS NOT NULL THEN
        -- Check if we are superseding the current one
        IF NOT EXISTS (SELECT 1 FROM public.verdicts WHERE id = NEW.supersedes_id AND is_current = true) THEN
            RAISE EXCEPTION 'Must supersede the current version.';
        END IF;
        -- Set old to not current
        UPDATE public.verdicts SET is_current = false WHERE id = NEW.supersedes_id;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_handle_supersession"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_is_coach_of"("target_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = target_player_id AND coach_id = auth.uid()
    );
$$;


ALTER FUNCTION "public"."fn_is_coach_of"("target_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_prevent_version_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RAISE EXCEPTION 'VERSION_DELETE_FORBIDDEN: version rows are permanent audit history and cannot be deleted (table: %).', TG_TABLE_NAME;
END;
$$;


ALTER FUNCTION "public"."fn_prevent_version_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_end_session"("p_session_id" "uuid", "p_final_pnl" numeric, "p_outcome_medal" "text", "p_outcome_brm_compliant" boolean, "p_outcome_hard_gate_triggered" boolean, "p_execution_medal" "text", "p_execution_hard_gate_triggered" boolean, "p_dimension_ratings" "jsonb", "p_verdict_classification" "text", "p_verdict_headline" "text", "p_verdict_evidence" "jsonb", "p_tournament_finishes" "jsonb", "p_mistake_tags" "jsonb", "p_escalation_updates" "jsonb", "p_coaching_priorities_snapshot" "jsonb" DEFAULT '[]'::"jsonb", "p_behavioral_snapshot_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_player_id UUID;
    v_contract_id UUID;
    v_brm_assignment_id UUID;
    v_rule_version_id UUID;
    v_taxonomy_version_id UUID;
    v_framework_version_id UUID;
    v_prep_record_id UUID;
    v_escalation_rule_version_id UUID;

    v_t_id TEXT;
    v_finish JSONB;
    v_total_cost NUMERIC;

    v_tag JSONB;
    v_eao_id UUID;

    v_esc JSONB;
    v_track_id UUID;

    v_exec_assessment_id UUID := gen_random_uuid();
    v_outcome_assessment_id UUID := gen_random_uuid();
    v_verdict_id UUID := gen_random_uuid();
    v_dim JSONB;
BEGIN
    -- 0. Resolve required foreign keys — fail loudly if anything is missing,
    -- never insert a placeholder into a NOT NULL/FK column.
    SELECT player_id, contract_id, preparation_id
    INTO v_player_id, v_contract_id, v_prep_record_id
    FROM sessions WHERE id = p_session_id;

    IF v_player_id IS NULL THEN
        RAISE EXCEPTION 'perform_end_session: session % not found', p_session_id;
    END IF;

    SELECT brm_assignment_id, framework_version_id
    INTO v_brm_assignment_id, v_framework_version_id
    FROM session_contracts WHERE id = v_contract_id;

    SELECT brm_config_version_id INTO v_rule_version_id
    FROM weekly_brm_assignments WHERE id = v_brm_assignment_id;

    IF v_rule_version_id IS NULL THEN
        RAISE EXCEPTION 'perform_end_session: could not resolve rule_version_id from brm_assignment %', v_brm_assignment_id;
    END IF;

    SELECT id INTO v_taxonomy_version_id FROM taxonomy_versions WHERE is_activated = true LIMIT 1;
    IF v_taxonomy_version_id IS NULL THEN
        RAISE EXCEPTION 'perform_end_session: no active taxonomy_version found';
    END IF;

    SELECT id INTO v_escalation_rule_version_id FROM escalation_rule_versions WHERE is_activated = true LIMIT 1;
    IF v_escalation_rule_version_id IS NULL THEN
        RAISE EXCEPTION 'perform_end_session: no active escalation_rule_version found';
    END IF;

    -- 1. Finalize each tournament + attribute return to the final entry.
    -- (Session status is intentionally NOT set to FINALIZED yet — the
    -- fn_check_session_finalized trigger blocks tournament/entry writes
    -- once a session is finalized, so this must run while status is still
    -- ACTIVE/REVIEW_PENDING. Session status flips to FINALIZED as the very
    -- last step below, once everything else is genuinely complete.)
    FOR v_t_id, v_finish IN SELECT key, value FROM jsonb_each(p_tournament_finishes) LOOP
        UPDATE tournaments
        SET winnings_gross = (v_finish->>'winnings_gross')::NUMERIC,
            best_rank = (v_finish->>'best_rank')::INT,
            itm_yn = (v_finish->>'itm_yn')::BOOLEAN,
            final_table_yn = (v_finish->>'final_table_yn')::BOOLEAN,
            comments = v_finish->>'comments'
        WHERE id = v_t_id::UUID;

        SELECT SUM(investment) INTO v_total_cost FROM tournament_entries WHERE tournament_id = v_t_id::UUID;

        UPDATE tournaments
        SET net_return = (v_finish->>'winnings_gross')::NUMERIC - COALESCE(v_total_cost, 0)
        WHERE id = v_t_id::UUID;

        -- All entries for this tournament are now complete (real enum: COMPLETED / VOID / NON_COMPLIANT — never 'BUSTED')
        UPDATE tournament_entries
        SET status = 'COMPLETED',
            completion_timestamp = COALESCE(completion_timestamp, NOW())
        WHERE tournament_id = v_t_id::UUID;

        -- Return attributed to the final/surviving entry; cost already spread across all entries via investment
        UPDATE tournament_entries
        SET return_amount = (v_finish->>'winnings_gross')::NUMERIC
        WHERE id = (
            SELECT id FROM tournament_entries
            WHERE tournament_id = v_t_id::UUID
            ORDER BY entry_sequence DESC LIMIT 1
        );
    END LOOP;

    -- 2. Mistake tags -> execution_action_occurrences (+ tournament_mistakes join)
    FOR v_tag IN SELECT * FROM jsonb_array_elements(p_mistake_tags) LOOP
        v_eao_id := gen_random_uuid();

        INSERT INTO execution_action_occurrences (
            id, execution_action_id, session_id, tournament_id, tournament_entry_id,
            is_non_compliant, hard_gate_triggered, escalation_stage_produced,
            detected_via, occurred_at
        ) VALUES (
            v_eao_id,
            (v_tag->>'execution_action_id')::UUID,
            p_session_id,
            NULLIF(v_tag->>'tournament_id', '')::UUID,
            NULL,
            false, false, NULL,
            'PLAYER_TAGGED', NOW()
        );

        IF (v_tag->>'tournament_id') IS NOT NULL AND (v_tag->>'tournament_id') <> '' THEN
            INSERT INTO tournament_mistakes (id, tournament_id, execution_action_occurrence_id)
            VALUES (gen_random_uuid(), (v_tag->>'tournament_id')::UUID, v_eao_id);
        END IF;
    END LOOP;

    -- 3. Escalation: apply the already-computed stage transitions
    FOR v_esc IN SELECT * FROM jsonb_array_elements(p_escalation_updates) LOOP
        SELECT id INTO v_track_id FROM escalation_tracks
        WHERE player_id = v_player_id AND execution_action_id = (v_esc->>'execution_action_id')::UUID;

        IF v_track_id IS NULL THEN
            v_track_id := gen_random_uuid();
            INSERT INTO escalation_tracks (id, player_id, execution_action_id, current_stage_index, last_occurrence_at)
            VALUES (v_track_id, v_player_id, (v_esc->>'execution_action_id')::UUID, (v_esc->>'new_stage')::INT, NOW());
        ELSE
            UPDATE escalation_tracks
            SET current_stage_index = (v_esc->>'new_stage')::INT, last_occurrence_at = NOW()
            WHERE id = v_track_id;
        END IF;

        INSERT INTO escalation_events (id, track_id, rule_version_id, old_stage, new_stage, satisfied_conditions, created_at)
        VALUES (
            gen_random_uuid(), v_track_id, v_escalation_rule_version_id,
            (v_esc->>'old_stage')::INT, (v_esc->>'new_stage')::INT,
            v_esc->'satisfied_conditions', NOW()
        );
    END LOOP;

    -- 4. Execution assessment + its four dimension ratings
    INSERT INTO session_execution_assessments (
        id, session_id, revision_number, is_current, taxonomy_version_id,
        hard_gate_triggered, system_execution_medal, final_execution_medal, created_at
    ) VALUES (
        v_exec_assessment_id, p_session_id, 1, true, v_taxonomy_version_id,
        p_execution_hard_gate_triggered, p_execution_medal::medal_type, p_execution_medal::medal_type, NOW()
    );

    FOR v_dim IN SELECT * FROM jsonb_array_elements(p_dimension_ratings) LOOP
        INSERT INTO session_execution_dimension_assessments (id, assessment_id, dimension, system_rating, final_rating)
        VALUES (
            gen_random_uuid(), v_exec_assessment_id,
            (v_dim->>'dimension')::dimension_type,
            v_dim->>'rating', v_dim->>'rating'
        );
    END LOOP;

    -- 5. Outcome assessment
    INSERT INTO session_outcome_assessments (
        id, session_id, revision_number, is_current, rule_version_id,
        final_session_net_pnl, brm_compliance, hard_gate_triggered, system_outcome_medal, created_at
    ) VALUES (
        v_outcome_assessment_id, p_session_id, 1, true, v_rule_version_id,
        p_final_pnl, p_outcome_brm_compliant, p_outcome_hard_gate_triggered, p_outcome_medal::medal_type, NOW()
    );

    -- 6. Verdict + evidence + generation context
    INSERT INTO verdicts (id, session_id, revision_number, is_current, classification, headline, created_at)
    VALUES (v_verdict_id, p_session_id, 1, true, p_verdict_classification::verdict_classification, p_verdict_headline, NOW());

    -- evidence_entity_id is NOT NULL, but the client can't know
    -- v_exec_assessment_id / v_outcome_assessment_id until this function
    -- generates them above — fall back to resolving by entity_type here
    -- whenever the client leaves it unset.
    INSERT INTO verdict_evidence_items (id, verdict_id, section, claim_text, confidence_level, evidence_entity_type, evidence_entity_id, created_at)
    SELECT gen_random_uuid(), v_verdict_id,
           e->>'section', e->>'claim_text', e->>'confidence_level',
           e->>'evidence_entity_type',
           COALESCE(
             (e->>'evidence_entity_id')::UUID,
             CASE e->>'evidence_entity_type'
               WHEN 'session_execution_assessment' THEN v_exec_assessment_id
               WHEN 'session_outcome_assessment' THEN v_outcome_assessment_id
             END
           ),
           NOW()
    FROM jsonb_array_elements(p_verdict_evidence) AS e;

    INSERT INTO verdict_generation_context (
        id, verdict_id, framework_version_id, brm_assignment_id, prep_record_id,
        execution_assessment_id, outcome_assessment_id, coaching_priorities_snapshot,
        behavioral_snapshot_id, created_at
    ) VALUES (
        gen_random_uuid(), v_verdict_id, v_framework_version_id, v_brm_assignment_id, v_prep_record_id,
        v_exec_assessment_id, v_outcome_assessment_id, p_coaching_priorities_snapshot,
        p_behavioral_snapshot_id, NOW()
    );

    -- 7. Finalize the session — LAST, on purpose. Everything above has now
    -- genuinely completed, so it's safe to flip status to FINALIZED without
    -- the fn_check_session_finalized trigger blocking any of the writes
    -- above it (that trigger only blocks tournament/entry mutation once the
    -- session is ALREADY finalized — it does not run against sessions
    -- itself, and by this point nothing further in this function touches
    -- tournaments or tournament_entries).
    UPDATE sessions
    SET status = 'FINALIZED',
        end_time = NOW(),
        execution_medal = p_execution_medal::medal_type,
        outcome_medal = p_outcome_medal::medal_type
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'verdict_id', v_verdict_id,
        'execution_assessment_id', v_exec_assessment_id,
        'outcome_assessment_id', v_outcome_assessment_id
    );
END;
$$;


ALTER FUNCTION "public"."perform_end_session"("p_session_id" "uuid", "p_final_pnl" numeric, "p_outcome_medal" "text", "p_outcome_brm_compliant" boolean, "p_outcome_hard_gate_triggered" boolean, "p_execution_medal" "text", "p_execution_hard_gate_triggered" boolean, "p_dimension_ratings" "jsonb", "p_verdict_classification" "text", "p_verdict_headline" "text", "p_verdict_evidence" "jsonb", "p_tournament_finishes" "jsonb", "p_mistake_tags" "jsonb", "p_escalation_updates" "jsonb", "p_coaching_priorities_snapshot" "jsonb", "p_behavioral_snapshot_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."perform_start_session"("p_contract_id" "uuid") RETURNS "jsonb"
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

  insert into sessions (id, player_id, contract_id, status, start_time)
  values (v_session_id, v_player_id, p_contract_id, 'ACTIVE', now());

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


ALTER FUNCTION "public"."perform_start_session"("p_contract_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bankroll_ledger_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "entry_type" "public"."ledger_entry_type" NOT NULL,
    "amount" numeric NOT NULL,
    "note" "text",
    "recorded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."bankroll_ledger_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."behavioral_dimension_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_id" "uuid" NOT NULL,
    "dimension" "public"."dimension_type" NOT NULL,
    "radar_index" integer,
    "state" "text" NOT NULL,
    "trend" "text" NOT NULL,
    "confidence" numeric NOT NULL,
    "strongest_positive_signal" "text",
    "biggest_concern" "text",
    "recurring_patterns" "jsonb",
    "related_coaching_points" "jsonb",
    "supporting_evidence" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "evidence_window" "text" DEFAULT 'RECENT'::"text" NOT NULL,
    "radar_methodology_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    CONSTRAINT "behavioral_dimension_assessments_evidence_window_check" CHECK (("evidence_window" = ANY (ARRAY['RECENT'::"text", 'SHORT_TERM'::"text", 'QUARTER'::"text", 'LONG_TERM'::"text"]))),
    CONSTRAINT "behavioral_dimension_assessments_radar_index_check" CHECK ((("radar_index" >= 0) AND ("radar_index" <= 100)))
);


ALTER TABLE "public"."behavioral_dimension_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."behavioral_pattern_evidence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pattern_id" "uuid" NOT NULL,
    "evidence_entity_type" "text" NOT NULL,
    "evidence_entity_id" "uuid" NOT NULL,
    "note" "text"
);


ALTER TABLE "public"."behavioral_pattern_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."behavioral_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "snapshot_id" "uuid",
    "pattern_type" "text" NOT NULL,
    "description" "text" NOT NULL,
    "confidence" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "behavioral_patterns_pattern_type_check" CHECK (("pattern_type" = ANY (ARRAY['REPETITION'::"text", 'CONTEXTUAL'::"text", 'SEQUENCE'::"text", 'CONTRADICTION'::"text"])))
);


ALTER TABLE "public"."behavioral_patterns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."behavioral_profile_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "snapshot_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "behavioral_profile_snapshots_type_check" CHECK (("snapshot_type" = ANY (ARRAY['PROVISIONAL'::"text", 'WEEKLY'::"text", 'FRAMEWORK_END'::"text"])))
);


ALTER TABLE "public"."behavioral_profile_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brm_bankroll_bands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "min_bankroll" numeric NOT NULL,
    "max_bankroll" numeric NOT NULL,
    "session_stop_loss" numeric NOT NULL,
    "day_stop_loss" numeric NOT NULL,
    "week_stop_loss" numeric NOT NULL,
    "level_index" integer NOT NULL
);


ALTER TABLE "public"."brm_bankroll_bands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brm_config_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "config_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "is_activated" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brm_config_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brm_configurations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL
);


ALTER TABLE "public"."brm_configurations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brm_levels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "level_index" integer NOT NULL,
    "max_tournament_buy_in" numeric,
    "max_session_exposure" numeric
);


ALTER TABLE "public"."brm_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_directives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "review_id" "uuid",
    "directive_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_directives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "review_id" "uuid",
    "note_type" "text" DEFAULT 'GENERAL'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_review_agreed_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coach_review_agreed_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coach_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "status" "public"."review_status" DEFAULT 'DRAFT'::"public"."review_status" NOT NULL,
    "next_review_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "brief_validation" "public"."brief_validation",
    "validation_note" "text"
);


ALTER TABLE "public"."coach_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coaching_priorities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "review_id" "uuid",
    "description" "text" NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."coaching_priorities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deep_analysis_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_type" "public"."sender_type" NOT NULL,
    "content" "text" NOT NULL,
    "evidence_context_reference" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."deep_analysis_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deep_analysis_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "verdict_id" "uuid",
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."deep_analysis_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "track_id" "uuid" NOT NULL,
    "rule_version_id" "uuid" NOT NULL,
    "old_stage" integer NOT NULL,
    "new_stage" integer NOT NULL,
    "satisfied_conditions" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."escalation_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_rule_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_number" integer NOT NULL,
    "is_activated" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."escalation_rule_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escalation_tracks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "execution_action_id" "uuid" NOT NULL,
    "current_stage_index" integer DEFAULT 0 NOT NULL,
    "last_occurrence_at" timestamp with time zone
);


ALTER TABLE "public"."escalation_tracks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_action_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "execution_action_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "tournament_id" "uuid",
    "tournament_entry_id" "uuid",
    "is_non_compliant" boolean DEFAULT false NOT NULL,
    "hard_gate_triggered" boolean DEFAULT false NOT NULL,
    "escalation_stage_produced" integer,
    "detected_via" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."execution_action_occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "taxonomy_version_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "dimension" "public"."dimension_type" NOT NULL,
    "base_severity" "public"."severity_type" NOT NULL,
    "description" "text",
    "detection_method" "text",
    "is_hard_gate" boolean DEFAULT false,
    "status" "public"."execution_action_status" DEFAULT 'CANONICAL_ACTIVE'::"public"."execution_action_status" NOT NULL,
    "proposed_by" "uuid",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "taxonomy_version" "text"
);


ALTER TABLE "public"."execution_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."execution_taxonomies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL
);


ALTER TABLE "public"."execution_taxonomies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."framework_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "framework_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "primary_objective" "text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "is_activated" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."framework_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid",
    "library_item_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "execution_action_id" "uuid" NOT NULL,
    "escalation_stage_at_assignment" integer NOT NULL,
    "autonomy_mode_at_assignment" "public"."autonomy_mode" NOT NULL,
    "status" "public"."intervention_status" DEFAULT 'ASSIGNED'::"public"."intervention_status" NOT NULL,
    "assigned_by" "uuid",
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."intervention_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "execution_action_id" "uuid" NOT NULL,
    "policy_id" "uuid" NOT NULL,
    "escalation_stage" integer NOT NULL,
    "is_critical_bypass" boolean DEFAULT false,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "library_item_id" "uuid",
    "backlog_priority" integer,
    CONSTRAINT "intervention_candidates_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'ELIGIBLE_FOR_REVIEW'::"text", 'ASSIGNED'::"text", 'EXPIRED'::"text"])))
);


ALTER TABLE "public"."intervention_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_effectiveness_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "effectiveness_rating" "text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "intervention_effectiveness_reviews_effectiveness_rating_check" CHECK (("effectiveness_rating" = ANY (ARRAY['EFFECTIVE'::"text", 'PARTIAL'::"text", 'INEFFECTIVE'::"text"])))
);


ALTER TABLE "public"."intervention_effectiveness_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_eligibility_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intervention_id" "uuid" NOT NULL,
    "execution_action_id" "uuid" NOT NULL,
    "min_escalation_stage" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."intervention_eligibility_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "severity_tier" "public"."severity_type" NOT NULL,
    "requirements" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."intervention_library" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "severity_tier" "public"."severity_type" NOT NULL,
    "cooldown_hours" integer NOT NULL,
    "concurrency_cap" integer NOT NULL,
    "autonomy_mode" "public"."autonomy_mode" DEFAULT 'RECOMMEND_ONLY'::"public"."autonomy_mode" NOT NULL
);


ALTER TABLE "public"."intervention_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_frameworks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "status" "public"."framework_status" DEFAULT 'DRAFT'::"public"."framework_status" NOT NULL
);


ALTER TABLE "public"."performance_frameworks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "public"."role_type" DEFAULT 'PLAYER'::"public"."role_type" NOT NULL,
    "coach_id" "uuid",
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_outcome_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "revision_number" integer DEFAULT 1 NOT NULL,
    "supersedes_id" "uuid",
    "is_current" boolean DEFAULT true,
    "rule_version_id" "uuid" NOT NULL,
    "final_session_net_pnl" numeric NOT NULL,
    "brm_compliance" boolean DEFAULT true,
    "hard_gate_triggered" boolean DEFAULT false,
    "system_outcome_medal" "public"."medal_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_outcome_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "contract_id" "uuid" NOT NULL,
    "preparation_id" "uuid",
    "status" "public"."session_status" DEFAULT 'ACTIVE'::"public"."session_status" NOT NULL,
    "execution_medal" "public"."medal_type",
    "outcome_medal" "public"."medal_type",
    "start_time" timestamp with time zone DEFAULT "now"(),
    "end_time" timestamp with time zone
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."player_current_bankroll" AS
 SELECT "p"."id" AS "player_id",
    (COALESCE("ledger"."ledger_total", (0)::numeric) + COALESCE("poker"."poker_net_total", (0)::numeric)) AS "current_bankroll"
   FROM (("public"."profiles" "p"
     LEFT JOIN ( SELECT "bankroll_ledger_entries"."player_id",
            "sum"(
                CASE
                    WHEN ("bankroll_ledger_entries"."entry_type" = 'WITHDRAWAL'::"public"."ledger_entry_type") THEN (- "bankroll_ledger_entries"."amount")
                    ELSE "bankroll_ledger_entries"."amount"
                END) AS "ledger_total"
           FROM "public"."bankroll_ledger_entries"
          GROUP BY "bankroll_ledger_entries"."player_id") "ledger" ON (("ledger"."player_id" = "p"."id")))
     LEFT JOIN ( SELECT "s"."player_id",
            "sum"("soa"."final_session_net_pnl") AS "poker_net_total"
           FROM ("public"."session_outcome_assessments" "soa"
             JOIN "public"."sessions" "s" ON (("s"."id" = "soa"."session_id")))
          WHERE ("soa"."is_current" = true)
          GROUP BY "s"."player_id") "poker" ON (("poker"."player_id" = "p"."id")))
  WHERE ("p"."role" = 'PLAYER'::"public"."role_type");


ALTER VIEW "public"."player_current_bankroll" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poker_week_boundary_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL,
    "boundary_day_of_week" smallint DEFAULT 1 NOT NULL,
    "boundary_time" time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    "poker_day_boundary_time" time without time zone DEFAULT '10:00:00'::time without time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."poker_week_boundary_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."poker_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "player_timezone_snapshot" "text" NOT NULL,
    "start_timestamp" timestamp with time zone NOT NULL,
    "end_timestamp" timestamp with time zone NOT NULL,
    "is_finalized" boolean DEFAULT false,
    "boundary_config_id" "uuid"
);


ALTER TABLE "public"."poker_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preparation_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "rule_version_id" "uuid" NOT NULL,
    "medal_tier" "public"."medal_type" DEFAULT 'NONE'::"public"."medal_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sleep_hours" numeric,
    "meditation_minutes" numeric,
    "physical_readiness" "text",
    "mental_priming" boolean,
    "impulse_control_smoking" boolean,
    "impulse_control_pmo" boolean,
    "impulse_control_recovery" boolean,
    "optional_note" "text",
    "pre_game_ritual_completed" boolean
);


ALTER TABLE "public"."preparation_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preparation_rule_sets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "coach_id" "uuid" NOT NULL
);


ALTER TABLE "public"."preparation_rule_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preparation_rule_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_set_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "is_activated" boolean DEFAULT false
);


ALTER TABLE "public"."preparation_rule_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."preparation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "signal_type" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "threshold_value" numeric NOT NULL,
    "medal_impact" "public"."medal_type",
    "is_required" boolean DEFAULT false,
    "rule_order" integer NOT NULL
);


ALTER TABLE "public"."preparation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_contract_conditional_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_contract_id" "uuid" NOT NULL,
    "source_wgp_conditional_id" "uuid",
    "tournament_name" "text" NOT NULL,
    "activation_condition" "text" NOT NULL,
    "permitted_buy_ins" smallint NOT NULL
);


ALTER TABLE "public"."session_contract_conditional_tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_contract_substitutions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_contract_id" "uuid" NOT NULL,
    "original_slot_id" "uuid",
    "reason" "text" NOT NULL,
    "replacement_tournament_name" "text" NOT NULL,
    "replacement_permitted_buy_ins" smallint NOT NULL,
    "passed_brm_validation" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_contract_substitutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_contract_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_contract_id" "uuid" NOT NULL,
    "source_wgp_tournament_id" "uuid",
    "tournament_name" "text" NOT NULL,
    "slot_number" smallint NOT NULL,
    "permitted_buy_ins" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_contract_tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_contracts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "brm_assignment_id" "uuid" NOT NULL,
    "framework_version_id" "uuid" NOT NULL,
    "session_stop_loss" numeric NOT NULL,
    "effective_session_loss_limit_at_creation" numeric NOT NULL,
    "status" "public"."contract_status" DEFAULT 'DRAFT'::"public"."contract_status" NOT NULL,
    "locked_at" timestamp with time zone,
    "session_intention" "text",
    "remaining_day_capacity_snapshot" numeric,
    "remaining_week_capacity_snapshot" numeric
);


ALTER TABLE "public"."session_contracts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_execution_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "revision_number" integer DEFAULT 1 NOT NULL,
    "supersedes_id" "uuid",
    "is_current" boolean DEFAULT true,
    "taxonomy_version_id" "uuid" NOT NULL,
    "hard_gate_triggered" boolean DEFAULT false,
    "system_execution_medal" "public"."medal_type" NOT NULL,
    "final_execution_medal" "public"."medal_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_execution_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_execution_dimension_assessments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assessment_id" "uuid" NOT NULL,
    "dimension" "public"."dimension_type" NOT NULL,
    "system_rating" "text" NOT NULL,
    "final_rating" "text" NOT NULL
);


ALTER TABLE "public"."session_execution_dimension_assessments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."taxonomy_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "taxonomy_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "is_activated" boolean DEFAULT false
);


ALTER TABLE "public"."taxonomy_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "entry_sequence" integer NOT NULL,
    "buy_in_amount" numeric NOT NULL,
    "status" "public"."entry_status" DEFAULT 'COMPLETED'::"public"."entry_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "investment" numeric,
    "completion_timestamp" timestamp with time zone,
    "return_amount" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."tournament_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_mistakes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "execution_action_occurrence_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tournament_mistakes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_unplanned" boolean DEFAULT false,
    "is_unauthorized" boolean DEFAULT false,
    "winnings_gross" numeric,
    "net_return" numeric,
    "itm_yn" boolean DEFAULT false,
    "final_table_yn" boolean DEFAULT false,
    "tournament_number" "text",
    "best_rank" integer,
    "worst_rank" integer,
    "comments" "text"
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verdict_evidence_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "verdict_id" "uuid" NOT NULL,
    "section" "text" NOT NULL,
    "claim_text" "text" NOT NULL,
    "confidence_level" "text" NOT NULL,
    "evidence_entity_type" "text" NOT NULL,
    "evidence_entity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "verdict_evidence_items_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['HIGH'::"text", 'MEDIUM'::"text", 'LOW'::"text"]))),
    CONSTRAINT "verdict_evidence_items_section_check" CHECK (("section" = ANY (ARRAY['WHAT_WENT_WELL'::"text", 'WHERE_FAILED'::"text", 'PATTERN_CHECK'::"text", 'OUTCOME_REALITY'::"text", 'NEXT_STANDARD'::"text"])))
);


ALTER TABLE "public"."verdict_evidence_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verdict_generation_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "verdict_id" "uuid" NOT NULL,
    "framework_version_id" "uuid" NOT NULL,
    "brm_assignment_id" "uuid" NOT NULL,
    "prep_record_id" "uuid",
    "execution_assessment_id" "uuid" NOT NULL,
    "outcome_assessment_id" "uuid" NOT NULL,
    "coaching_priorities_snapshot" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "behavioral_snapshot_id" "uuid"
);


ALTER TABLE "public"."verdict_generation_context" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verdicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "revision_number" integer DEFAULT 1 NOT NULL,
    "supersedes_id" "uuid",
    "is_current" boolean DEFAULT true,
    "classification" "public"."verdict_classification" NOT NULL,
    "headline" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."verdicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_brm_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "poker_week_id" "uuid" NOT NULL,
    "brm_config_version_id" "uuid" NOT NULL,
    "bankroll_band_id" "uuid" NOT NULL,
    "brm_level_id" "uuid" NOT NULL,
    "bankroll_balance_at_assignment" numeric NOT NULL,
    "opening_capital_at_assignment" numeric NOT NULL,
    "session_stop_loss_snapshot" numeric NOT NULL,
    "day_stop_loss_snapshot" numeric NOT NULL,
    "week_stop_loss_snapshot" numeric NOT NULL,
    "locked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_brm_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plan_amendments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "amendment_type" "text" NOT NULL,
    "original_reference" "jsonb",
    "proposed_new_value" "jsonb",
    "reason" "text" NOT NULL,
    "validation_result" "jsonb",
    "is_violation" boolean DEFAULT false NOT NULL,
    "related_execution_action_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_game_plan_amendments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plan_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "commitment_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_game_plan_commitments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plan_conditional_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "tournament_name" "text" NOT NULL,
    "activation_condition" "text" NOT NULL,
    "permitted_buy_ins" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_game_plan_conditional_tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plan_playing_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "planned_date" "date" NOT NULL,
    "planned_session_allocation" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "weekly_game_plan_playing_days_planned_session_allocation_check" CHECK (("planned_session_allocation" = ANY (ARRAY[1, 2])))
);


ALTER TABLE "public"."weekly_game_plan_playing_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plan_tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "weekly_game_plan_id" "uuid" NOT NULL,
    "tournament_name" "text" NOT NULL,
    "slot_number" smallint NOT NULL,
    "permitted_buy_ins" smallint NOT NULL,
    "intended_buy_ins" smallint NOT NULL,
    "planned_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."weekly_game_plan_tournaments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_game_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "poker_week_id" "uuid" NOT NULL,
    "framework_version_id" "uuid",
    "brm_assignment_id" "uuid",
    "weekly_intention" "text",
    "weekly_focus" "text",
    "status" "public"."wgp_status" DEFAULT 'DRAFT'::"public"."wgp_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "locked_at" timestamp with time zone
);


ALTER TABLE "public"."weekly_game_plans" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bankroll_ledger_entries"
    ADD CONSTRAINT "bankroll_ledger_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."behavioral_dimension_assessments"
    ADD CONSTRAINT "behavioral_dimension_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."behavioral_dimension_assessments"
    ADD CONSTRAINT "behavioral_dimension_assessments_snapshot_id_dimension_key" UNIQUE ("snapshot_id", "dimension");



ALTER TABLE ONLY "public"."behavioral_pattern_evidence"
    ADD CONSTRAINT "behavioral_pattern_evidence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."behavioral_patterns"
    ADD CONSTRAINT "behavioral_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."behavioral_profile_snapshots"
    ADD CONSTRAINT "behavioral_profile_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brm_bankroll_bands"
    ADD CONSTRAINT "brm_bankroll_bands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brm_config_versions"
    ADD CONSTRAINT "brm_config_versions_config_id_version_number_key" UNIQUE ("config_id", "version_number");



ALTER TABLE ONLY "public"."brm_config_versions"
    ADD CONSTRAINT "brm_config_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brm_configurations"
    ADD CONSTRAINT "brm_configurations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brm_levels"
    ADD CONSTRAINT "brm_levels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brm_levels"
    ADD CONSTRAINT "brm_levels_version_id_level_index_key" UNIQUE ("version_id", "level_index");



ALTER TABLE ONLY "public"."coach_directives"
    ADD CONSTRAINT "coach_directives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_review_agreed_actions"
    ADD CONSTRAINT "coach_review_agreed_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coach_reviews"
    ADD CONSTRAINT "coach_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deep_analysis_messages"
    ADD CONSTRAINT "deep_analysis_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deep_analysis_threads"
    ADD CONSTRAINT "deep_analysis_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_rule_versions"
    ADD CONSTRAINT "escalation_rule_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_tracks"
    ADD CONSTRAINT "escalation_tracks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escalation_tracks"
    ADD CONSTRAINT "escalation_tracks_player_id_execution_action_id_key" UNIQUE ("player_id", "execution_action_id");



ALTER TABLE ONLY "public"."execution_action_occurrences"
    ADD CONSTRAINT "execution_action_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."execution_actions"
    ADD CONSTRAINT "execution_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."execution_taxonomies"
    ADD CONSTRAINT "execution_taxonomies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."framework_versions"
    ADD CONSTRAINT "framework_versions_framework_id_version_number_key" UNIQUE ("framework_id", "version_number");



ALTER TABLE ONLY "public"."framework_versions"
    ADD CONSTRAINT "framework_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_candidates"
    ADD CONSTRAINT "intervention_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_effectiveness_reviews"
    ADD CONSTRAINT "intervention_effectiveness_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_eligibility_mappings"
    ADD CONSTRAINT "intervention_eligibility_mapp_intervention_id_execution_act_key" UNIQUE ("intervention_id", "execution_action_id");



ALTER TABLE ONLY "public"."intervention_eligibility_mappings"
    ADD CONSTRAINT "intervention_eligibility_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_library"
    ADD CONSTRAINT "intervention_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intervention_policies"
    ADD CONSTRAINT "intervention_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."performance_frameworks"
    ADD CONSTRAINT "performance_frameworks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_accountability_profiles"
    ADD CONSTRAINT "player_accountability_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_accountability_profiles"
    ADD CONSTRAINT "player_accountability_profiles_player_id_key" UNIQUE ("player_id");



ALTER TABLE ONLY "public"."poker_week_boundary_configs"
    ADD CONSTRAINT "poker_week_boundary_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."poker_weeks"
    ADD CONSTRAINT "poker_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preparation_records"
    ADD CONSTRAINT "preparation_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preparation_rule_sets"
    ADD CONSTRAINT "preparation_rule_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preparation_rule_versions"
    ADD CONSTRAINT "preparation_rule_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."preparation_rule_versions"
    ADD CONSTRAINT "preparation_rule_versions_rule_set_id_version_number_key" UNIQUE ("rule_set_id", "version_number");



ALTER TABLE ONLY "public"."preparation_rules"
    ADD CONSTRAINT "preparation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_contract_conditional_tournaments"
    ADD CONSTRAINT "session_contract_conditional_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_contract_substitutions"
    ADD CONSTRAINT "session_contract_substitutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_contract_tournaments"
    ADD CONSTRAINT "session_contract_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_contract_tournaments"
    ADD CONSTRAINT "session_contract_tournaments_session_contract_id_slot_numbe_key" UNIQUE ("session_contract_id", "slot_number");



ALTER TABLE ONLY "public"."session_contracts"
    ADD CONSTRAINT "session_contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_execution_assessments"
    ADD CONSTRAINT "session_execution_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_execution_assessments"
    ADD CONSTRAINT "session_execution_assessments_session_id_revision_number_key" UNIQUE ("session_id", "revision_number");



ALTER TABLE ONLY "public"."session_execution_dimension_assessments"
    ADD CONSTRAINT "session_execution_dimension_assessm_assessment_id_dimension_key" UNIQUE ("assessment_id", "dimension");



ALTER TABLE ONLY "public"."session_execution_dimension_assessments"
    ADD CONSTRAINT "session_execution_dimension_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_outcome_assessments"
    ADD CONSTRAINT "session_outcome_assessments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_outcome_assessments"
    ADD CONSTRAINT "session_outcome_assessments_session_id_revision_number_key" UNIQUE ("session_id", "revision_number");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."taxonomy_versions"
    ADD CONSTRAINT "taxonomy_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."taxonomy_versions"
    ADD CONSTRAINT "taxonomy_versions_taxonomy_id_version_number_key" UNIQUE ("taxonomy_id", "version_number");



ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_tournament_id_entry_sequence_key" UNIQUE ("tournament_id", "entry_sequence");



ALTER TABLE ONLY "public"."tournament_mistakes"
    ADD CONSTRAINT "tournament_mistakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_mistakes"
    ADD CONSTRAINT "tournament_mistakes_tournament_id_execution_action_occurren_key" UNIQUE ("tournament_id", "execution_action_occurrence_id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verdict_evidence_items"
    ADD CONSTRAINT "verdict_evidence_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verdicts"
    ADD CONSTRAINT "verdicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verdicts"
    ADD CONSTRAINT "verdicts_session_id_revision_number_key" UNIQUE ("session_id", "revision_number");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plan_amendments"
    ADD CONSTRAINT "weekly_game_plan_amendments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plan_commitments"
    ADD CONSTRAINT "weekly_game_plan_commitments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plan_conditional_tournaments"
    ADD CONSTRAINT "weekly_game_plan_conditional_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plan_playing_days"
    ADD CONSTRAINT "weekly_game_plan_playing_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plan_playing_days"
    ADD CONSTRAINT "weekly_game_plan_playing_days_weekly_game_plan_id_planned_d_key" UNIQUE ("weekly_game_plan_id", "planned_date");



ALTER TABLE ONLY "public"."weekly_game_plan_tournaments"
    ADD CONSTRAINT "weekly_game_plan_tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_player_id_poker_week_id_key" UNIQUE ("player_id", "poker_week_id");



CREATE OR REPLACE TRIGGER "tr_check_finalized_entry" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournament_entries" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_session_finalized"();



CREATE OR REPLACE TRIGGER "tr_check_finalized_session" BEFORE DELETE OR UPDATE ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_session_finalized"();



CREATE OR REPLACE TRIGGER "tr_check_finalized_tournament" BEFORE INSERT OR DELETE OR UPDATE ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_session_finalized"();



CREATE OR REPLACE TRIGGER "tr_enforce_immutability_brm_config_versions" BEFORE UPDATE ON "public"."brm_config_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_version_immutability"();



CREATE OR REPLACE TRIGGER "tr_enforce_immutability_escalation_rule_versions" BEFORE UPDATE ON "public"."escalation_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_version_immutability"();



CREATE OR REPLACE TRIGGER "tr_enforce_immutability_framework_versions" BEFORE UPDATE ON "public"."framework_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_version_immutability"();



CREATE OR REPLACE TRIGGER "tr_enforce_immutability_preparation_rule_versions" BEFORE UPDATE ON "public"."preparation_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_version_immutability"();



CREATE OR REPLACE TRIGGER "tr_enforce_immutability_taxonomy_versions" BEFORE UPDATE ON "public"."taxonomy_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_enforce_version_immutability"();



CREATE OR REPLACE TRIGGER "tr_limit_priorities" BEFORE INSERT ON "public"."coaching_priorities" FOR EACH ROW EXECUTE FUNCTION "public"."fn_check_priority_limit"();



CREATE OR REPLACE TRIGGER "tr_prevent_delete_brm_config_versions" BEFORE DELETE ON "public"."brm_config_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_prevent_version_delete"();



CREATE OR REPLACE TRIGGER "tr_prevent_delete_escalation_rule_versions" BEFORE DELETE ON "public"."escalation_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_prevent_version_delete"();



CREATE OR REPLACE TRIGGER "tr_prevent_delete_framework_versions" BEFORE DELETE ON "public"."framework_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_prevent_version_delete"();



CREATE OR REPLACE TRIGGER "tr_prevent_delete_preparation_rule_versions" BEFORE DELETE ON "public"."preparation_rule_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_prevent_version_delete"();



CREATE OR REPLACE TRIGGER "tr_prevent_delete_taxonomy_versions" BEFORE DELETE ON "public"."taxonomy_versions" FOR EACH ROW EXECUTE FUNCTION "public"."fn_prevent_version_delete"();



ALTER TABLE ONLY "public"."bankroll_ledger_entries"
    ADD CONSTRAINT "bankroll_ledger_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bankroll_ledger_entries"
    ADD CONSTRAINT "bankroll_ledger_entries_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."behavioral_dimension_assessments"
    ADD CONSTRAINT "behavioral_dimension_assessments_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."behavioral_profile_snapshots"("id");



ALTER TABLE ONLY "public"."behavioral_pattern_evidence"
    ADD CONSTRAINT "behavioral_pattern_evidence_pattern_id_fkey" FOREIGN KEY ("pattern_id") REFERENCES "public"."behavioral_patterns"("id");



ALTER TABLE ONLY "public"."behavioral_patterns"
    ADD CONSTRAINT "behavioral_patterns_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."behavioral_patterns"
    ADD CONSTRAINT "behavioral_patterns_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."behavioral_profile_snapshots"("id");



ALTER TABLE ONLY "public"."behavioral_profile_snapshots"
    ADD CONSTRAINT "behavioral_profile_snapshots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."brm_bankroll_bands"
    ADD CONSTRAINT "brm_bankroll_bands_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."brm_config_versions"("id");



ALTER TABLE ONLY "public"."brm_config_versions"
    ADD CONSTRAINT "brm_config_versions_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "public"."brm_configurations"("id");



ALTER TABLE ONLY "public"."brm_configurations"
    ADD CONSTRAINT "brm_configurations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."brm_levels"
    ADD CONSTRAINT "brm_levels_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."brm_config_versions"("id");



ALTER TABLE ONLY "public"."coach_directives"
    ADD CONSTRAINT "coach_directives_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coach_directives"
    ADD CONSTRAINT "coach_directives_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coach_notes"
    ADD CONSTRAINT "coach_notes_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id");



ALTER TABLE ONLY "public"."coach_review_agreed_actions"
    ADD CONSTRAINT "coach_review_agreed_actions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id");



ALTER TABLE ONLY "public"."coach_reviews"
    ADD CONSTRAINT "coach_reviews_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coach_reviews"
    ADD CONSTRAINT "coach_reviews_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."coaching_priorities"
    ADD CONSTRAINT "coaching_priorities_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."coach_reviews"("id");



ALTER TABLE ONLY "public"."deep_analysis_messages"
    ADD CONSTRAINT "deep_analysis_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."deep_analysis_threads"("id");



ALTER TABLE ONLY "public"."deep_analysis_threads"
    ADD CONSTRAINT "deep_analysis_threads_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."deep_analysis_threads"
    ADD CONSTRAINT "deep_analysis_threads_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."deep_analysis_threads"
    ADD CONSTRAINT "deep_analysis_threads_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."deep_analysis_threads"
    ADD CONSTRAINT "deep_analysis_threads_verdict_id_fkey" FOREIGN KEY ("verdict_id") REFERENCES "public"."verdicts"("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "public"."escalation_rule_versions"("id");



ALTER TABLE ONLY "public"."escalation_events"
    ADD CONSTRAINT "escalation_events_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "public"."escalation_tracks"("id");



ALTER TABLE ONLY "public"."escalation_tracks"
    ADD CONSTRAINT "escalation_tracks_execution_action_id_fkey" FOREIGN KEY ("execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."escalation_tracks"
    ADD CONSTRAINT "escalation_tracks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."execution_action_occurrences"
    ADD CONSTRAINT "execution_action_occurrences_execution_action_id_fkey" FOREIGN KEY ("execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."execution_action_occurrences"
    ADD CONSTRAINT "execution_action_occurrences_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."execution_action_occurrences"
    ADD CONSTRAINT "execution_action_occurrences_tournament_entry_id_fkey" FOREIGN KEY ("tournament_entry_id") REFERENCES "public"."tournament_entries"("id");



ALTER TABLE ONLY "public"."execution_action_occurrences"
    ADD CONSTRAINT "execution_action_occurrences_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id");



ALTER TABLE ONLY "public"."execution_actions"
    ADD CONSTRAINT "execution_actions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."execution_actions"
    ADD CONSTRAINT "execution_actions_proposed_by_fkey" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."execution_actions"
    ADD CONSTRAINT "execution_actions_taxonomy_version_id_fkey" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id");



ALTER TABLE ONLY "public"."execution_taxonomies"
    ADD CONSTRAINT "execution_taxonomies_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."framework_versions"
    ADD CONSTRAINT "framework_versions_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "public"."performance_frameworks"("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."intervention_candidates"("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_execution_action_id_fkey" FOREIGN KEY ("execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "public"."intervention_library"("id");



ALTER TABLE ONLY "public"."intervention_assignments"
    ADD CONSTRAINT "intervention_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."intervention_candidates"
    ADD CONSTRAINT "intervention_candidates_execution_action_id_fkey" FOREIGN KEY ("execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."intervention_candidates"
    ADD CONSTRAINT "intervention_candidates_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "public"."intervention_library"("id");



ALTER TABLE ONLY "public"."intervention_candidates"
    ADD CONSTRAINT "intervention_candidates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."intervention_candidates"
    ADD CONSTRAINT "intervention_candidates_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "public"."intervention_policies"("id");



ALTER TABLE ONLY "public"."intervention_effectiveness_reviews"
    ADD CONSTRAINT "intervention_effectiveness_reviews_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."intervention_assignments"("id");



ALTER TABLE ONLY "public"."intervention_effectiveness_reviews"
    ADD CONSTRAINT "intervention_effectiveness_reviews_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."intervention_eligibility_mappings"
    ADD CONSTRAINT "intervention_eligibility_mappings_execution_action_id_fkey" FOREIGN KEY ("execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."intervention_eligibility_mappings"
    ADD CONSTRAINT "intervention_eligibility_mappings_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "public"."intervention_library"("id");



ALTER TABLE ONLY "public"."intervention_library"
    ADD CONSTRAINT "intervention_library_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."intervention_policies"
    ADD CONSTRAINT "intervention_policies_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."performance_frameworks"
    ADD CONSTRAINT "performance_frameworks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."player_accountability_profiles"
    ADD CONSTRAINT "player_accountability_profiles_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poker_week_boundary_configs"
    ADD CONSTRAINT "poker_week_boundary_configs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."poker_weeks"
    ADD CONSTRAINT "poker_weeks_boundary_config_id_fkey" FOREIGN KEY ("boundary_config_id") REFERENCES "public"."poker_week_boundary_configs"("id");



ALTER TABLE ONLY "public"."poker_weeks"
    ADD CONSTRAINT "poker_weeks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."preparation_records"
    ADD CONSTRAINT "preparation_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."preparation_records"
    ADD CONSTRAINT "preparation_records_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "public"."preparation_rule_versions"("id");



ALTER TABLE ONLY "public"."preparation_rule_sets"
    ADD CONSTRAINT "preparation_rule_sets_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."preparation_rule_versions"
    ADD CONSTRAINT "preparation_rule_versions_rule_set_id_fkey" FOREIGN KEY ("rule_set_id") REFERENCES "public"."preparation_rule_sets"("id");



ALTER TABLE ONLY "public"."preparation_rules"
    ADD CONSTRAINT "preparation_rules_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."preparation_rule_versions"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_contract_conditional_tournaments"
    ADD CONSTRAINT "session_contract_conditional_tou_source_wgp_conditional_id_fkey" FOREIGN KEY ("source_wgp_conditional_id") REFERENCES "public"."weekly_game_plan_conditional_tournaments"("id");



ALTER TABLE ONLY "public"."session_contract_conditional_tournaments"
    ADD CONSTRAINT "session_contract_conditional_tournamen_session_contract_id_fkey" FOREIGN KEY ("session_contract_id") REFERENCES "public"."session_contracts"("id");



ALTER TABLE ONLY "public"."session_contract_substitutions"
    ADD CONSTRAINT "session_contract_substitutions_original_slot_id_fkey" FOREIGN KEY ("original_slot_id") REFERENCES "public"."session_contract_tournaments"("id");



ALTER TABLE ONLY "public"."session_contract_substitutions"
    ADD CONSTRAINT "session_contract_substitutions_session_contract_id_fkey" FOREIGN KEY ("session_contract_id") REFERENCES "public"."session_contracts"("id");



ALTER TABLE ONLY "public"."session_contract_tournaments"
    ADD CONSTRAINT "session_contract_tournaments_session_contract_id_fkey" FOREIGN KEY ("session_contract_id") REFERENCES "public"."session_contracts"("id");



ALTER TABLE ONLY "public"."session_contract_tournaments"
    ADD CONSTRAINT "session_contract_tournaments_source_wgp_tournament_id_fkey" FOREIGN KEY ("source_wgp_tournament_id") REFERENCES "public"."weekly_game_plan_tournaments"("id");



ALTER TABLE ONLY "public"."session_contracts"
    ADD CONSTRAINT "session_contracts_brm_assignment_id_fkey" FOREIGN KEY ("brm_assignment_id") REFERENCES "public"."weekly_brm_assignments"("id");



ALTER TABLE ONLY "public"."session_contracts"
    ADD CONSTRAINT "session_contracts_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "public"."framework_versions"("id");



ALTER TABLE ONLY "public"."session_contracts"
    ADD CONSTRAINT "session_contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."session_contracts"
    ADD CONSTRAINT "session_contracts_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."session_execution_assessments"
    ADD CONSTRAINT "session_execution_assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."session_execution_assessments"
    ADD CONSTRAINT "session_execution_assessments_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."session_execution_assessments"("id");



ALTER TABLE ONLY "public"."session_execution_assessments"
    ADD CONSTRAINT "session_execution_assessments_taxonomy_version_id_fkey" FOREIGN KEY ("taxonomy_version_id") REFERENCES "public"."taxonomy_versions"("id");



ALTER TABLE ONLY "public"."session_execution_dimension_assessments"
    ADD CONSTRAINT "session_execution_dimension_assessments_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "public"."session_execution_assessments"("id");



ALTER TABLE ONLY "public"."session_outcome_assessments"
    ADD CONSTRAINT "session_outcome_assessments_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "public"."brm_config_versions"("id");



ALTER TABLE ONLY "public"."session_outcome_assessments"
    ADD CONSTRAINT "session_outcome_assessments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."session_outcome_assessments"
    ADD CONSTRAINT "session_outcome_assessments_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."session_outcome_assessments"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."session_contracts"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_preparation_id_fkey" FOREIGN KEY ("preparation_id") REFERENCES "public"."preparation_records"("id");



ALTER TABLE ONLY "public"."taxonomy_versions"
    ADD CONSTRAINT "taxonomy_versions_taxonomy_id_fkey" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."execution_taxonomies"("id");



ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id");



ALTER TABLE ONLY "public"."tournament_mistakes"
    ADD CONSTRAINT "tournament_mistakes_execution_action_occurrence_id_fkey" FOREIGN KEY ("execution_action_occurrence_id") REFERENCES "public"."execution_action_occurrences"("id");



ALTER TABLE ONLY "public"."tournament_mistakes"
    ADD CONSTRAINT "tournament_mistakes_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."verdict_evidence_items"
    ADD CONSTRAINT "verdict_evidence_items_verdict_id_fkey" FOREIGN KEY ("verdict_id") REFERENCES "public"."verdicts"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_behavioral_snapshot_id_fkey" FOREIGN KEY ("behavioral_snapshot_id") REFERENCES "public"."behavioral_profile_snapshots"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_brm_assignment_id_fkey" FOREIGN KEY ("brm_assignment_id") REFERENCES "public"."weekly_brm_assignments"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_execution_assessment_id_fkey" FOREIGN KEY ("execution_assessment_id") REFERENCES "public"."session_execution_assessments"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "public"."framework_versions"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_outcome_assessment_id_fkey" FOREIGN KEY ("outcome_assessment_id") REFERENCES "public"."session_outcome_assessments"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_prep_record_id_fkey" FOREIGN KEY ("prep_record_id") REFERENCES "public"."preparation_records"("id");



ALTER TABLE ONLY "public"."verdict_generation_context"
    ADD CONSTRAINT "verdict_generation_context_verdict_id_fkey" FOREIGN KEY ("verdict_id") REFERENCES "public"."verdicts"("id");



ALTER TABLE ONLY "public"."verdicts"
    ADD CONSTRAINT "verdicts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id");



ALTER TABLE ONLY "public"."verdicts"
    ADD CONSTRAINT "verdicts_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "public"."verdicts"("id");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_bankroll_band_id_fkey" FOREIGN KEY ("bankroll_band_id") REFERENCES "public"."brm_bankroll_bands"("id");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_brm_config_version_id_fkey" FOREIGN KEY ("brm_config_version_id") REFERENCES "public"."brm_config_versions"("id");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_brm_level_id_fkey" FOREIGN KEY ("brm_level_id") REFERENCES "public"."brm_levels"("id");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."weekly_brm_assignments"
    ADD CONSTRAINT "weekly_brm_assignments_poker_week_id_fkey" FOREIGN KEY ("poker_week_id") REFERENCES "public"."poker_weeks"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_amendments"
    ADD CONSTRAINT "weekly_game_plan_amendments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_amendments"
    ADD CONSTRAINT "weekly_game_plan_amendments_related_execution_action_id_fkey" FOREIGN KEY ("related_execution_action_id") REFERENCES "public"."execution_actions"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_amendments"
    ADD CONSTRAINT "weekly_game_plan_amendments_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_commitments"
    ADD CONSTRAINT "weekly_game_plan_commitments_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_conditional_tournaments"
    ADD CONSTRAINT "weekly_game_plan_conditional_tournamen_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_playing_days"
    ADD CONSTRAINT "weekly_game_plan_playing_days_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."weekly_game_plan_tournaments"
    ADD CONSTRAINT "weekly_game_plan_tournaments_weekly_game_plan_id_fkey" FOREIGN KEY ("weekly_game_plan_id") REFERENCES "public"."weekly_game_plans"("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_brm_assignment_id_fkey" FOREIGN KEY ("brm_assignment_id") REFERENCES "public"."weekly_brm_assignments"("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_framework_version_id_fkey" FOREIGN KEY ("framework_version_id") REFERENCES "public"."framework_versions"("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."weekly_game_plans"
    ADD CONSTRAINT "weekly_game_plans_poker_week_id_fkey" FOREIGN KEY ("poker_week_id") REFERENCES "public"."poker_weeks"("id");



CREATE POLICY "Access via parent WGP" ON "public"."weekly_game_plan_amendments" USING (("weekly_game_plan_id" IN ( SELECT "weekly_game_plans"."id"
   FROM "public"."weekly_game_plans"
  WHERE (("weekly_game_plans"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("weekly_game_plans"."player_id")))));



CREATE POLICY "Access via parent WGP" ON "public"."weekly_game_plan_commitments" USING (("weekly_game_plan_id" IN ( SELECT "weekly_game_plans"."id"
   FROM "public"."weekly_game_plans"
  WHERE (("weekly_game_plans"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("weekly_game_plans"."player_id")))));



CREATE POLICY "Access via parent WGP" ON "public"."weekly_game_plan_conditional_tournaments" USING (("weekly_game_plan_id" IN ( SELECT "weekly_game_plans"."id"
   FROM "public"."weekly_game_plans"
  WHERE (("weekly_game_plans"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("weekly_game_plans"."player_id")))));



CREATE POLICY "Access via parent WGP" ON "public"."weekly_game_plan_playing_days" USING (("weekly_game_plan_id" IN ( SELECT "weekly_game_plans"."id"
   FROM "public"."weekly_game_plans"
  WHERE (("weekly_game_plans"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("weekly_game_plans"."player_id")))));



CREATE POLICY "Access via parent WGP" ON "public"."weekly_game_plan_tournaments" USING (("weekly_game_plan_id" IN ( SELECT "weekly_game_plans"."id"
   FROM "public"."weekly_game_plans"
  WHERE (("weekly_game_plans"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("weekly_game_plans"."player_id")))));



CREATE POLICY "Access via parent assessment" ON "public"."session_execution_dimension_assessments" FOR SELECT USING (("assessment_id" IN ( SELECT "session_execution_assessments"."id"
   FROM "public"."session_execution_assessments")));



CREATE POLICY "Access via parent contract" ON "public"."session_contract_conditional_tournaments" USING (("session_contract_id" IN ( SELECT "session_contracts"."id"
   FROM "public"."session_contracts"
  WHERE (("session_contracts"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("session_contracts"."player_id")))));



CREATE POLICY "Access via parent contract" ON "public"."session_contract_substitutions" USING (("session_contract_id" IN ( SELECT "session_contracts"."id"
   FROM "public"."session_contracts"
  WHERE (("session_contracts"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("session_contracts"."player_id")))));



CREATE POLICY "Access via parent contract" ON "public"."session_contract_tournaments" USING (("session_contract_id" IN ( SELECT "session_contracts"."id"
   FROM "public"."session_contracts"
  WHERE (("session_contracts"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("session_contracts"."player_id")))));



CREATE POLICY "Access via parent library item" ON "public"."intervention_eligibility_mappings" FOR SELECT USING (("intervention_id" IN ( SELECT "intervention_library"."id"
   FROM "public"."intervention_library")));



CREATE POLICY "Access via parent pattern" ON "public"."behavioral_pattern_evidence" FOR SELECT USING (("pattern_id" IN ( SELECT "behavioral_patterns"."id"
   FROM "public"."behavioral_patterns")));



CREATE POLICY "Access via parent review" ON "public"."coach_review_agreed_actions" FOR SELECT USING (("review_id" IN ( SELECT "coach_reviews"."id"
   FROM "public"."coach_reviews"
  WHERE (("coach_reviews"."player_id" = "auth"."uid"()) OR ("coach_reviews"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Access via parent snapshot" ON "public"."behavioral_dimension_assessments" FOR SELECT USING (("snapshot_id" IN ( SELECT "behavioral_profile_snapshots"."id"
   FROM "public"."behavioral_profile_snapshots")));



CREATE POLICY "Access via parent thread" ON "public"."deep_analysis_messages" USING (("thread_id" IN ( SELECT "deep_analysis_threads"."id"
   FROM "public"."deep_analysis_threads"
  WHERE (("deep_analysis_threads"."player_id" = "auth"."uid"()) OR ("deep_analysis_threads"."coach_id" = "auth"."uid"())))));



CREATE POLICY "Access via parent tournament" ON "public"."tournament_mistakes" USING (("tournament_id" IN ( SELECT "tournaments"."id"
   FROM "public"."tournaments")));



CREATE POLICY "Access via parent track" ON "public"."escalation_events" FOR SELECT USING (("track_id" IN ( SELECT "escalation_tracks"."id"
   FROM "public"."escalation_tracks"
  WHERE (("escalation_tracks"."player_id" = "auth"."uid"()) OR "public"."fn_is_coach_of"("escalation_tracks"."player_id")))));



CREATE POLICY "Access via parent verdict" ON "public"."verdict_evidence_items" FOR SELECT USING (("verdict_id" IN ( SELECT "verdicts"."id"
   FROM "public"."verdicts")));



CREATE POLICY "Access via parent verdict context" ON "public"."verdict_generation_context" FOR SELECT USING (("verdict_id" IN ( SELECT "verdicts"."id"
   FROM "public"."verdicts")));



CREATE POLICY "Authenticated read BRM levels" ON "public"."brm_levels" FOR SELECT USING (true);



CREATE POLICY "Authenticated read active escalation rules" ON "public"."escalation_rule_versions" FOR SELECT TO "authenticated" USING (("is_activated" = true));



CREATE POLICY "Authenticated read bankroll bands" ON "public"."brm_bankroll_bands" FOR SELECT USING (true);



CREATE POLICY "Authenticated read execution actions" ON "public"."execution_actions" FOR SELECT USING (true);



CREATE POLICY "Authenticated read preparation rule sets" ON "public"."preparation_rule_sets" FOR SELECT USING (true);



CREATE POLICY "Authenticated read preparation rule versions" ON "public"."preparation_rule_versions" FOR SELECT USING (true);



CREATE POLICY "Authenticated read preparation rules" ON "public"."preparation_rules" FOR SELECT USING (true);



CREATE POLICY "Coaches can see their players sessions" ON "public"."sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'COACH'::"public"."role_type") AND ("profiles"."id" = ( SELECT "profiles_1"."coach_id"
           FROM "public"."profiles" "profiles_1"
          WHERE ("profiles_1"."id" = "sessions"."player_id")))))));



CREATE POLICY "Coaches manage directives for linked players" ON "public"."coach_directives" TO "authenticated" USING ("public"."fn_is_coach_of"("player_id")) WITH CHECK ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches manage effectiveness reviews" ON "public"."intervention_effectiveness_reviews" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own BRM config" ON "public"."brm_configurations" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own boundary config" ON "public"."poker_week_boundary_configs" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own execution taxonomies" ON "public"."execution_taxonomies" TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own framework versions" ON "public"."framework_versions" FOR INSERT WITH CHECK (("framework_id" IN ( SELECT "performance_frameworks"."id"
   FROM "public"."performance_frameworks"
  WHERE ("performance_frameworks"."coach_id" = "auth"."uid"()))));



CREATE POLICY "Coaches manage own frameworks" ON "public"."performance_frameworks" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own intervention library" ON "public"."intervention_library" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own intervention policies" ON "public"."intervention_policies" TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own notes" ON "public"."coach_notes" TO "authenticated" USING (("coach_id" = "auth"."uid"())) WITH CHECK (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own reviews" ON "public"."coach_reviews" USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches manage own taxonomy versions" ON "public"."taxonomy_versions" TO "authenticated" USING (("taxonomy_id" IN ( SELECT "execution_taxonomies"."id"
   FROM "public"."execution_taxonomies"
  WHERE ("execution_taxonomies"."coach_id" = "auth"."uid"())))) WITH CHECK (("taxonomy_id" IN ( SELECT "execution_taxonomies"."id"
   FROM "public"."execution_taxonomies"
  WHERE ("execution_taxonomies"."coach_id" = "auth"."uid"()))));



CREATE POLICY "Coaches manage their players' assignments" ON "public"."intervention_assignments" USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches manage their players' candidates" ON "public"."intervention_candidates" USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches manage their players' ledger" ON "public"."bankroll_ledger_entries" USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches manage their players' priorities" ON "public"."coaching_priorities" USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players escalation tracks" ON "public"."escalation_tracks" FOR SELECT TO "authenticated" USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players execution assessments" ON "public"."session_execution_assessments" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE "public"."fn_is_coach_of"("sessions"."player_id"))));



CREATE POLICY "Coaches read their players occurrences" ON "public"."execution_action_occurrences" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE "public"."fn_is_coach_of"("sessions"."player_id"))));



CREATE POLICY "Coaches read their players outcome assessments" ON "public"."session_outcome_assessments" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE "public"."fn_is_coach_of"("sessions"."player_id"))));



CREATE POLICY "Coaches read their players' behavioral snapshots" ON "public"."behavioral_profile_snapshots" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players' entries" ON "public"."tournament_entries" FOR SELECT USING (("tournament_id" IN ( SELECT "t"."id"
   FROM ("public"."tournaments" "t"
     JOIN "public"."sessions" "s" ON (("s"."id" = "t"."session_id")))
  WHERE "public"."fn_is_coach_of"("s"."player_id"))));



CREATE POLICY "Coaches read their players' patterns" ON "public"."behavioral_patterns" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players' prep records" ON "public"."preparation_records" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players' session contracts" ON "public"."session_contracts" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches read their players' threads" ON "public"."deep_analysis_threads" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches read their players' tournaments" ON "public"."tournaments" FOR SELECT USING (("session_id" IN ( SELECT "s"."id"
   FROM "public"."sessions" "s"
  WHERE "public"."fn_is_coach_of"("s"."player_id"))));



CREATE POLICY "Coaches read their players' verdicts" ON "public"."verdicts" FOR SELECT USING (("session_id" IN ( SELECT "s"."id"
   FROM "public"."sessions" "s"
  WHERE "public"."fn_is_coach_of"("s"."player_id"))));



CREATE POLICY "Coaches read their players' weekly game plans" ON "public"."weekly_game_plans" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches see their players' BRM assignments" ON "public"."weekly_brm_assignments" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches see their players' poker weeks" ON "public"."poker_weeks" FOR SELECT USING ("public"."fn_is_coach_of"("player_id"));



CREATE POLICY "Coaches see their players' profiles" ON "public"."profiles" FOR SELECT USING (("coach_id" = "auth"."uid"()));



CREATE POLICY "Coaches write BRM versions" ON "public"."brm_config_versions" FOR INSERT WITH CHECK (("config_id" IN ( SELECT "brm_configurations"."id"
   FROM "public"."brm_configurations"
  WHERE ("brm_configurations"."coach_id" = "auth"."uid"()))));



CREATE POLICY "Players can only see their own sessions" ON "public"."sessions" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players insert own occurrence records" ON "public"."execution_action_occurrences" FOR INSERT WITH CHECK (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players insert own sessions" ON "public"."sessions" FOR INSERT WITH CHECK ((("player_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."session_contracts" "sc"
  WHERE (("sc"."id" = "sessions"."contract_id") AND ("sc"."player_id" = "auth"."uid"()) AND ("sc"."status" = 'VALIDATED'::"public"."contract_status"))))));



CREATE POLICY "Players manage own entries" ON "public"."tournament_entries" USING (("tournament_id" IN ( SELECT "t"."id"
   FROM ("public"."tournaments" "t"
     JOIN "public"."sessions" "s" ON (("s"."id" = "t"."session_id")))
  WHERE ("s"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players manage own prep records" ON "public"."preparation_records" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players manage own session contracts" ON "public"."session_contracts" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players manage own threads" ON "public"."deep_analysis_threads" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players manage own tournaments" ON "public"."tournaments" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players manage own weekly game plans" ON "public"."weekly_game_plans" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players propose actions" ON "public"."execution_actions" FOR INSERT WITH CHECK ((("status" = 'PLAYER_PROPOSED'::"public"."execution_action_status") AND ("proposed_by" = "auth"."uid"())));



CREATE POLICY "Players read active frameworks of their coach" ON "public"."performance_frameworks" FOR SELECT USING (("coach_id" = ( SELECT "profiles"."coach_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Players read active taxonomy versions" ON "public"."taxonomy_versions" FOR SELECT TO "authenticated" USING ((("is_activated" = true) AND ("taxonomy_id" IN ( SELECT "et"."id"
   FROM ("public"."execution_taxonomies" "et"
     JOIN "public"."profiles" "p" ON (("p"."coach_id" = "et"."coach_id")))
  WHERE ("p"."id" = "auth"."uid"())))));



CREATE POLICY "Players read coach execution taxonomies" ON "public"."execution_taxonomies" FOR SELECT TO "authenticated" USING (("coach_id" = ( SELECT "profiles"."coach_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Players read non-private notes about them" ON "public"."coach_notes" FOR SELECT TO "authenticated" USING ((("player_id" = "auth"."uid"()) AND ("note_type" <> 'PRIVATE'::"text")));



CREATE POLICY "Players read own assignments" ON "public"."intervention_assignments" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own behavioral snapshots" ON "public"."behavioral_profile_snapshots" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own coach directives" ON "public"."coach_directives" FOR SELECT TO "authenticated" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own escalation tracks" ON "public"."escalation_tracks" FOR SELECT TO "authenticated" USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own execution assessments" ON "public"."session_execution_assessments" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players read own intervention candidates" ON "public"."intervention_candidates" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own ledger" ON "public"."bankroll_ledger_entries" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own occurrences" ON "public"."execution_action_occurrences" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players read own outcome assessments" ON "public"."session_outcome_assessments" FOR SELECT TO "authenticated" USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players read own patterns" ON "public"."behavioral_patterns" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own priorities" ON "public"."coaching_priorities" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own reviews" ON "public"."coach_reviews" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players read own verdicts" ON "public"."verdicts" FOR SELECT USING (("session_id" IN ( SELECT "sessions"."id"
   FROM "public"."sessions"
  WHERE ("sessions"."player_id" = "auth"."uid"()))));



CREATE POLICY "Players read their coach's BRM config" ON "public"."brm_configurations" FOR SELECT USING (("coach_id" = ( SELECT "profiles"."coach_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Players read their coach's boundary config" ON "public"."poker_week_boundary_configs" FOR SELECT USING (("coach_id" = ( SELECT "profiles"."coach_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Players read their coach's library" ON "public"."intervention_library" FOR SELECT USING (("coach_id" = ( SELECT "profiles"."coach_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Players see own BRM assignments" ON "public"."weekly_brm_assignments" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players see own poker weeks" ON "public"."poker_weeks" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players stop own active sessions" ON "public"."sessions" FOR UPDATE USING ((("player_id" = "auth"."uid"()) AND ("status" = 'ACTIVE'::"public"."session_status"))) WITH CHECK ((("player_id" = "auth"."uid"()) AND ("status" = 'REVIEW_PENDING'::"public"."session_status")));



CREATE POLICY "Read BRM versions via parent" ON "public"."brm_config_versions" FOR SELECT USING (true);



CREATE POLICY "Read framework versions via parent access" ON "public"."framework_versions" FOR SELECT USING (("framework_id" IN ( SELECT "performance_frameworks"."id"
   FROM "public"."performance_frameworks")));



CREATE POLICY "Users see own profile" ON "public"."profiles" FOR SELECT USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."bankroll_ledger_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."behavioral_dimension_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."behavioral_pattern_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."behavioral_patterns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."behavioral_profile_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brm_bankroll_bands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brm_config_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brm_configurations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brm_levels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_directives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_review_agreed_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coach_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coaching_priorities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deep_analysis_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deep_analysis_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_rule_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."escalation_tracks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."execution_action_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."execution_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."execution_taxonomies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."framework_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_candidates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_effectiveness_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_eligibility_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."performance_frameworks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_accountability_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poker_week_boundary_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."poker_weeks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preparation_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preparation_rule_sets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preparation_rule_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."preparation_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_contract_conditional_tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_contract_substitutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_contract_tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_execution_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_execution_dimension_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_outcome_assessments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."taxonomy_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_mistakes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verdict_evidence_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verdict_generation_context" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."verdicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_brm_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plan_amendments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plan_commitments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plan_conditional_tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plan_playing_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plan_tournaments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_game_plans" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_check_priority_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_check_session_finalized"() TO "service_role";



GRANT ALL ON TABLE "public"."player_accountability_profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."player_accountability_profiles" TO "authenticated";



GRANT ALL ON FUNCTION "public"."fn_get_accountability_profile"("target_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_handle_supersession"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_is_coach_of"("target_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."perform_start_session"("p_contract_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON TABLE "public"."bankroll_ledger_entries" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."bankroll_ledger_entries" TO "authenticated";



GRANT ALL ON TABLE "public"."behavioral_dimension_assessments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."behavioral_dimension_assessments" TO "authenticated";



GRANT ALL ON TABLE "public"."behavioral_pattern_evidence" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."behavioral_pattern_evidence" TO "authenticated";



GRANT ALL ON TABLE "public"."behavioral_patterns" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."behavioral_patterns" TO "authenticated";



GRANT ALL ON TABLE "public"."behavioral_profile_snapshots" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."behavioral_profile_snapshots" TO "authenticated";



GRANT ALL ON TABLE "public"."brm_bankroll_bands" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."brm_bankroll_bands" TO "authenticated";



GRANT ALL ON TABLE "public"."brm_config_versions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."brm_config_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."brm_configurations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."brm_configurations" TO "authenticated";



GRANT ALL ON TABLE "public"."brm_levels" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."brm_levels" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_directives" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coach_directives" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_notes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coach_notes" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_review_agreed_actions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coach_review_agreed_actions" TO "authenticated";



GRANT ALL ON TABLE "public"."coach_reviews" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coach_reviews" TO "authenticated";



GRANT ALL ON TABLE "public"."coaching_priorities" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coaching_priorities" TO "authenticated";



GRANT ALL ON TABLE "public"."deep_analysis_messages" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."deep_analysis_messages" TO "authenticated";



GRANT ALL ON TABLE "public"."deep_analysis_threads" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."deep_analysis_threads" TO "authenticated";



GRANT ALL ON TABLE "public"."escalation_events" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."escalation_events" TO "authenticated";



GRANT ALL ON TABLE "public"."escalation_rule_versions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."escalation_rule_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."escalation_tracks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."escalation_tracks" TO "authenticated";



GRANT ALL ON TABLE "public"."execution_action_occurrences" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."execution_action_occurrences" TO "authenticated";



GRANT ALL ON TABLE "public"."execution_actions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."execution_actions" TO "authenticated";



GRANT ALL ON TABLE "public"."execution_taxonomies" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."execution_taxonomies" TO "authenticated";



GRANT ALL ON TABLE "public"."framework_versions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."framework_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_candidates" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_candidates" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_effectiveness_reviews" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_effectiveness_reviews" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_eligibility_mappings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_eligibility_mappings" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_library" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_library" TO "authenticated";



GRANT ALL ON TABLE "public"."intervention_policies" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."intervention_policies" TO "authenticated";



GRANT ALL ON TABLE "public"."performance_frameworks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."performance_frameworks" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."session_outcome_assessments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_outcome_assessments" TO "authenticated";



GRANT ALL ON TABLE "public"."sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."sessions" TO "authenticated";



GRANT ALL ON TABLE "public"."player_current_bankroll" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."player_current_bankroll" TO "authenticated";



GRANT ALL ON TABLE "public"."poker_week_boundary_configs" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."poker_week_boundary_configs" TO "authenticated";



GRANT ALL ON TABLE "public"."poker_weeks" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."poker_weeks" TO "authenticated";



GRANT ALL ON TABLE "public"."preparation_records" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."preparation_records" TO "authenticated";



GRANT ALL ON TABLE "public"."preparation_rule_sets" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."preparation_rule_sets" TO "authenticated";



GRANT ALL ON TABLE "public"."preparation_rule_versions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."preparation_rule_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."preparation_rules" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."preparation_rules" TO "authenticated";



GRANT ALL ON TABLE "public"."session_contract_conditional_tournaments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_contract_conditional_tournaments" TO "authenticated";



GRANT ALL ON TABLE "public"."session_contract_substitutions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_contract_substitutions" TO "authenticated";



GRANT ALL ON TABLE "public"."session_contract_tournaments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_contract_tournaments" TO "authenticated";



GRANT ALL ON TABLE "public"."session_contracts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_contracts" TO "authenticated";



GRANT ALL ON TABLE "public"."session_execution_assessments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_execution_assessments" TO "authenticated";



GRANT ALL ON TABLE "public"."session_execution_dimension_assessments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."session_execution_dimension_assessments" TO "authenticated";



GRANT ALL ON TABLE "public"."taxonomy_versions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."taxonomy_versions" TO "authenticated";



GRANT ALL ON TABLE "public"."tournament_entries" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tournament_entries" TO "authenticated";



GRANT ALL ON TABLE "public"."tournament_mistakes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tournament_mistakes" TO "authenticated";



GRANT ALL ON TABLE "public"."tournaments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tournaments" TO "authenticated";



GRANT ALL ON TABLE "public"."verdict_evidence_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."verdict_evidence_items" TO "authenticated";



GRANT ALL ON TABLE "public"."verdict_generation_context" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."verdict_generation_context" TO "authenticated";



GRANT ALL ON TABLE "public"."verdicts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."verdicts" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_brm_assignments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_brm_assignments" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plan_amendments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plan_amendments" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plan_commitments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plan_commitments" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plan_conditional_tournaments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plan_conditional_tournaments" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plan_playing_days" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plan_playing_days" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plan_tournaments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plan_tournaments" TO "authenticated";



GRANT ALL ON TABLE "public"."weekly_game_plans" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."weekly_game_plans" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







