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

## Architecture

- `src/shared/` pure engine, no I/O: dates (Africa/Cairo, weeks start Sunday),
  calendar (Hijri + fasting), curriculum, Quran data and engine, scoring,
  planner, progress ledger, streak/baseline/levels, projections, settings
  schema.
- `src/server/` Hono API over `node:sqlite`: config, migrations, repositories,
  service (planning lifecycle and commands), read models, routes, backups.
  Serves `dist/web` in production.
- `src/web/` Vite + React UI (React Router, TanStack Query). Pages in
  `pages/`, shared UI in `components/`, API client and hooks in `client/`.
- `scripts/` Quran data generator and the e2e runner.
- `tests/` vitest suites.

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
