# Changes since last commit

Base commit: `6b8feb8` — "Session log" (2026-07-16)

This covers everything currently uncommitted in the working tree on
`feature/engines`, committed here to a new branch, `Clauded`. It's a large
diff: most of it is pre-existing work already in progress on this branch
before this session started (a substantial feature build-out — new coach
config screens, deterministic engines, and the whole Supabase/DB layer).
The "This session" section below is what was actually done in the
conversation that produced this commit; everything after that is a
best-effort inventory of the rest of the diff, grounded in file names and
existing header comments rather than a line-by-line review.

## This session

### Bug fixes
- **BRM buy-in-amount hard gate was never enforced.** `tournaments.ts` only
  checked buy-in *count* against the Session Contract's `permitted_buy_ins`
  — the separate PRD §10 hard gate for buy-in *amount* exceeding the
  BRM-level cap (`brm_levels.max_tournament_buy_in`) was never implemented,
  so overshooting a buy-in never flagged non-compliant, never broke BRM
  compliance, and medals were still awarded. Added `exceededMaxBuyIn` to
  `ComplianceFlags`, resolved the BRM level's cap via the session's locked
  Weekly BRM Assignment, and flagged/recorded it on both
  `logNewTournamentEntry` and `logReEntry`. Surfaced in `TournamentLog.tsx`'s
  compliance banner.
- **Session Contract creation could crash with a duplicate-key error**
  (`session_contract_tournaments_session_contract_id_slot_numbe_key`).
  Table/slot numbers intentionally reset per (day, session) sitting in the
  Weekly Game Plan (`WeeklyGamePlanView.tsx`'s `addTournament`), so the same
  slot number legitimately repeats across different days — but
  `SessionContractView.tsx` was offering the *entire week's* tournaments as
  one flat picker with no day scoping, so selecting tournaments from two
  different days sharing a table number violated the DB's per-contract
  uniqueness constraint. Now scopes the picker to today's planned
  tournaments (`sessionContract.ts`'s new `computeTodayBoundaries`
  export + `toLocalDateKey`), plus a defensive duplicate-slot-number check
  in `handleValidate` with a clear error message instead of a raw DB
  failure.
- **Voice input in Session Review reflection did nothing.** The "Voice"
  toggle only flipped a cosmetic `voiceMode` flag; there was no
  `SpeechRecognition` wiring behind it. Extracted the working
  cross-browser Web Speech API wrapper out of `DeepAnalysisPanel.tsx` into
  a shared `src/lib/speechRecognition.ts`, and wired real start/stop
  listening + transcript-append into `SessionReview.tsx`'s reflection step
  (disabled with a tooltip in browsers without support, same as
  `DeepAnalysisPanel` already did).

### New feature: reflection visibility
- The player's raw post-session reflection note (`sessions.reflection_note`
  — separate from the AI-paraphrased `verdicts.reflection_prose` already
  shown on the Verdict Card) was captured but never displayed anywhere, to
  either the player or the coach.
- Added `src/components/ReflectionModal.tsx`, a shared read-only viewer.
- `SessionLog.tsx` (player's session register) and `CoachBriefView.tsx`
  (coach's per-player P.E.O. summary) both gained a **REFLECTION** column
  with a "See Reflection" link opening the same modal.

### Security audit: SECURITY DEFINER RPC bypasses via permissive RLS
Prompted by a report that a dead `startSession()` client helper
(`src/lib/supabase.ts`) inserted directly into `sessions`, bypassing the
preparation gate, the 2-sessions-per-poker-day cap, and contract locking
that the real `perform_start_session` RPC enforces. Removed the dead
function (and its unused import in `PlayerShell.tsx` — it was never called
anywhere), then audited every table `perform_start_session` and
`perform_end_session` (both `SECURITY DEFINER`) write to, for the same
class of gap: an RLS policy loose enough that a direct client write could
bypass what the RPC guarantees. Found three, all shipped as migrations,
each verified against every actual client call site in `src/` before
narrowing:

1. **`sessions` — direct INSERT bypass.** `"Players insert own sessions"`
   only checked the target contract was the player's own and `VALIDATED` —
   none of the RPC's checks (preparation required, 2-per-day cap, contract
   locking). Dropped the policy entirely; the sole legitimate path
   (`sessionContract.ts`'s `lockContractAndStartSession`) already only ever
   calls the RPC, which is unaffected since `SECURITY DEFINER` functions
   bypass RLS as their owner.
2. **`sessions` — UPDATE column smuggling & `session_contracts` — UPDATE/
   DELETE wide open.** The two `sessions` status-transition policies only
   constrained `player_id`/`status` in `WITH CHECK`, leaving
   `execution_medal`/`outcome_medal`/etc. unconstrained in the same
   statement — a player could self-award medals directly. Fixed via
   column-level `GRANT UPDATE (status, end_time)`, matching the only two
   columns `endSession.ts` ever legitimately writes. Separately,
   `session_contracts` had no `WITH CHECK` at all beyond `player_id` and
   covered every command — a player could rewrite
   `remaining_day_capacity_snapshot`/`remaining_week_capacity_snapshot`/
   `effective_session_loss_limit_at_creation` directly, defeating the
   Stop-Loss compliance check in `tournaments.ts` that trusts those columns
   as ground truth. No client code ever calls `.update()`/`.delete()` on
   `session_contracts`, so both were revoked entirely.
3. **`execution_action_occurrences` — spoofable `hard_gate_triggered`.**
   The INSERT policy didn't verify the flag matched the referenced action's
   real `is_hard_gate`. Doesn't rig scoring (`perform_end_session` re-joins
   `execution_actions.is_hard_gate` fresh, never trusts the stored column),
   but did let a player suppress their own violation from
   `coachBrief.ts`'s Critical Alerts filter, which reads the stored column
   directly. Added a `WITH CHECK` requiring `hard_gate_triggered` match the
   action's actual flag (left `is_non_compliant` unconstrained — it's
   legitimately set independent of hard-gate status in the existing
   system-detected path).

