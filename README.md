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
- `tests/` vitest suites (engine unit tests and API smoke test).

## API

`GET /api/dashboard?date=`, `GET /api/week?start=` (Sunday),
`POST /api/plan/regenerate {from?}`, `POST /api/tasks`,
`POST /api/tasks/score-preview`, `POST /api/tasks/:id/complete {actualMinutes?}`,
`POST /api/tasks/:id/uncomplete`, `POST /api/tasks/:id/skip`,
`DELETE /api/tasks/:id`, `GET /api/tracks`, `POST /api/modules/:id/complete`,
`POST /api/modules/:id/reset`, `GET /api/quran`, `GET /api/stats`,
`GET|PUT /api/settings`, `GET|PUT /api/days/:date`, `GET /api/calendar?from&to`.
