# Learning tracker

Personal, local-only learning tracker for Quran memorization, Full Stack
Development, AI and Animation. Times and dates are Africa/Cairo; weeks start on
Sunday.

## Run

```
npm install
npm run dev:server   # tsx watch, http://127.0.0.1:4545
npm test             # vitest
npm run typecheck
npm run build && npm start   # compiled server (serves dist/web if present)
```

Data lives in `data/learning.db` (SQLite, WAL). A backup is written to
`data/backups/learning-YYYY-MM-DD.db` on start and at most once per day; the
last 30 are kept.

## Layout

- `src/shared/` pure engine (no I/O): dates, calendar (Hijri + fasting),
  curriculum, Quran data and engine, scoring, planner, progress ledger,
  streak/baseline/levels, projections, settings schema.
- `src/server/` Hono API over `node:sqlite`: migrations, repositories, service
  (planning lifecycle and commands), read models, routes.
- `src/web/` reserved for the Vite React UI (Phase 2).
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
