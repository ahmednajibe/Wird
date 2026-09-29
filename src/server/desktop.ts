/**
 * Desktop entry point (SEA binary / `tsx src/server/desktop.ts`). Differs from
 * index.ts: platform data directory, file logging, port-conflict behavior,
 * browser launch, and a fatal() that keeps a double-clicked window readable.
 */
// Must stay the first import: silences the node:sqlite ExperimentalWarning
// before any module that loads node:sqlite runs in the bundled CJS file.
import './quietWarnings.js';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { inspect } from 'node:util';
import { createAdaptorServer } from '@hono/node-server';
import { createApp } from './app.js';
import { diskAssets } from './assets.js';
import { backupIfDue } from './backup.js';
import { backupDirFor, logDirFor, resolveDataDir, resolveDesktopDbPath } from './config.js';
import { embeddedAssets, isPackaged } from './embedded.js';
import { browserCommand, parseDesktopArgs, portConflictAction, resolvePort } from './desktopUtil.js';

declare const __WIRD_VERSION__: string | undefined;

const HOST = '127.0.0.1';
const LOG_CAP_BYTES = 1_048_576;

let logFile: string | null = null;
let logBytes = 0;

/** Rotates wird.log to wird.log.1 when the cap is (or would be) exceeded. */
function rotateIfNeeded(nextBytes: number): void {
  if (!logFile || logBytes + nextBytes <= LOG_CAP_BYTES) return;
  try {
    rmSync(logFile + '.1', { force: true });
    renameSync(logFile, logFile + '.1');
  } catch {
    // Logging must never crash the app.
  }
  logBytes = 0;
}

/** Tees console.log/warn/error into <dataDir>/logs/wird.log (1 MB cap, one rotated copy). */
function initFileLog(dataDir: string): void {
  try {
    const dir = logDirFor(dataDir);
    mkdirSync(dir, { recursive: true });
    logFile = join(dir, 'wird.log');
    if (existsSync(logFile) && statSync(logFile).size > LOG_CAP_BYTES) {
      rotateIfNeeded(Infinity);
    }
    logBytes = existsSync(logFile) ? statSync(logFile).size : 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      const original = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        original(...args);
        try {
          const line =
            new Date().toISOString() +
            ' ' +
            args.map((a) => (typeof a === 'string' ? a : inspect(a))).join(' ') +
            '\n';
          rotateIfNeeded(Buffer.byteLength(line));
          appendFileSync(logFile as string, line);
          logBytes += Buffer.byteLength(line);
        } catch {
          // Logging must never crash the app.
        }
      };
    }
  } catch {
    // Logging must never crash the app.
  }
}

/** Logs, waits for Enter when the console is interactive, then exits 1. */
async function fatal(message: string): Promise<never> {
  console.error(message);
  if (process.stdin.isTTY) {
    console.log('Press Enter to close.');
    await new Promise<void>((resolve) => {
      process.stdin.resume();
      process.stdin.once('data', () => resolve());
      process.stdin.once('end', () => resolve());
    });
  }
  process.exit(1);
}

function openBrowser(url: string, noBrowser: boolean): void {
  if (noBrowser) return;
  try {
    const { cmd, args } = browserCommand(process.platform, url);
    const child = spawn(cmd, args, {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
      windowsHide: true,
    });
    child.on('error', () => console.log(`Open ${url} in your browser.`));
    child.unref();
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

async function main(): Promise<void> {
  const args = parseDesktopArgs(process.argv.slice(2));
  const port = resolvePort(args, process.env);
  const version =
    typeof __WIRD_VERSION__ !== 'undefined' ? __WIRD_VERSION__ : process.env.npm_package_version ?? 'dev';
  const url = `http://${HOST}:${port}`;

  const packaged = isPackaged();
  const exeDir = packaged ? dirname(process.execPath) : undefined;
  const portable = packaged && exeDir !== undefined && existsSync(join(exeDir, 'portable'));
  const input = {
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    cwd: process.cwd(),
    exeDir,
    portable,
  };
  const dataDir = resolveDataDir(input);
  const dbPath = resolveDesktopDbPath(input);
  if (portable) {
    try {
      mkdirSync(dataDir, { recursive: true });
      const probe = join(dataDir, '.wird-write-probe');
      writeFileSync(probe, '');
      unlinkSync(probe);
    } catch {
      await fatal(
        `Wird cannot write to its portable data folder (${dataDir}). Move the Wird folder somewhere you can write to, or delete the 'portable' file to keep your data in your user folder.`,
      );
    }
  } else {
    mkdirSync(dataDir, { recursive: true });
  }
  initFileLog(dataDir);

  // Bind first so a second instance gets the port-conflict behavior before
  // any database work, and slow startups answer 503 instead of hanging.
  let fetchHandler: ((request: Request) => Response | Promise<Response>) | null = null;
  const server = createAdaptorServer({
    fetch: (request) =>
      fetchHandler === null
        ? new Response('Wird is starting, refresh in a moment.', { status: 503 })
        : fetchHandler(request),
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (err: NodeJS.ErrnoException) => reject(err);
      server.once('error', onError);
      server.listen(port, HOST, () => {
        server.off('error', onError);
        resolve();
      });
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      let health: unknown = null;
      try {
        const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
        health = await res.json();
      } catch {
        health = null;
      }
      if (portConflictAction(health) === 'open-existing') {
        console.log('Wird is already running. Opening it in your browser.');
        openBrowser(url, args.noBrowser);
        process.exit(0);
      }
      await fatal(
        `Port ${port} is used by another program. Close that program, or start Wird with a different port (set PORT or use --port=NUMBER).`,
      );
    }
    await fatal(`Could not start Wird: ${err instanceof Error ? err.message : String(err)}`);
  }

  let created: ReturnType<typeof createApp>;
  try {
    created = createApp({
      dbPath,
      version,
      // The non-packaged fallback runs via tsx/tsc from the repo root, so the
      // process cwd is the right place to find dist/web and PLAN_PROMPT.md.
      assets: packaged
        ? embeddedAssets()
        : diskAssets({ webDir: join(process.cwd(), 'dist', 'web'), rootDir: process.cwd() }),
    });
  } catch (err) {
    server.close();
    await fatal(err instanceof Error ? err.message : String(err));
    return; // unreachable: fatal() exits the process
  }
  const { app, service, db } = created;
  fetchHandler = app.fetch;

  function runBackup(): void {
    try {
      const result = backupIfDue(db, backupDirFor(dbPath), service.today());
      if (result.created) console.log(`Backup written: ${result.created}`);
      for (const f of result.removed) console.log(`Old backup removed: ${f}`);
    } catch (err) {
      console.error('Backup failed:', err);
    }
  }
  runBackup();
  // Checked hourly; a backup is only written once per Cairo calendar day.
  const backupTimer = setInterval(runBackup, 60 * 60 * 1000);
  backupTimer.unref();

  console.log(`Wird ${version}`);
  console.log(`Data folder: ${dataDir}`);
  console.log(`Listening on ${url}`);
  console.log('');
  console.log(`Wird is running at ${url}`);
  console.log('Close this window to quit.');

  openBrowser(url, args.noBrowser);

  function shutdown(): void {
    server.close(() => {
      try {
        db.close();
      } catch {
        // Already closed.
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

main().catch((err: unknown) => fatal(err instanceof Error ? err.message : String(err)));
