# AGENTS.md

Guidance for coding agents working in this repo.

## Commands

```
npm install
npm test             # vitest (engine unit tests + API smoke tests)
npm run typecheck    # tsc for server (tsconfig.json) and web (tsconfig.web.json)
npm run build        # dist/server (tsc) + dist/web (vite build)
npm start            # production server on http://127.0.0.1:4545
npm run dev          # API server (tsx watch, :4545) + Vite dev server (:5173)
npm run e2e          # build, then scripts/e2e.ts in local Microsoft Edge
```

`npm run e2e` uses a throwaway database via `LEARNING_DB_PATH` and writes
screenshots to `screenshots/`. Never point tests or scripts at
`data/learning.db`; that is the owner's real data. Do not delete `data/`.

## Node version

Node is pinned to 24.20.0 (`.nvmrc`, `engines` in package.json, CI, and the
SEA binary build). Dev machines use fnm (`fnm use` picks up `.nvmrc`; install
fnm first if missing). Change the pinned version only deliberately, with a
full gate run (typecheck, test, build, e2e) on the new version.

## Architecture

- `src/shared/` pure engine, no I/O: dates (configured timezone, weeks start
  Sunday), calendar (Hijri + fasting), catalog, plan packs, Quran data and engine, scoring,
  planner, progress ledger, streak/baseline/levels, projections, settings
  schema.
- `src/server/` Hono API over `node:sqlite`: config, migrations, repositories,
  service (planning lifecycle and commands), read models, routes, backups.
  Serves `dist/web` in production.
- `src/web/` Vite + React UI (React Router, TanStack Query). Pages in
  `pages/`, shared UI in `components/`, API client and hooks in `client/`.
- `scripts/` Quran data generator and the e2e runner.
- `tests/` vitest suites.

## Plan packs and the catalog

- Tracks, streams, modules and resources live in the `plan_*` tables, not in
  code. The engine never imports curriculum data: the service loads a
  `Catalog` (`src/shared/catalog.ts`) from `CatalogRepo` and injects it
  (`new ModuleLedger(catalog, ...)`; planner and projections read
  `ledger.catalog`). Call `service.reloadCatalog()` after writing plan tables.
- Track and stream ids are plain strings. Branch on `catalog.kindOf(track)`
  ('study' | 'quran') or `isQuranType(task.type)`, never on a track id literal.
  `QURAN_TRACK_ID` ('quran') is only used to create Quran tasks. Per-stream
  behavior comes from data (`style: 'practice'`, warm-up titles and drills).
- Ids (track, stream, module) match `ID_RE` (`/^[a-z0-9][a-z0-9-]*$/`, no '/'
  because slot keys are `track/stream/role`). Phase ids may use uppercase.
- Imports (`src/server/importer.ts`): `POST /api/import/preview` never writes;
  `POST /api/import` backs up first, then one transaction. Entities are never
  hard-deleted, only archived (`archived_at`). Imports never touch completed
  tasks, points, `daily_summary`, `tracking_start_date` or manual tasks; module
  progress is only reset in fresh mode with `onIdReuse: 'reset'`.
- Pack validation messages (`src/shared/pack.ts`) are read by end users and
  pasted back to an AI: keep them self-contained (path, id, allowed values).
  `PLAN_PROMPT.md` documents the pack format for external AIs; update it with
  any schema change, and keep its JSON examples valid (a test checks them).
- The owner's curriculum is seed data in `src/server/seed/` (migration 4 and
  tests only). Fresh installs have no study tracks. Tests get the owner plan via
  `makeTestApp(date)` (default `plan: 'owner'`) or an empty plan with
  `{ plan: 'empty' }`.
- `settings.quran.enabled` (default true): when false, reserve 0 and no Quran
  tasks for today onward; Quran history is never modified.
  `settings.timezone` (default Africa/Cairo) drives `today()`.
- Web: track colors and icons come only from the fixed palettes (`THEMES`,
  `ICONS` in pack.ts, mapped in `src/web/lib/themes.ts` / `icons.ts`); never
  accept CSS, hex or SVG from a pack. Use `useTrackMeta()` for track display.
- `tests/golden.test.ts` pins API output. Never regenerate its snapshots to
  make a refactor pass.

## Rules

- Engine numbers are authoritative. The UI displays what the engine computes
  and never re-derives it. Key constants: daily capacity Sunday to Thursday
  120 min, Friday and Saturday 180 min; fasting days reduce capacity by 40%;
  streak baseline factor 0.28 of average daily planned points of a normal
  week; fasting baseline factor 0.6.
- Past days' baselines (and rest-day and fasting status) are frozen snapshots
  in `daily_summary`. Never recompute or overwrite them.
- Never regenerate plans for past dates. Regeneration only affects today
  onward.
- Study-track caps are fixed per date: each day reserves R (planned memorize
  minutes) for Quran and the tracks share the rest. Kept tasks only reduce
  their own slot. Missed or skipped study sessions roll forward within their
  own stream only (status `rolled`); never touch other streams or Quran.
- Dates before `meta.tracking_start_date` are never planned, scored or
  streaked. `npm run reset-plan` must never be run against `data/` by agents.
- Points are always computed by the scoring engine. They are never user-set,
  in the API or the UI.
- UI copy contains no em dashes or en dashes. Use commas, colons, parentheses
  or plain hyphens.

## Critical: Vite proxy and the `api` prefix

The Vite proxy rule '/api' -> http://127.0.0.1:4545 matches by literal URL
prefix (startsWith), not path segment. Never create a folder or file inside
the Vite root (src/web/) whose name begins with 'api' (the frontend API client
lives in src/web/client/ for this reason; do not rename it back). Otherwise
dev-server module requests like /api/client.ts get proxied to the backend,
404, and the page is blank. vite.config.ts proxy is intentionally unchanged.
