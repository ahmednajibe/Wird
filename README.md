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

## Planning model

- Fixed daily caps: every day with capacity reserves R minutes for Quran, where
  R is the planned memorize session length (`quran.memorizeMinutes`, or the
  rolling average of real memorize minutes once enough sessions exist). The
  study tracks share `capacity - R` through the weekly template, so a track's
  minutes on a date depend only on that date's capacity and the settings,
  never on the day's Quran session or on other tracks. Review sessions are
  capped at `min(reviewCapMinutes, R)` (default 40). On a review day the rest
  of R is an optional buffer (`bufferMinutes` in the API, "Buffer: N min
  (optional catch-up or rest)" in the UI); it is never planned or scored.
  Normal week with defaults: capacity 864 min = Quran reserved 280 +
  drawing 160 + story 70 + AI 207 + Full Stack 147 (buffer 75).
- Per-track session queues: AI, Full Stack, Drawing (warm-up included) and
  Story are independent numbered queues (`sessionNo`, shown as
  "(session N)"). A missed session (a past pending one) or a skipped one
  becomes `rolled` ("Moved forward", no points, not missed) and its content
  moves to the next slot of the same stream: that stream's pending sessions
  from today on keep their dates, slots and minutes, and their content is
  re-planned from real progress. Other streams and Quran never change. Quran
  keeps its own memorize/review alternation; skipping a Quran session works
  as before. A rolled session cannot be completed late.
- Tracking start: `meta.tracking_start_date` is set to today (Cairo) the first
  time the app plans. Earlier dates are never planned, never missed, get no
  baseline snapshot and are excluded from streak, stats and heatmap ("Not
  started" in the UI).

### Reset the plan

```
npm run reset-plan -- --confirm            # add --force if tasks were completed
```

Stop the server first (the script refuses while something answers on `PORT`
or 4545). It uses the same database as the server (`LEARNING_DB_PATH` or
`data/learning.db`), writes `backups/pre-reset-YYYYMMDD-HHMMSS.db` next to it
via `VACUUM INTO`, deletes all tasks, planned days, daily summaries, module
state and day overrides, keeps settings, and sets the tracking start to today.
It does not plan anything: the server plans from today on the next load.

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
week)` (fasting days x 0.6); with defaults 1059 points a week, 151.29 a day,
baseline 42 (fasting 25). It is set so that on an off day doing only the
two core habits (the day's Quran session plus the drawing warm-up) keeps the
streak. Each day's baseline, rest-day and fasting status are snapshotted in
`daily_summary`; once a day is in the past its snapshot is frozen, so later
settings or override changes can never break a streak retroactively.

## API

`GET /api/dashboard?date=`, `GET /api/week?start=` (Sunday),
`POST /api/plan/regenerate {from?}`, `POST /api/tasks`,
`POST /api/tasks/score-preview`, `POST /api/tasks/:id/complete {actualMinutes?}`,
`POST /api/tasks/:id/uncomplete`, `POST /api/tasks/:id/skip` (study
session: moves it to the next slot of its own track; Quran: skipped),
`DELETE /api/tasks/:id`, `GET /api/tracks`, `POST /api/modules/:id/complete`,
`POST /api/modules/:id/reset`, `GET /api/quran`, `GET /api/stats`,
`GET|PUT /api/settings`, `GET|PUT /api/days/:date`, `GET /api/calendar?from&to`.
