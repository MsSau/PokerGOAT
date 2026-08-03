# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PokerGOAT (product doc calls it "Poker Edgecraft") is an accountability and coaching system for serious online tournament poker players — one PLAYER paired with one COACH. It is explicitly *not* a poker tracker or gambling dashboard: the product's core thesis is that **process is judged separately from financial outcome**, and every AI-generated claim must be traceable to inspectable evidence. The full functional spec (roles, BRM/bankroll math, execution scoring, escalation, verdicts, UI design tokens) lives in [PokerGOAT_PRD.md](PokerGOAT_PRD.md) — read the relevant section there before changing behavior in `src/lib/`, since these modules are direct implementations of specific numbered sections of that doc (each file's header comments cite the section).

## Commands

```bash
npm run dev          # vite dev server on :3000 (0.0.0.0) — frontend only
npm run server       # tsx watch server.ts — the Gemini/AI API server, on :8787 (API_PORT)
npm run dev:all       # both of the above together (concurrently) — use this for any AI feature work
npm run build         # vite build
npm run build:server  # esbuild-bundles server.ts -> server.js (the deployable artifact `clean` expects)
npm run preview   # preview built output
npm run lint      # tsc --noEmit — this IS the lint step, there is no ESLint config; typechecks server.ts too
npm run test      # vitest run — unit tests for the pure/deterministic src/lib/ engines only
npm run clean     # rimraf dist server.js
```