New migrations (applied to the linked remote project via `supabase db
push`, confirmed in sync via `supabase migration list`):
- `20260724020000_drop_direct_session_insert_policy.sql`
- `20260724030000_restrict_session_and_contract_column_grants.sql`
- `20260724040000_enforce_truthful_hard_gate_on_occurrence_insert.sql`

### Verification
`npm run lint` (tsc) and `npm run test` (vitest, 119 tests) run clean after
every change this session. One pre-existing, unrelated typecheck error in
`src/lib/deepAnalysis.ts` (confirmed present before this session touched
anything, via `git stash`) was left alone as out of scope.

## Rest of the diff (pre-existing to this session)

### New coach configuration screens
`BRMConfigView.tsx`, `EscalationConfigView.tsx`, `FrameworkConfigView.tsx`,
`InterventionsConfigView.tsx`, `TaxonomyConfigView.tsx` — coach-side
editors for BRM bankroll bands/levels/slot rules, the escalation ladder,
the Performance Framework, the Intervention Library, and the Execution
Action taxonomy, per CLAUDE.md's "coach-configured, never hardcoded" rule
for all of these domains.

### New player-facing screens
`PreparationView.tsx`, `PreparationCheckIn.tsx`, `PreGameRitual.tsx` (PRD
§2 Preparation flow), `PlayerInterventionsView.tsx`, `BehavioralProfileView.tsx`
(radar/trend view), `VerdictsView.tsx` (Verdict Card history + AI
Reflection), `DeepAnalysisPanel.tsx` (PRD §14 "Go Deeper" conversational
panel beneath a Verdict, with voice input), `CapitalMovementModal.tsx`,
`ReasonModal.tsx`.

### New deterministic engines & data-access modules (`src/lib/`)
`behavioralProfileEngine.ts` + `.test.ts`, `preparationEngine.ts` +
`.test.ts`, `brmConfig.ts`, `coachBrief.ts` (Weekly Coach Brief
assembly), `coachRoster.ts`, `deepAnalysis.ts`, `escalationConfig.ts`,
`interventions.ts`, `performanceFramework.ts`, `preparation.ts`,
`verdictProse.ts` (AI verdict-copy rewrite, bounded by bullet-count
matching), `verdictReflection.ts`, `verdicts.ts`, `weeklyBrmAssignment.ts`
+ `.test.ts`, `bankroll.ts`, `taxonomy.ts`, `useAsync.ts`. Plus new tests
for existing engines: `brmRules.test.ts`, `escalationEngine.test.ts`,
`executionEngine.test.ts`, `outcomeEngine.test.ts`, `verdictEngine.test.ts`,
`weeklyGamePlan.test.ts`.

### `server.ts`
New Express server for the two Gemini-backed routes (`/api/verdict-prose`,
`/api/deep-analysis`) — the only process that ever reads `GEMINI_API_KEY`,
per CLAUDE.md's AI-integration architecture.

