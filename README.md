# Wird

<img src="assets/brand/png/wird-128.png" width="96" alt="Wird icon">

Wird is a local-first daily learning tracker with optional Quran
memorization. It plans your week, tracks points and streaks, and keeps
everything on your machine. You design your own plan: paste
[PLAN_PROMPT.md](PLAN_PROMPT.md) into any AI, get a plan file back, and
import it into the app.

New here? You can hand this repository's link to any AI assistant and ask
it to walk you through installing Wird and writing your plan: this README
and PLAN_PROMPT.md are written to be self-contained.

## Fully local

Wird runs only on 127.0.0.1, your own computer. There is no account, no
telemetry, and no network calls at runtime. All your data stays on your
machine, and the entire source code is in this repository for you to
inspect. Every release ships a `SHA256SUMS.txt` file so you can verify the
files you downloaded (see below).

## Install

Get the latest files from the
[Releases page](https://github.com/ahmednajibe/Wird/releases).

### Windows

- **Installer**: download `Wird-<ver>-win-x64-setup.exe` and run it. It
  installs per-user (no admin prompt) to `%LOCALAPPDATA%\Programs\Wird` and
  adds Start menu and desktop shortcuts.
- **Portable**: download `Wird-<ver>-win-x64-portable.zip`, extract it
  anywhere, and run `Wird\wird.exe`. Data is kept in the `data` folder next
  to the exe.

### One-line install

Windows (PowerShell):

```powershell
irm https://github.com/ahmednajibe/Wird/releases/latest/download/install.ps1 | iex
```

Installs `wird.exe` to `%LOCALAPPDATA%\Programs\Wird` and creates Start menu
and desktop shortcuts.

macOS and Linux:

```sh
curl -fsSL https://github.com/ahmednajibe/Wird/releases/latest/download/install.sh | sh
```

On Linux it installs to `~/.local/share/wird-app`, links `~/.local/bin/wird`,
and adds an applications menu entry. On macOS it installs the app bundle and
the official Node.js runtime to `~/Applications/Wird` and puts a
`Wird.command` launcher on your Desktop.

### From source

Download the source ZIP (or clone), install
[Node.js 24](https://nodejs.org), then double-click `start-tracker.cmd`
(Windows) or `start-tracker.command` (macOS), or run `./start-tracker.sh`
(Linux). The launcher installs dependencies, builds if needed, and starts
the app.

## Windows SmartScreen

The builds are not code-signed yet, so Windows may show "Windows protected
your PC" the first time. Click **More info**, then **Run anyway**.

<!-- screenshots: docs/screenshots/smartscreen-1.png, smartscreen-2.png (to be captured by the maintainer) -->

Some antivirus tools may flag new unsigned builds. If you believe this is a
false positive, you can report the file to your antivirus vendor, or submit
it to [Microsoft's submission portal](https://www.microsoft.com/en-us/wdsi/filesubmission).

To verify a download, compare its SHA-256 against `SHA256SUMS.txt` from the
same release:

```powershell
Get-FileHash .\Wird-0.1.0-win-x64-setup.exe -Algorithm SHA256
```

```sh
sha256sum -c SHA256SUMS.txt
```

## macOS

The one-line install avoids Gatekeeper prompts (files fetched with curl are
not quarantined). For the source `start-tracker.command`, the first run may
need System Settings, Privacy and Security, "Open Anyway".

## Where your data lives

- Windows: `%LOCALAPPDATA%\Wird` (portable zip: `Wird\data` next to
  `wird.exe`; delete the empty `portable` file to use the per-user folder).
- macOS: `~/Library/Application Support/Wird`
- Linux: `~/.local/share/wird` (or `$XDG_DATA_HOME/wird`)
- Source runs: the repo's `data/` folder.

Inside the data folder: `learning.db` (SQLite), `backups/` (a daily backup
is written on start and at most once per day; the last 30 are kept), and
`logs/`. The environment variables `LEARNING_DATA_DIR` and
`LEARNING_DB_PATH` override these locations.

Moving to a new computer: close Wird, copy the data folder to the same
location on the new machine, done.

## Using Wird

Start Wird and it opens your browser at http://127.0.0.1:4545. Keep the
console window open while you use it; close the window to quit. Launching a
second copy just opens the browser again. If port 4545 is taken, set the
`PORT` environment variable or use `--port=NUMBER`.

Your plan comes from an AI: open [PLAN_PROMPT.md](PLAN_PROMPT.md), paste it
into any AI along with what you want to learn, save the returned plan file,
then use the
Import page in Wird (preview first, then update or fresh import). Quran
memorization can be turned on or off in Settings; history is never lost.

## Updating

Download the new version and install it over the old one (or re-run the
one-line installer). Your data is kept. Database migrations always write a
backup first, and an older version refuses to open data created by a newer
version instead of damaging it.

## Uninstall

- Windows installer: remove Wird from Windows Apps settings, or delete
  `%LOCALAPPDATA%\Programs\Wird` (portable).
- Linux: run `./install-desktop-entry.sh --uninstall` in the install folder,
  then remove `~/.local/share/wird-app` and `~/.local/bin/wird`.
- macOS: delete `~/Applications/Wird` and the `Wird.command` link on your
  Desktop.

Your data folders are never removed automatically. Delete them yourself if
you want them gone.

## For developers

### Commands

```
npm install
npm test             # vitest (engine unit tests + API smoke tests)
npm run typecheck    # tsc for server (tsconfig.json) and web (tsconfig.web.json)
npm run build        # dist/server (tsc) + dist/web (vite build)
npm start            # production server on http://127.0.0.1:4545
npm run dev          # API server (tsx watch, :4545) + Vite dev server (:5173)
npm run e2e          # build, then scripts/e2e.ts in local Microsoft Edge
```

Node.js is pinned to 24.20.0 (`.nvmrc`, `engines`); fnm picks it up via
`fnm use`.

Packaging:

```
npm run build:sea       # build/sea/wird.exe (Windows) or wird (others)
npm run package:win     # build/release/: portable zip + Inno Setup installer
npm run package:linux   # build/release/: Linux tar.gz (run on Linux)
npm run package:app     # build/release/: cross-platform node bundle tar.gz
npm run checksums       # build/release/SHA256SUMS.txt
npm run smoke           # smoke-test a binary: node scripts/smoke.mjs <file>
```

See [RELEASING.md](RELEASING.md) for the release process and signing, and
[AGENTS.md](AGENTS.md) for the agent rules and architecture notes.

### Development details

`npm run dev` runs the API server (`tsx watch`, http://127.0.0.1:4545) and
the Vite dev server (http://127.0.0.1:5173) together. Vite proxies every
request starting with `/api` to the API server. Open
http://127.0.0.1:5173. `npm run dev:server` or `npm run dev:web` start
either half alone.

`npm run build` runs tsc for the server into `dist/server` and vite build
into `dist/web`; `npm start` serves both on http://127.0.0.1:4545 (binds
127.0.0.1 only; `PORT` overrides 4545).

`npm run e2e` builds, then `scripts/e2e.ts` starts `dist/server/index.js` on
a free port with a throwaway database in a temp folder (via
`LEARNING_DB_PATH`), drives the locally installed Microsoft Edge headless
through `playwright-core` (no browser download), runs the core flows and
writes full-page screenshots to `screenshots/`.

### Reset the plan

```
npm run reset-plan -- --confirm            # add --force if tasks were completed
```

Stop the server first (the script refuses while something answers on `PORT`
or 4545). It uses the same database as the server (`LEARNING_DB_PATH` or
`data/learning.db`), writes `backups/pre-reset-YYYYMMDD-HHMMSS.db` next to it
via `VACUUM INTO`, deletes all tasks, planned days, daily summaries, module
state and day overrides, keeps settings, and sets the tracking start to
today.

### Pages

- Today: the day's tasks, points, streak and Quran session.
- Plan: the week plan.
- Tracks: curriculum tracks and modules.
- Quran: memorization and review progress.
- Stats: history and projections.
- Resources: learning resources per track.
- Settings: schedule and preferences.
- Add task: available from anywhere; press `n` to open it.

### Layout

- `src/shared/` pure engine (no I/O): dates, calendar (Hijri + fasting),
  catalog, plan packs, Quran data and engine, scoring, planner, progress
  ledger, streak/baseline/levels, projections, settings schema.
- `src/server/` Hono API over `node:sqlite`: migrations, repositories,
  service (planning lifecycle and commands), read models, routes, backups.
  `desktop.ts` is the packaged entry (SEA binary); `index.ts` stays the
  development/production `npm start` entry.
- `src/web/` Vite + React UI (pages, components, `client/` API client).
- `scripts/` the Quran data generator, the e2e runner, packaging and release
  scripts.
- `packaging/` the Inno Setup script and the Linux desktop entry.
- `install/` the one-line installers (`install.ps1`, `install.sh`).
- `tests/` vitest suites.

### Quran data

Quran metadata: Tanzil.net (CC BY 3.0), https://tanzil.net. Exact page
contents (surah/ayah ranges per Madani page), ayah counts and Arabic surah
names are generated from Tanzil's `quran-data.js` into
`src/shared/quranData.generated.ts`, which is committed; the app never
fetches it at runtime. To regenerate:

```
curl -sSL -o scripts/.cache/quran-data.js https://tanzil.net/res/text/metadata/quran-data.js
npm run gen:quran
```

### Streaks

The daily baseline is `round(0.28 x average daily planned points of a normal
week)` (fasting days x 0.6). Each day's baseline, rest-day and fasting
status are snapshotted in `daily_summary`; once a day is in the past its
snapshot is frozen, so later settings or override changes can never break a
streak retroactively.

### API

`GET /api/dashboard?date=`, `GET /api/week?start=` (Sunday),
`GET /api/health`, `POST /api/plan/regenerate {from?}`, `POST /api/tasks`,
`POST /api/tasks/score-preview`,
`POST /api/tasks/:id/complete {actualMinutes?}`,
`POST /api/tasks/:id/uncomplete`, `POST /api/tasks/:id/skip`,
`DELETE /api/tasks/:id`, `GET /api/tracks`,
`POST /api/modules/:id/complete`, `POST /api/modules/:id/reset`,
`GET /api/quran`, `GET /api/stats`, `GET|PUT /api/settings`,
`GET|PUT /api/days/:date`, `GET /api/calendar?from&to`,
`GET /api/plan-prompt`, `POST /api/import/preview`, `POST /api/import`.
