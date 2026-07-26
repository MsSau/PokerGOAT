-- Workflow & Trust-Boundary Audit, findings C4 and H7. Body-only change,
-- rebased on top of 20260724170000 (the coach_directives execution_action_id
-- + retracted_at scoping) rather than the older snapshot this migration was
-- originally drafted against — that draft's v_prior_directive WHERE clause
-- would otherwise have silently reverted that scoping back to "any
-- directive counts toward any action" via CREATE OR REPLACE. Only the C4
-- and H7 changes below are new; everything else in the function is
-- unchanged from 20260724170000.
--
-- C4 (BRM-compliance trust boundary): v_brm_compliant was derived entirely
-- from tournament_entries.status = 'NON_COMPLIANT', and that status —
-- along with tournaments.is_unauthorized/is_unplanned — is computed
-- client-side in tournaments.ts and inserted verbatim, with nothing on the
-- server ever re-checking it. A player could log an entry with
-- is_unauthorized: false / status: 'COMPLETED' for a tournament that
-- plainly isn't in their locked Session Contract, and perform_end_session
-- would still grant BRM compliance and an Outcome Medal on trust. Fixed by
-- adding fn_tournament_contract_authorized(), which re-derives — from the
-- locked contract itself, independent of anything client-supplied — the
-- same fixed-slot/conditional/substitution match tournaments.ts's own
-- findMatchedSlot() computes in TypeScript, and ANDing that independent
-- check into v_brm_compliant. The client-set status is still consulted
-- (it also captures exceeded-buy-in-count and stop-loss-timing violations
-- this function doesn't re-derive), so this closes the most severe,
-- directly-fabricable half of the gap — outright claiming a fictitious
-- tournament was authorized — without changing what "truthful logging is
-- never blocked" means: nothing here rejects an insert, it only affects
-- the Outcome Medal computed after the fact, the same trust model as every
-- other recompute in this function.
--
-- H7 (escalation race): two sessions for the same player finalizing close
-- together, both logging occurrences of the same execution_action_id,
-- could each read escalation_tracks.current_stage_index before either had
-- written its own transition back — whichever commits last silently wins,
-- and the loser's transition (and its escalation_events audit row) is
-- gone. Fixed with a per-(player, execution_action_id) transaction-scoped
-- advisory lock taken before the read, so a second concurrent finalization
-- touching the same track blocks until the first commits and then reads
-- the now-current stage — this also covers the "track doesn't exist yet"
-- case (both would otherwise race an INSERT), unlike a plain `SELECT ...
-- FOR UPDATE` on a row that may not exist.

CREATE OR REPLACE FUNCTION "public"."fn_tournament_contract_authorized"("p_session_id" "uuid", "p_tournament_name" "text")
RETURNS boolean
LANGUAGE "sql" STABLE SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
  WITH ctx AS (
    SELECT "sc"."id" AS contract_id
    FROM "public"."sessions" "s"
    JOIN "public"."session_contracts" "sc" ON "sc"."id" = "s"."contract_id"
    WHERE "s"."id" = p_session_id
  ),
  norm AS (SELECT lower(trim(p_tournament_name)) AS name)
  SELECT
    -- A recorded substitution's replacement tournament is authorized —
    -- same as findMatchedSlot()'s first check.
    EXISTS (
      SELECT 1 FROM "public"."session_contract_substitutions" "ss", ctx, norm
      WHERE "ss"."session_contract_id" = ctx.contract_id
        AND lower(trim("ss"."replacement_tournament_name")) = norm.name
    )
    -- A fixed contract slot matches, UNLESS that slot has since been
    -- substituted away (excluded the same way findMatchedSlot() excludes
    -- substituted_slot_ids).
    OR EXISTS (
      SELECT 1 FROM "public"."session_contract_tournaments" "sct", ctx, norm
      WHERE "sct"."session_contract_id" = ctx.contract_id
        AND lower(trim("sct"."tournament_name")) = norm.name
        AND "sct"."id" NOT IN (
          SELECT "ss2"."original_slot_id"
          FROM "public"."session_contract_substitutions" "ss2", ctx
          WHERE "ss2"."session_contract_id" = ctx.contract_id AND "ss2"."original_slot_id" IS NOT NULL
        )
    )
    -- An activated conditional tournament on the contract matches.
    OR EXISTS (
      SELECT 1 FROM "public"."session_contract_conditional_tournaments" "scct", ctx, norm
      WHERE "scct"."session_contract_id" = ctx.contract_id
        AND lower(trim("scct"."tournament_name")) = norm.name
    );
$$;

ALTER FUNCTION "public"."fn_tournament_contract_authorized"("p_session_id" "uuid", "p_tournament_name" "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."fn_tournament_contract_authorized"("p_session_id" "uuid", "p_tournament_name" "text") TO "service_role";

CREATE OR REPLACE FUNCTION "public"."perform_end_session"(
  "p_session_id" "uuid",
  "p_tournament_finishes" "jsonb",
  "p_mistake_tags" "jsonb",
  "p_verdict_evidence" "jsonb",
  "p_behavioral_snapshot_id" "uuid" DEFAULT NULL::"uuid",
  "p_reflection_note" "text" DEFAULT NULL,
  "p_reflection_prose" "text" DEFAULT NULL
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_player_id UUID;
    v_contract_id UUID;
    v_brm_assignment_id UUID;
    v_rule_version_id UUID;
    v_taxonomy_version_id UUID;
    v_framework_version_id UUID;
    v_prep_record_id UUID;
    v_prep_medal TEXT;
    v_escalation_rule_version_id UUID;
    v_session_status "public"."session_status";

    v_t_id TEXT;
    v_finish JSONB;
    v_total_cost NUMERIC;

    v_tag JSONB;
    v_tag_idx BIGINT;
    v_base_now TIMESTAMPTZ := "clock_timestamp"();
    v_mistake_ts TIMESTAMPTZ;
    v_eao_id UUID;
    v_tag_is_hard_gate BOOLEAN;

    v_track_id UUID;

    v_exec_assessment_id UUID := "gen_random_uuid"();
    v_outcome_assessment_id UUID := "gen_random_uuid"();
    v_verdict_id UUID := "gen_random_uuid"();

    -- Outcome (§6/§8)
    v_final_pnl NUMERIC;
    v_itm_count INT;
    v_finalized_count INT;
    v_had_final_table BOOLEAN;
    v_itm_rate NUMERIC;
    v_brm_compliant BOOLEAN;
    v_outcome_hard_gate BOOLEAN;
    v_outcome_medal TEXT;
    v_positive BOOLEAN;

    -- Escalation walk (§12), one row per occurrence in this session
    v_occ RECORD;
    v_current_stage INT;
    v_new_stage INT;
    v_any_critical_escalation BOOLEAN := false;
    v_prior_occurrences_recent INT;
    v_prior_occurrences_short_term INT;
    v_prior_minor_at_stage2 BOOLEAN;
    v_prior_major_ever BOOLEAN;
    v_prior_critical_ever BOOLEAN;
    v_prior_critical_recent BOOLEAN;
    v_prior_directive BOOLEAN;
    v_prior_intervention BOOLEAN;
    v_major_after_directive BOOLEAN;
    v_major_after_intervention BOOLEAN;
    v_critical_after_coaching BOOLEAN;
    v_candidates INT[];
    v_satisfied TEXT[];
    v_base_points INT;
    v_occurrence_score NUMERIC;

    -- True same-severity history (see 20260724150000's header) — the
    -- condition-name sets evaluateEscalationTransition (escalationEngine.ts)
    -- tags MAJOR/CRITICAL transitions with, and a same-session accumulator
    -- covering occurrences already walked earlier in THIS loop.
    v_major_conditions TEXT[] := ARRAY['first_ever_major', 'repeat_major_recent_window', 'major_after_coach_directive', 'major_after_intervention'];
    v_critical_conditions TEXT[] := ARRAY['first_ever_critical', 'repeat_critical_recent_window', 'critical_after_coaching_or_intervention', 'further_critical_after_stage3'];
    v_session_severity_log JSONB := '[]'::jsonb;

    -- Dimension Severity Score accumulation (§11) — exactly 4 execution
    -- dimensions; PREPARATION/OUTCOMES-tagged actions are excluded, same
    -- guard as scoreAllDimensions() in executionEngine.ts.
    v_score_discipline NUMERIC := 0;
    v_score_technical NUMERIC := 0;
    v_score_mental NUMERIC := 0;
    v_score_learning NUMERIC := 0;
    v_hardgate_discipline BOOLEAN := false;
    v_hardgate_technical BOOLEAN := false;
    v_hardgate_mental BOOLEAN := false;
    v_hardgate_learning BOOLEAN := false;
    v_rating_discipline TEXT;
    v_rating_technical TEXT;
    v_rating_mental TEXT;
    v_rating_learning TEXT;
    v_any_hardgate BOOLEAN;
    v_any_critical BOOLEAN;
    v_strong_count INT;
    v_weak_count INT;
    v_strong_or_acceptable INT;
    v_execution_hard_gate BOOLEAN;
    v_execution_medal TEXT;

    -- Verdict (§13)
    v_hard_gate_violation BOOLEAN;
    v_good_execution BOOLEAN;
    v_poor_execution BOOLEAN;
    v_verdict_classification TEXT;
    v_verdict_headline TEXT;

    v_coaching_priorities_snapshot JSONB;
BEGIN
    -- 0. Resolve required foreign keys — fail loudly if anything is missing,
    -- never insert a placeholder into a NOT NULL/FK column.
    SELECT player_id, contract_id, preparation_id, status
    INTO v_player_id, v_contract_id, v_prep_record_id, v_session_status
    FROM sessions WHERE id = p_session_id;

    IF v_player_id IS NULL THEN
        RAISE EXCEPTION 'perform_end_session: session % not found', p_session_id;
    END IF;

    -- Ownership check (previously absent — the finding this migration
    -- rectifies): only the player who owns this session may finalize it.
    IF v_player_id <> auth.uid() THEN
        RAISE EXCEPTION 'perform_end_session: not authorized for this session';
    END IF;

    -- Idempotency guard (previously absent): a double-submitted or retried
    -- finalization call must not silently create a second verdict/
    -- assessment set for the same session.
    IF v_session_status = 'FINALIZED' THEN
        RAISE EXCEPTION 'perform_end_session: session already finalized';
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

    -- Preparation Medal (§13) — looked up now, ahead of classification
    -- below. NULL-safe by construction: if v_prep_record_id doesn't
    -- resolve to a row (e.g. a legacy session predating mandatory
    -- preparation), v_prep_medal stays NULL and `v_prep_medal = 'NONE'`
    -- simply never matches, so classification is never penalized on a
    -- lookup gap.
    SELECT medal_tier::text INTO v_prep_medal FROM preparation_records WHERE id = v_prep_record_id;

    -- 1. Finalize each tournament + attribute return to the final entry.
    -- Every referenced tournament id is checked against session_id here —
    -- previously nothing stopped p_tournament_finishes from naming a
    -- tournament belonging to a different session (even another player's).
    -- (Session status is intentionally NOT set to FINALIZED yet — the
    -- fn_check_session_finalized trigger blocks tournament/entry writes
    -- once a session is finalized, so this must run while status is still
    -- ACTIVE/REVIEW_PENDING. Session status flips to FINALIZED as the very
    -- last step below, once everything else is genuinely complete.)
    FOR v_t_id, v_finish IN SELECT key, value FROM jsonb_each(p_tournament_finishes) LOOP
        IF NOT EXISTS (SELECT 1 FROM tournaments WHERE id = v_t_id::UUID AND session_id = p_session_id) THEN
            RAISE EXCEPTION 'perform_end_session: tournament_finishes references tournament % outside this session', v_t_id;
        END IF;

        UPDATE tournaments
        SET winnings_gross = (v_finish->>'winnings_gross')::NUMERIC,
            best_rank = (v_finish->>'best_rank')::INT,
            itm_yn = (v_finish->>'itm_yn')::BOOLEAN,
            final_table_yn = (v_finish->>'final_table_yn')::BOOLEAN,
            comments = v_finish->>'comments'
        WHERE id = v_t_id::UUID AND session_id = p_session_id;

        SELECT SUM(investment) INTO v_total_cost FROM tournament_entries WHERE tournament_id = v_t_id::UUID;

        UPDATE tournaments
        SET net_return = (v_finish->>'winnings_gross')::NUMERIC - COALESCE(v_total_cost, 0)
        WHERE id = v_t_id::UUID AND session_id = p_session_id;

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

    -- 1.5. Recompute session-level Outcome facts (§6/§8) from the now-
    -- finalized tournaments themselves — never trust a client-supplied
    -- P&L/ITM-rate/final-table figure.
    SELECT
        COALESCE(SUM(net_return) FILTER (WHERE net_return IS NOT NULL), 0),
        COUNT(*) FILTER (WHERE net_return IS NOT NULL AND itm_yn = true),
        COUNT(*) FILTER (WHERE net_return IS NOT NULL),
        COALESCE(BOOL_OR(final_table_yn) FILTER (WHERE net_return IS NOT NULL), false)
    INTO v_final_pnl, v_itm_count, v_finalized_count, v_had_final_table
    FROM tournaments
    WHERE session_id = p_session_id;

    v_itm_rate := CASE WHEN v_finalized_count > 0 THEN v_itm_count::NUMERIC / v_finalized_count ELSE 0 END;

    -- BRM compliance (§6/§8) — the client-set status is still consulted
    -- (it also captures exceeded-buy-in-count/stop-loss-timing violations
    -- not re-derived here), but it's now ANDed with an independent,
    -- server-side re-check of every played tournament's name against the
    -- actual locked contract. See this migration's header (C4): the client
    -- status alone was previously fully trusted, so a fabricated
    -- is_unauthorized: false / status: 'COMPLETED' entry for a genuinely
    -- unauthorized tournament silently passed BRM compliance.
    SELECT
      (NOT EXISTS (
        SELECT 1 FROM tournament_entries te
        JOIN tournaments t ON t.id = te.tournament_id
        WHERE t.session_id = p_session_id AND te.status = 'NON_COMPLIANT'
      ))
      AND NOT EXISTS (
        SELECT 1 FROM tournaments t
        WHERE t.session_id = p_session_id
          AND NOT public.fn_tournament_contract_authorized(p_session_id, t.name)
      )
    INTO v_brm_compliant;
    v_outcome_hard_gate := NOT v_brm_compliant;

    -- Outcome Medal (§8) — outcomeEngine.computeOutcomeMedal, ported verbatim.
    v_positive := v_final_pnl > 0;
    IF v_outcome_hard_gate OR NOT v_positive OR NOT v_brm_compliant THEN
        v_outcome_medal := 'NONE';
    ELSIF v_had_final_table THEN
        v_outcome_medal := 'GOLD';
    ELSIF v_itm_rate >= 0.5 THEN
        v_outcome_medal := 'SILVER';
    ELSE
        v_outcome_medal := 'BRONZE';
    END IF;

    -- 2. Mistake tags -> execution_action_occurrences (+ tournament_mistakes
    -- join). Each occurrence gets a distinct, strictly-increasing
    -- occurred_at (base_now + index milliseconds) rather than a single
    -- shared NOW() — otherwise two mistake tags of the SAME action in one
    -- review would tie on occurred_at and neither could ever see the other
    -- as a "prior occurrence" in the escalation walk below (see
    -- 20260721060000's header comment on the latent bug this also fixes).
    -- tournament_id, when present, is checked against session_id — the
    -- same ownership gap p_tournament_finishes had above. v_tag_is_hard_gate
    -- is looked up per tag and drives BOTH is_non_compliant and
    -- hard_gate_triggered below — see 20260723010000's header comment.
    FOR v_tag, v_tag_idx IN
        SELECT "value", "ordinality" FROM jsonb_array_elements(p_mistake_tags) WITH ORDINALITY AS t("value", "ordinality")
    LOOP
        v_eao_id := "gen_random_uuid"();
        v_mistake_ts := v_base_now + (v_tag_idx * INTERVAL '1 millisecond');

        IF (v_tag->>'tournament_id') IS NOT NULL AND (v_tag->>'tournament_id') <> '' THEN
            IF NOT EXISTS (SELECT 1 FROM tournaments WHERE id = (v_tag->>'tournament_id')::UUID AND session_id = p_session_id) THEN
                RAISE EXCEPTION 'perform_end_session: mistake tag references tournament % outside this session', v_tag->>'tournament_id';
            END IF;
        END IF;

        SELECT is_hard_gate INTO v_tag_is_hard_gate
        FROM execution_actions WHERE id = (v_tag->>'execution_action_id')::UUID;
        v_tag_is_hard_gate := COALESCE(v_tag_is_hard_gate, false);

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
            v_tag_is_hard_gate, v_tag_is_hard_gate, NULL,
            'PLAYER_TAGGED', v_mistake_ts
        );

        IF (v_tag->>'tournament_id') IS NOT NULL AND (v_tag->>'tournament_id') <> '' THEN
            INSERT INTO tournament_mistakes (id, tournament_id, execution_action_occurrence_id)
            VALUES ("gen_random_uuid"(), (v_tag->>'tournament_id')::UUID, v_eao_id);
        END IF;
    END LOOP;

    -- 3. Walk every occurrence in this session, chronologically, computing
    -- its escalation stage transition (§12 — escalationEngine.ts, ported
    -- verbatim: always the HIGHEST satisfied stage, never the first match)
    -- and, in the same pass, accumulating its contribution to the
    -- Dimension Severity Score (§11 — executionEngine.ts, ported verbatim).
    -- escalation_tracks is read and written IN PLACE inside this loop, so a
    -- second occurrence of the same action later in this same session
    -- correctly sees the first one's just-computed stage as its own
    -- "current stage" input — no separate running-stage map needed.
    FOR v_occ IN
        SELECT eao.id, eao.execution_action_id, eao.occurred_at,
               ea.base_severity, ea.dimension, ea.is_hard_gate
        FROM execution_action_occurrences eao
        JOIN execution_actions ea ON ea.id = eao.execution_action_id
        WHERE eao.session_id = p_session_id
        ORDER BY eao.occurred_at ASC
    LOOP
        -- Serialize concurrent finalizations that would otherwise both read
        -- the same escalation_tracks row's stale current_stage_index and
        -- race to write it back (see this migration's header, H7). Held
        -- for the rest of this transaction — a second concurrent
        -- perform_end_session call touching the same (player, action)
        -- track blocks here until the first commits, then reads the
        -- now-current stage. Namespaced with a fixed first key so this
        -- doesn't collide with advisory locks taken elsewhere for an
        -- unrelated purpose.
        PERFORM pg_advisory_xact_lock(hashtext('escalation_track'), hashtext(v_player_id::text || ':' || v_occ.execution_action_id::text));

        v_current_stage := NULL;
        SELECT current_stage_index INTO v_current_stage
        FROM escalation_tracks
        WHERE player_id = v_player_id AND execution_action_id = v_occ.execution_action_id;
        IF v_current_stage IS NULL THEN
            v_current_stage := 0;
        END IF;

        SELECT COUNT(*) INTO v_prior_occurrences_recent
        FROM execution_action_occurrences eao2
        JOIN sessions s2 ON s2.id = eao2.session_id
        WHERE s2.player_id = v_player_id
          AND eao2.execution_action_id = v_occ.execution_action_id
          AND eao2.occurred_at < v_occ.occurred_at
          AND eao2.occurred_at >= v_occ.occurred_at - INTERVAL '7 days';

        SELECT COUNT(*) INTO v_prior_occurrences_short_term
        FROM execution_action_occurrences eao2
        JOIN sessions s2 ON s2.id = eao2.session_id
        WHERE s2.player_id = v_player_id
          AND eao2.execution_action_id = v_occ.execution_action_id
          AND eao2.occurred_at < v_occ.occurred_at
          AND eao2.occurred_at >= v_occ.occurred_at - INTERVAL '30 days';

        v_prior_minor_at_stage2 := (v_current_stage = 2 AND v_prior_occurrences_short_term > 0);

        -- Was there ever a prior MAJOR/CRITICAL transition for this track —
        -- reconstructed from actual satisfied conditions (persisted
        -- history + this-session log), not stage position. See
        -- 20260724150000's header for why the old (v_current_stage >= N)
        -- check was wrong.
        SELECT (
            EXISTS (
                SELECT 1 FROM escalation_events ee
                JOIN escalation_tracks et ON et.id = ee.track_id
                WHERE et.player_id = v_player_id AND et.execution_action_id = v_occ.execution_action_id
                  AND ee.satisfied_conditions ?| v_major_conditions
            ) OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_session_severity_log) e
                WHERE (e->>'action_id')::UUID = v_occ.execution_action_id
                  AND (e->'conditions') ?| v_major_conditions
            )
        ) INTO v_prior_major_ever;

        SELECT (
            EXISTS (
                SELECT 1 FROM escalation_events ee
                JOIN escalation_tracks et ON et.id = ee.track_id
                WHERE et.player_id = v_player_id AND et.execution_action_id = v_occ.execution_action_id
                  AND ee.satisfied_conditions ?| v_critical_conditions
            ) OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_session_severity_log) e
                WHERE (e->>'action_id')::UUID = v_occ.execution_action_id
                  AND (e->'conditions') ?| v_critical_conditions
            )
        ) INTO v_prior_critical_ever;

        SELECT (
            EXISTS (
                SELECT 1 FROM escalation_events ee
                JOIN escalation_tracks et ON et.id = ee.track_id
                WHERE et.player_id = v_player_id AND et.execution_action_id = v_occ.execution_action_id
                  AND ee.satisfied_conditions ?| v_critical_conditions
                  AND ee.created_at < v_occ.occurred_at
                  AND ee.created_at >= v_occ.occurred_at - INTERVAL '7 days'
            ) OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(v_session_severity_log) e
                WHERE (e->>'action_id')::UUID = v_occ.execution_action_id
                  AND (e->'conditions') ?| v_critical_conditions
                  AND (e->>'occurred_at')::TIMESTAMPTZ < v_occ.occurred_at
                  AND (e->>'occurred_at')::TIMESTAMPTZ >= v_occ.occurred_at - INTERVAL '7 days'
            )
        ) INTO v_prior_critical_recent;

        -- coach_directives is scoped to the specific action it names
        -- (20260724160000) and excludes retracted ones (this migration) —
        -- a retracted directive no longer counts as "the coach already
        -- flagged this" for escalation purposes.
        SELECT EXISTS (
            SELECT 1 FROM coach_directives
            WHERE player_id = v_player_id
              AND execution_action_id = v_occ.execution_action_id
              AND created_at < v_occ.occurred_at
              AND retracted_at IS NULL
        ) INTO v_prior_directive;

        SELECT EXISTS (
            SELECT 1 FROM intervention_assignments
            WHERE player_id = v_player_id
              AND execution_action_id = v_occ.execution_action_id
              AND assigned_at < v_occ.occurred_at
        ) INTO v_prior_intervention;

        v_major_after_directive := (v_prior_directive AND v_current_stage >= 3);
        v_major_after_intervention := (v_prior_intervention AND v_current_stage >= 3);
        v_critical_after_coaching := ((v_prior_directive OR v_prior_intervention) AND v_current_stage >= 5);

        v_candidates := ARRAY[v_current_stage];
        v_satisfied := ARRAY[]::TEXT[];

        -- NOTE: appends below use array_append(), not `v_satisfied || '...'`
        -- — see 20260721060000's header comment for why the `||` form
        -- raised "malformed array literal" at runtime.
        IF v_occ.base_severity = 'MINOR' THEN
            IF v_current_stage = 0 THEN
                v_candidates := v_candidates || 1;
                v_satisfied := array_append(v_satisfied, 'first_minor_at_baseline');
            END IF;
            IF v_prior_occurrences_recent > 0 THEN
                v_candidates := v_candidates || 2;
                v_satisfied := array_append(v_satisfied, 'repeat_minor_recent_window');
            END IF;
            IF v_prior_minor_at_stage2 THEN
                v_candidates := v_candidates || 3;
                v_satisfied := array_append(v_satisfied, 'minor_persists_into_short_term');
            END IF;
        END IF;

        IF v_occ.base_severity = 'MAJOR' THEN
            IF NOT v_prior_major_ever THEN
                v_candidates := v_candidates || 3;
                v_satisfied := array_append(v_satisfied, 'first_ever_major');
            END IF;
            IF v_prior_occurrences_recent > 0 THEN
                v_candidates := v_candidates || 4;
                v_satisfied := array_append(v_satisfied, 'repeat_major_recent_window');
            END IF;
            IF v_major_after_directive THEN
                v_candidates := v_candidates || 5;
                v_satisfied := array_append(v_satisfied, 'major_after_coach_directive');
            END IF;
            IF v_major_after_intervention THEN
                v_candidates := v_candidates || 6;
                v_satisfied := array_append(v_satisfied, 'major_after_intervention');
            END IF;
        END IF;

        IF v_occ.base_severity = 'CRITICAL' THEN
            IF NOT v_prior_critical_ever THEN
                v_candidates := v_candidates || 5;
                v_satisfied := array_append(v_satisfied, 'first_ever_critical');
            END IF;
            IF v_prior_critical_recent THEN
                v_candidates := v_candidates || 6;
                v_satisfied := array_append(v_satisfied, 'repeat_critical_recent_window');
            END IF;
            IF v_critical_after_coaching THEN
                v_candidates := v_candidates || 7;
                v_satisfied := array_append(v_satisfied, 'critical_after_coaching_or_intervention');
            END IF;
            IF v_current_stage >= 7 THEN
                v_candidates := v_candidates || 8;
                v_satisfied := array_append(v_satisfied, 'further_critical_after_stage3');
            END IF;
        END IF;

        SELECT MAX(c) INTO v_new_stage FROM unnest(v_candidates) AS c;

        -- Record this occurrence's own satisfied conditions into the
        -- same-session log so a LATER occurrence of the same action (later
        -- in this loop) can see it for its own history checks above — see
        -- 20260724150000's header on why escalation_events alone isn't
        -- enough for the recency check.
        v_session_severity_log := v_session_severity_log || jsonb_build_object(
            'action_id', v_occ.execution_action_id,
            'occurred_at', v_occ.occurred_at,
            'conditions', to_jsonb(v_satisfied)
        );

        -- §13 "Violations and repeat offences" tier — a track reaching
        -- Critical Escalation Stage (>=5) this session is tracked here so
        -- classification below can treat it as its own severity signal,
        -- distinct from hard-gate violations (see this migration's header).
        IF v_new_stage >= 5 THEN
            v_any_critical_escalation := true;
        END IF;

        UPDATE execution_action_occurrences
        SET escalation_stage_produced = v_new_stage
        WHERE id = v_occ.id;

        SELECT id INTO v_track_id FROM escalation_tracks
        WHERE player_id = v_player_id AND execution_action_id = v_occ.execution_action_id;

        IF v_track_id IS NULL THEN
            v_track_id := "gen_random_uuid"();
            INSERT INTO escalation_tracks (id, player_id, execution_action_id, current_stage_index, last_occurrence_at)
            VALUES (v_track_id, v_player_id, v_occ.execution_action_id, v_new_stage, v_occ.occurred_at);
        ELSE
            UPDATE escalation_tracks
            SET current_stage_index = v_new_stage, last_occurrence_at = v_occ.occurred_at
            WHERE id = v_track_id;
        END IF;

        INSERT INTO escalation_events (id, track_id, rule_version_id, old_stage, new_stage, satisfied_conditions, created_at)
        VALUES ("gen_random_uuid"(), v_track_id, v_escalation_rule_version_id, v_current_stage, v_new_stage, to_jsonb(v_satisfied), NOW());

        -- Dimension Severity Score (§11): base_points[severity] + 2 * the
        -- POST-event escalation stage just produced by this occurrence.
        IF v_occ.dimension IN ('DISCIPLINE_PROCESS', 'TECHNICAL_PLAY', 'MENTAL_GAME', 'LEARNING_IMPROVEMENT') THEN
            v_base_points := CASE v_occ.base_severity
                WHEN 'MINOR' THEN 1 WHEN 'MAJOR' THEN 4 WHEN 'CRITICAL' THEN 10 ELSE 0 END;
            v_occurrence_score := v_base_points + 2 * v_new_stage;

            CASE v_occ.dimension
                WHEN 'DISCIPLINE_PROCESS' THEN
                    v_score_discipline := v_score_discipline + v_occurrence_score;
                    IF v_occ.is_hard_gate THEN v_hardgate_discipline := true; END IF;
                WHEN 'TECHNICAL_PLAY' THEN
                    v_score_technical := v_score_technical + v_occurrence_score;
                    IF v_occ.is_hard_gate THEN v_hardgate_technical := true; END IF;
                WHEN 'MENTAL_GAME' THEN
                    v_score_mental := v_score_mental + v_occurrence_score;
                    IF v_occ.is_hard_gate THEN v_hardgate_mental := true; END IF;
                WHEN 'LEARNING_IMPROVEMENT' THEN
                    v_score_learning := v_score_learning + v_occurrence_score;
                    IF v_occ.is_hard_gate THEN v_hardgate_learning := true; END IF;
                ELSE NULL;
            END CASE;
        END IF;
    END LOOP;

    -- 4. Rating per dimension (§11 Step 3) — hard gate always overrides the
    -- score-based path, regardless of the accumulated score.
    v_rating_discipline := CASE
        WHEN v_hardgate_discipline THEN 'CRITICAL'
        WHEN v_score_discipline >= 10 THEN 'CRITICAL'
        WHEN v_score_discipline >= 5 THEN 'WEAK'
        WHEN v_score_discipline >= 1 THEN 'ACCEPTABLE'
        ELSE 'STRONG' END;
    v_rating_technical := CASE
        WHEN v_hardgate_technical THEN 'CRITICAL'
        WHEN v_score_technical >= 10 THEN 'CRITICAL'
        WHEN v_score_technical >= 5 THEN 'WEAK'
        WHEN v_score_technical >= 1 THEN 'ACCEPTABLE'
        ELSE 'STRONG' END;
    v_rating_mental := CASE
        WHEN v_hardgate_mental THEN 'CRITICAL'
        WHEN v_score_mental >= 10 THEN 'CRITICAL'
        WHEN v_score_mental >= 5 THEN 'WEAK'
        WHEN v_score_mental >= 1 THEN 'ACCEPTABLE'
        ELSE 'STRONG' END;
    v_rating_learning := CASE
        WHEN v_hardgate_learning THEN 'CRITICAL'
        WHEN v_score_learning >= 10 THEN 'CRITICAL'
        WHEN v_score_learning >= 5 THEN 'WEAK'
        WHEN v_score_learning >= 1 THEN 'ACCEPTABLE'
        ELSE 'STRONG' END;

    v_any_hardgate := v_hardgate_discipline OR v_hardgate_technical OR v_hardgate_mental OR v_hardgate_learning;
    v_any_critical := (v_rating_discipline = 'CRITICAL') OR (v_rating_technical = 'CRITICAL')
                    OR (v_rating_mental = 'CRITICAL') OR (v_rating_learning = 'CRITICAL');
    v_execution_hard_gate := v_any_hardgate;

    -- Execution Medal (§11 default logic) — executionEngine.computeExecutionMedal, ported verbatim.
    IF v_any_hardgate OR v_any_critical THEN
        v_execution_medal := 'NONE';
    ELSE
        v_strong_count := (CASE WHEN v_rating_discipline = 'STRONG' THEN 1 ELSE 0 END)
                        + (CASE WHEN v_rating_technical = 'STRONG' THEN 1 ELSE 0 END)
                        + (CASE WHEN v_rating_mental = 'STRONG' THEN 1 ELSE 0 END)
                        + (CASE WHEN v_rating_learning = 'STRONG' THEN 1 ELSE 0 END);
        v_weak_count := (CASE WHEN v_rating_discipline = 'WEAK' THEN 1 ELSE 0 END)
                      + (CASE WHEN v_rating_technical = 'WEAK' THEN 1 ELSE 0 END)
                      + (CASE WHEN v_rating_mental = 'WEAK' THEN 1 ELSE 0 END)
                      + (CASE WHEN v_rating_learning = 'WEAK' THEN 1 ELSE 0 END);
        v_strong_or_acceptable := (CASE WHEN v_rating_discipline IN ('STRONG', 'ACCEPTABLE') THEN 1 ELSE 0 END)
                                + (CASE WHEN v_rating_technical IN ('STRONG', 'ACCEPTABLE') THEN 1 ELSE 0 END)
                                + (CASE WHEN v_rating_mental IN ('STRONG', 'ACCEPTABLE') THEN 1 ELSE 0 END)
                                + (CASE WHEN v_rating_learning IN ('STRONG', 'ACCEPTABLE') THEN 1 ELSE 0 END);

        IF v_strong_or_acceptable = 4 AND v_strong_count >= 3 THEN
            v_execution_medal := 'GOLD';
        ELSIF v_strong_or_acceptable >= 3 AND v_weak_count <= 1 THEN
            v_execution_medal := 'SILVER';
        ELSIF v_weak_count <= 2 THEN
            v_execution_medal := 'BRONZE';
        ELSE
            v_execution_medal := 'NONE';
        END IF;
    END IF;

    -- 5. Verdict classification + headline (§13) — verdictEngine.ts's
    -- classifyVerdict/buildHeadline, ported verbatim (see this migration's
    -- header for the two branches new to this pass). Never reasons from
    -- P&L sign first: hard gate / Critical Escalation is checked before
    -- positive/negative, and Preparation only ever narrows a WIN down to
    -- MIXED_SESSION, never independently worsens a classification.
    v_hard_gate_violation := v_execution_hard_gate OR v_outcome_hard_gate;
    v_good_execution := v_execution_medal IN ('GOLD', 'SILVER');
    v_poor_execution := v_execution_medal = 'NONE';

    IF v_hard_gate_violation OR v_any_critical_escalation THEN
        v_verdict_classification := CASE WHEN v_positive THEN 'LUCKY_ESCAPE' ELSE 'DESERVED_LOSS' END;
    ELSIF v_poor_execution AND v_positive THEN
        v_verdict_classification := 'LUCKY_ESCAPE';
    ELSIF v_good_execution AND NOT v_positive THEN
        v_verdict_classification := 'PROFESSIONAL_LOSS';
    ELSIF v_good_execution AND v_positive THEN
        v_verdict_classification := CASE WHEN v_prep_medal = 'NONE' THEN 'MIXED_SESSION' ELSE 'PROFESSIONAL_WIN' END;
    ELSIF v_poor_execution AND NOT v_positive THEN
        v_verdict_classification := 'DESERVED_LOSS';
    ELSE
        v_verdict_classification := 'MIXED_SESSION';
    END IF;

    SELECT string_agg(initcap(lower(word)), ' ' ORDER BY ord)
    INTO v_verdict_headline
    FROM unnest(string_to_array(v_verdict_classification, '_')) WITH ORDINALITY AS t(word, ord);

    -- 6. Coaching priorities snapshot — read fresh, never trust a
    -- client-supplied array here.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'description', description, 'status', status)), '[]'::jsonb)
    INTO v_coaching_priorities_snapshot
    FROM coaching_priorities
    WHERE player_id = v_player_id AND status = 'ACTIVE';

    -- 7. Execution assessment + its four dimension ratings.
    INSERT INTO session_execution_assessments (
        id, session_id, revision_number, is_current, taxonomy_version_id,
        hard_gate_triggered, system_execution_medal, final_execution_medal, created_at
    ) VALUES (
        v_exec_assessment_id, p_session_id, 1, true, v_taxonomy_version_id,
        v_execution_hard_gate, v_execution_medal::medal_type, v_execution_medal::medal_type, NOW()
    );

    INSERT INTO session_execution_dimension_assessments (id, assessment_id, dimension, system_rating, final_rating)
    VALUES
        ("gen_random_uuid"(), v_exec_assessment_id, 'DISCIPLINE_PROCESS', v_rating_discipline, v_rating_discipline),
        ("gen_random_uuid"(), v_exec_assessment_id, 'TECHNICAL_PLAY', v_rating_technical, v_rating_technical),
        ("gen_random_uuid"(), v_exec_assessment_id, 'MENTAL_GAME', v_rating_mental, v_rating_mental),
        ("gen_random_uuid"(), v_exec_assessment_id, 'LEARNING_IMPROVEMENT', v_rating_learning, v_rating_learning);

    -- 8. Outcome assessment.
    INSERT INTO session_outcome_assessments (
        id, session_id, revision_number, is_current, rule_version_id,
        final_session_net_pnl, brm_compliance, hard_gate_triggered, system_outcome_medal, created_at
    ) VALUES (
        v_outcome_assessment_id, p_session_id, 1, true, v_rule_version_id,
        v_final_pnl, v_brm_compliant, v_outcome_hard_gate, v_outcome_medal::medal_type, NOW()
    );

    -- 9. Verdict + evidence + generation context. reflection_prose is the
    -- AI-generated closing paragraph computed client-side (see
    -- verdictReflection.ts) BEFORE this call, from the deterministic
    -- evidence above plus the player's own free text — it describes/
    -- synthesizes, it does not decide anything computed in this function.
    INSERT INTO verdicts (id, session_id, revision_number, is_current, classification, headline, reflection_prose, created_at)
    VALUES (v_verdict_id, p_session_id, 1, true, v_verdict_classification::verdict_classification, v_verdict_headline, p_reflection_prose, NOW());

    -- evidence_entity_id is NOT NULL, but the client can't know
    -- v_exec_assessment_id / v_outcome_assessment_id until this function
    -- generates them above — fall back to resolving by entity_type here
    -- whenever the client leaves it unset. p_verdict_evidence remains
    -- client-supplied prose (see migration header) — it describes the
    -- deterministic facts computed above, it does not decide them.
    INSERT INTO verdict_evidence_items (id, verdict_id, section, claim_text, confidence_level, evidence_entity_type, evidence_entity_id, created_at)
    SELECT "gen_random_uuid"(), v_verdict_id,
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
        "gen_random_uuid"(), v_verdict_id, v_framework_version_id, v_brm_assignment_id, v_prep_record_id,
        v_exec_assessment_id, v_outcome_assessment_id, v_coaching_priorities_snapshot,
        p_behavioral_snapshot_id, NOW()
    );

    -- 10. Finalize the session — LAST, on purpose. Everything above has now
    -- genuinely completed, so it's safe to flip status to FINALIZED without
    -- the fn_check_session_finalized trigger blocking any of the writes
    -- above it (that trigger only blocks tournament/entry mutation once the
    -- session is ALREADY finalized — it does not run against sessions
    -- itself, and by this point nothing further in this function touches
    -- tournaments or tournament_entries). reflection_note is the player's
    -- own raw end-of-session reflection text — persisted unconditionally
    -- whenever typed, independent of whether reflection_prose above
    -- generated successfully.
    UPDATE sessions
    SET status = 'FINALIZED',
        end_time = NOW(),
        execution_medal = v_execution_medal::medal_type,
        outcome_medal = v_outcome_medal::medal_type,
        reflection_note = p_reflection_note
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'verdict_id', v_verdict_id,
        'execution_assessment_id', v_exec_assessment_id,
        'outcome_assessment_id', v_outcome_assessment_id,
        'execution_medal', v_execution_medal,
        'outcome_medal', v_outcome_medal,
        'verdict_classification', v_verdict_classification,
        'verdict_headline', v_verdict_headline,
        'final_pnl', v_final_pnl,
        'dimension_ratings', jsonb_build_array(
            jsonb_build_object('dimension', 'DISCIPLINE_PROCESS', 'rating', v_rating_discipline),
            jsonb_build_object('dimension', 'TECHNICAL_PLAY', 'rating', v_rating_technical),
            jsonb_build_object('dimension', 'MENTAL_GAME', 'rating', v_rating_mental),
            jsonb_build_object('dimension', 'LEARNING_IMPROVEMENT', 'rating', v_rating_learning)
        )
    );
END;
$$;