### Substantial rewrites to already-tracked files
`CoachShell.tsx`, `PlayerShell.tsx`, `PlayerDashboard.tsx`,
`WeeklyGamePlanView.tsx`, `ActiveBRMView.tsx`, `ActiveFrameworkView.tsx`,
`AuthScreen.tsx`, `endSession.ts` (full end-of-session orchestration
rewrite — Execution/Outcome/Verdict computation, escalation walk,
reflection persistence), `escalationEngine.ts`, `brmRules.ts`,
`executionEngine.ts`, `outcomeEngine.ts`, `verdictEngine.ts`,
`weeklyGamePlan.ts`, `types.ts`, `utils.ts`, plus config
(`package.json`/`package-lock.json`, `tsconfig.json`, `vite.config.ts`,
`.env.example`, `.gitignore`, `README.md`, `src/index.css`).

### Documentation
`CLAUDE.md` (repo guidance for Claude Code), `PokerGOAT_PRD.md` (the full
functional spec these modules implement section-by-section).

### Database layer (`supabase/`)
`supabase/config.toml` (local CLI scaffold) and 25 migrations building out
the entire schema from `00000000000000_initial_schema.sql` forward:

| Migration | Summary |
|---|---|
| `20260718000000_require_preparation_for_session` | Requires a Preparation Check-in before a session can start; links the check-in used to the session it authorized. |
| `20260718000001_drop_old_perform_start_session_overload` | Fixes `CREATE OR REPLACE` creating a new function overload instead of replacing it. |
| `20260720063139_fix_poker_day_session_cap` | Recomputes the 2-sessions-per-poker-day cap against the real boundary-aware Poker Day instead of a rolling 24h window. |
| `20260720120000_add_change_reason_to_versions` | Adds mandatory-reason audit trail to Framework/BRM version changes. |
| `20260720130000_coach_write_policies_taxonomy_escalation_interventions` | Adds coach write RLS for Taxonomy/Escalation/Interventions config screens. |
| `20260721000000_coach_write_poker_weeks_and_brm_assignments` | Adds missing write RLS for `poker_weeks`/`weekly_brm_assignments` (previously SELECT-only, blocking all creation). |
| `20260721010000_fix_version_deactivation_rls_and_repair` | Adds missing UPDATE RLS for deactivating Framework/BRM versions; repairs affected rows. |
| `20260721020000_add_brm_slot_rules` | Moves tournament slot rules from hardcoded TS into a coach-configurable table. |
| `20260721030000_players_log_capital_movements` | Adds the auditable bankroll capital-movement ledger (PRD §4). |
| `20260721040000_harden_and_recompute_perform_end_session` | Security-hardens `perform_end_session` (explicit GRANT/REVOKE, ownership checks) and recomputes its logic. |
| `20260721050000_backfill_missing_brm_slot_rules` | Backfills slot rules for BRM configs missing them. |
| `20260721060000_fix_perform_end_session_satisfied_conditions_array` | Fixes a malformed-array-literal runtime bug from the prior migration. |
| `20260722000000_player_complete_interventions` | Adds player-side completion tracking for Intervention Assignments. |
| `20260722010000_intervention_library_stage_and_drop_eligibility` | Simplifies escalation-stage linkage on the Intervention Library. |
| `20260722020000_drop_intervention_library_severity_tier` | Removes `severity_tier` per PRD deviation. |
| `20260722030000_add_reflection_prose_to_verdicts` | Adds `verdicts.reflection_prose` persistence for the AI Reflection closing paragraph. |
| `20260722040000_players_resume_sessions_for_editing` | Adds the reverse REVIEW_PENDING → ACTIVE transition so players can back out to fix entries. |
| `20260723000000_normalize_execution_action_detection_method` | Normalizes two inconsistent `detection_method` string formats. |
| `20260723010000_fix_player_tagged_hard_gate_visibility` | Fixes `perform_end_session` hardcoding hard-gate status on player-tagged mistakes instead of reading it. |
| `20260724000000_widen_verdict_classification_hierarchy` | Widens Verdict classification to cover repeat-offence and Preparation-medal tiers. |
| `20260724010000_drop_stale_perform_end_session_overload` | Fixes a stale-overload bug from adding trailing params to `perform_end_session`. |
| `20260724020000_drop_direct_session_insert_policy` | **This session.** Closes the direct-session-insert bypass. |
| `20260724030000_restrict_session_and_contract_column_grants` | **This session.** Column-scopes `sessions`/`session_contracts` grants. |
| `20260724040000_enforce_truthful_hard_gate_on_occurrence_insert` | **This session.** Enforces truthful `hard_gate_triggered` on insert. |
