# Learning tracker

Personal, local-only learning tracker for Quran memorization, Full Stack
Development, AI and Animation. Times and dates are Africa/Cairo; weeks start on
Sunday.

## Run

```
npm install
npm test             # vitest
npm run typecheck    # server + web tsconfigs
```

### Development

```
npm run dev
```

Runs the API server (`tsx watch`, http://127.0.0.1:4545) and the Vite dev
server (http://127.0.0.1:5173) together. Vite proxies every request starting
with `/api` to http://127.0.0.1:4545. Open http://127.0.0.1:5173.
`npm run dev:server` or `npm run dev:web` start either half alone.

### Production build

```
npm run build   # tsc server into dist/server, vite build UI into dist/web
npm start       # node dist/server/index.js, serves the API and dist/web
```

Open http://127.0.0.1:4545. The server binds to 127.0.0.1 only; `PORT`
overrides 4545.

### Windows launcher

Double-click `start-tracker.cmd` at the repo root. It runs `npm install` if
`node_modules` is missing, runs `npm run build` if `dist\server\index.js` or
`dist\web\index.html` is missing, opens http://127.0.0.1:4545 in the default
browser after about 2 seconds, and runs `npm start` in the foreground of that
window. Close the window or press Ctrl+C to stop the server.

### End-to-end check

```
npm run e2e
```

Builds, then `scripts/e2e.ts` starts `dist/server/index.js` on a free port
with a throwaway database in a temp folder (via `LEARNING_DB_PATH`), drives
the locally installed Microsoft Edge headless through `playwright-core` (no
browser download), runs the core flows and writes full-page screenshots of
every page to `screenshots/` (desktop 1440x900, mobile 390x844, plus Today in
the light theme). Your real database is never touched.

## Data

Data lives in `data/learning.db` (SQLite, WAL). Set `LEARNING_DB_PATH`
(absolute, or relative to the working directory) to use another file. A
backup is written to `backups/learning-YYYY-MM-DD.db` next to the database
(by default `data/backups/`) on start and at most once per day; the last 30
are kept. `data/` is git-ignored.

## Pages

- Today: the day's tasks, points, streak and Quran session.
- Plan: the week plan.
- Tracks: curriculum tracks and modules.
- Quran: memorization and review progress.
- Stats: history and projections.
- Resources: learning resources per track.
- Settings: schedule and preferences.
- Add task: available from anywhere; press `n` to open it.

## Layout

- `src/shared/` pure engine (no I/O): dates, calendar (Hijri + fasting),
  curriculum, Quran data and engine, scoring, planner, progress ledger,
  streak/baseline/levels, projections, settings schema.
- `src/server/` Hono API over `node:sqlite`: migrations, repositories, service
  (planning lifecycle and commands), read models, routes.
- `src/web/` Vite + React UI (pages, components, `client/` API client).
- `scripts/e2e.ts` end-to-end run against the production build.
- `scripts/gen-quran-data.ts` generator for the Tanzil-derived Quran data.
- `tests/` vitest suites (engine unit tests and API smoke test).

## Quran data

Quran metadata: Tanzil.net (CC BY 3.0), https://tanzil.net. Exact page
contents (surah/ayah ranges per Madani page), ayah counts and Arabic surah
names are generated from Tanzil's `quran-data.js` into
`src/shared/quranData.generated.ts`, which is committed; the app never fetches
it at runtime. To regenerate:

```
curl -sSL -o scripts/.cache/quran-data.js https://tanzil.net/res/text/metadata/quran-data.js
npm run gen:quran
```

## Streaks

The daily baseline is `round(0.28 x average daily planned points of a normal
week)` (fasting days x 0.6). It is set so that on an off day doing only the
two core habits (the day's Quran session plus the drawing warm-up) keeps the
streak. Each day's baseline, rest-day and fasting status are snapshotted in
`daily_summary`; once a day is in the past its snapshot is frozen, so later
settings or override changes can never break a streak retroactively.

## API

`GET /api/dashboard?date=`, `GET /api/week?start=` (Sunday),
`POST /api/plan/regenerate {from?}`, `POST /api/tasks`,
`POST /api/tasks/score-preview`, `POST /api/tasks/:id/complete {actualMinutes?}`,
`POST /api/tasks/:id/uncomplete`, `POST /api/tasks/:id/skip`,
`DELETE /api/tasks/:id`, `GET /api/tracks`, `POST /api/modules/:id/complete`,
`POST /api/modules/:id/reset`, `GET /api/quran`, `GET /api/stats`,
`GET|PUT /api/settings`, `GET|PUT /api/days/:date`, `GET /api/calendar?from&to`.