Vitest is configured via the `test` block in `vite.config.ts` (no separate vitest.config file — `defineConfig` there comes from `vitest/config`, which re-exports Vite's config plus the `test` field). Tests are co-located as `*.test.ts` next to the module they cover, and only target pure, side-effect-free functions (see "Deterministic engines vs. AI" below) — nothing that touches Supabase, since there is no mocking/fixture layer for that yet. Treat `npm run lint` (tsc) and `npm run test` (vitest) together as the automated correctness gates.

`npm run dev` alone does **not** serve `/api/*` — the Vite dev server proxies those requests to `server.ts` (see `vite.config.ts`'s `server.proxy`), so any Deep Analysis or Verdict-prose work needs `npm run dev:all`, not `npm run dev`.

Package manager: `package-lock.json` is the actively maintained lockfile (newer than `bun.lock`); use `npm`.

## Environment

Supabase URL/anon key are read from `import.meta.env.VITE_*` (client-side, via Vite). `src/lib/supabase.ts` has literal fallback values hardcoded inline ("to guarantee operation in the iframe") if env vars are absent — this is intentional for the AI Studio hosting environment this project targets, not dead code to clean up.

`GEMINI_API_KEY` is **not** `VITE_`-prefixed and is deliberately never read from client code — Vite's client bundler only exposes `VITE_*` vars, so the key physically cannot end up in the browser bundle. It's read exactly once, in `server.ts` (via `dotenv`, loading `.env.local`), which is the only process allowed to call Gemini — see "AI integration" below. `GEMINI_MODEL` and `API_PORT` are optional overrides (defaults: `gemini-2.5-flash`, `8787`).

`.env.example` is committed (not gitignored, by design — see `.gitignore`'s `!.env.example`) and holds only placeholder values. Note: an earlier commit (`0d4577e`) committed this file with a real `SUPABASE_SERVICE_ROLE_KEY` value; that key is in git history and should be rotated in Supabase regardless of the file now being scrubbed.

## Architecture

### Product hierarchy (drives the data model and validation order)

```
Quarterly Performance Framework → Weekly Game Plan → Session Contract → Actual Play (Tournaments/Entries)
```

Each level locks and validates against the one above it; a locked record is never mutated, only amended via an append-only audit trail (`*_amendments`, `*_substitutions` tables). "Truthful logging is never blocked" is a load-bearing product rule: non-compliant play (unauthorized tournaments, exceeding stop-loss, etc.) must always be *recordable*, only ever flagged/non-compliant — never rejected outright. When adding validation, gate authorization/creation of new plans, never gate the logging of what actually happened.

### Deterministic engines vs. AI (PRD §17.5)

`src/lib/` is deliberately split so that all scoring, medals, escalation, BRM math, and financial rollups are pure/deterministic TypeScript — AI is only ever allowed to generate prose *from* that already-computed context (Verdict copy, Deep Analysis). Never move a scoring/threshold/medal decision into a prompt; keep it in one of these modules:

- `brmRules.ts` — bankroll-band → BRM level → slot/buy-in limits (levels 6–8 intentionally left unconfigured per PRD, don't invent values)
- `executionEngine.ts` — per-dimension severity scoring → Rating → Execution Medal (hard gates always win)
- `escalationEngine.ts` — per-(player, execution action) escalation stage machine; always takes the *highest* satisfied stage on a new occurrence, never first-match
- `outcomeEngine.ts` — Outcome Medal from BRM compliance + P&L + ITM/final-table
- `verdictEngine.ts` — deterministic Verdict classification (never reasons from P&L sign first)
- `sessionContract.ts` — Day/Week stop-loss capacity math, Session Contract creation/lock/substitution
- `weeklyGamePlan.ts` — Weekly Game Plan validation against Framework/BRM, lock, append-only amendments
- `tournaments.ts` — Tournament/Entry logging, compliance-flag detection, P&L finalization (cost spread across entries, return attributed to the surviving entry)
- `endSession.ts` — orchestrates the above into one end-of-session flow, calling the atomic `perform_end_session` RPC as the single write

### AI integration (server.ts)

`GEMINI_API_KEY` is only ever used server-side, in `server.ts` (Express) — never in client code, matching `metadata.json`'s `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` declaration. Two routes, both requiring a valid Supabase bearer token (`server.ts`'s `requireUser` — validates via `auth.getUser`, doesn't authorize which record; every actual data read/write still goes through the client's own RLS-scoped Supabase session):

- `POST /api/verdict-prose` — rewrites the deterministic Verdict evidence bullets `endSession.ts` already computed into coach-voiced prose. Bounded by construction, not just prompt instructions: the server rejects any response whose per-section bullet *count* doesn't match what was sent, so the model can only reword, never add/remove/invent a claim. `src/lib/verdictProse.ts` calls this from `endSession.ts` and silently falls back to the deterministic text on any failure (offline, no key configured, malformed response) — this must never block session finalization.
- `POST /api/deep-analysis` — the player-initiated "Go Deeper" conversation (PRD §14) beneath a Verdict Card. Context (Verdict evidence, Behavioral Profile, Coach Directive) is assembled client-side by `src/lib/deepAnalysis.ts` from data the player already has RLS-scoped read access to, and passed in — the server never queries Supabase itself and stays fully stateless. Message persistence (`deep_analysis_messages`) happens client-side, through the normal Supabase client, after the reply comes back.

Local dev needs both `npm run dev` (frontend, :3000) and `npm run server` (this API, :8787) running — `npm run dev:all` runs both. Vite's dev server proxies `/api/*` to `API_PORT` (`vite.config.ts`); in production `server.ts` also serves the built `dist/` static files directly, so `npm run build:server`'s output (`server.js`) is the whole deployable app.

### Supabase (Postgres) backend

- Schema lives in `supabase/migrations/00000000000000_initial_schema.sql`; generated row types in `src/types/database.ts` (auto-generated — don't hand-edit) vs. hand-written domain types in `src/types.ts` (used by most of `src/lib/`).
- Critical multi-table state transitions are atomic Postgres RPCs, not sequential client calls: `perform_start_session`, `perform_end_session`. When a flow needs to touch >1 table transactionally (financial writes, medal/verdict writes), prefer extending one of these RPCs over adding sequential client-side inserts — `sessionContract.ts`'s `lockContractAndStartSession` is flagged in its own comments as a two-call MVP shortcut that should eventually become an RPC like these.
- New tables get RLS enabled automatically via the `rls_auto_enable` event trigger — don't add manual `ENABLE ROW LEVEL SECURITY` unless overriding that default.
- Postgres enum types (`session_status`, `contract_status`, `dimension_type`, `severity_type`, `verdict_classification`, `wgp_status`, etc.) must stay in lockstep with the corresponding TS union types in `src/types.ts` — several of those TS types carry a `// verify against your actual enum labels` comment where this hasn't been double-checked yet.

### Frontend shape

No router — `App.tsx` owns auth state and does a hard role-based render: `AuthScreen` (unauthenticated) → `CoachShell` or `PlayerShell` based on `profiles.role`. Each shell owns its own tab-based navigation (`PlayerRoute` / `CoachRoute` unions in `src/types.ts`) and left-rail layout rather than URL routes.

Styling is Tailwind v4 (`@theme` inline in `src/index.css`) with a fixed dark, single-theme design-token set (`--ink`, `--surface`, `--accent-bronze` for medals, `--signal-risk`/`--signal-process`/`--signal-caution` for process state). The one hard design rule worth knowing before touching any component: **money and medals never share a color channel** — P&L/bankroll figures always render in neutral `--text-primary` regardless of sign; `--signal-risk`/`--signal-process` describe process/behavioral state only, never financial outcome. Full design-token and screen-by-screen spec is in PRD §21 ("UI Instructions").

Development Notes

Use true colour medal icons
use the generated Supabase database types   