/**
 * Runtime configuration from the environment.
 */
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { DEFAULT_TIMEZONE } from '../shared/dates.js';

/**
 * SQLite file location. `LEARNING_DB_PATH` (absolute, or relative to `cwd`)
 * overrides the default `data/learning.db`; used by the e2e run to point the
 * production server at a throwaway database.
 */
export function resolveDbPath(env: Record<string, string | undefined>, cwd: string): string {
  const custom = env.LEARNING_DB_PATH?.trim();
  if (custom) return resolve(cwd, custom);
  return join(cwd, 'data', 'learning.db');
}

/** Backups live next to the database file. */
export function backupDirFor(dbPath: string): string {
  return join(dirname(dbPath), 'backups');
}

/**
 * Inputs for the packaged-app data-directory resolution. Pure: callers pass
 * platform/env/home/cwd (and exeDir/portable for the desktop binary) so the
 * logic is testable on any OS.
 */
export interface DataDirInput {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  home: string;
  cwd: string;
  /** Directory of the running binary (desktop only). */
  exeDir?: string;
  /** True when a `portable` marker file sits next to the exe. */
  portable?: boolean;
}

/**
 * Where Wird keeps its data (database, logs, backups inside a `backups`
 * folder next to the db). Precedence:
 *   1. LEARNING_DATA_DIR (non-empty, resolved against cwd)
 *   2. portable marker next to the exe -> <exe dir>/data
 *   3. the per-user data dir of the platform
 */
export function resolveDataDir(i: DataDirInput): string {
  const p = i.platform === 'win32' ? win32 : posix;
  const custom = i.env.LEARNING_DATA_DIR?.trim();
  if (custom) return p.resolve(i.cwd, custom);
  if (i.portable && i.exeDir) return p.join(i.exeDir, 'data');
  switch (i.platform) {
    case 'win32': {
      const local = i.env.LOCALAPPDATA?.trim() || p.join(i.home, 'AppData', 'Local');
      return p.join(local, 'Wird');
    }
    case 'darwin':
      return p.join(i.home, 'Library', 'Application Support', 'Wird');
    default: {
      const xdg = i.env.XDG_DATA_HOME;
      const base = xdg && p.isAbsolute(xdg) ? xdg : p.join(i.home, '.local', 'share');
      return p.join(base, 'wird');
    }
  }
}

/**
 * Database location for the packaged app: LEARNING_DB_PATH wins, else
 * <data dir>/learning.db.
 */
export function resolveDesktopDbPath(i: DataDirInput): string {
  const p = i.platform === 'win32' ? win32 : posix;
  const custom = i.env.LEARNING_DB_PATH?.trim();
  if (custom) return p.resolve(i.cwd, custom);
  return p.join(resolveDataDir(i), 'learning.db');
}

/** Log files live under <data dir>/logs. */
export function logDirFor(dataDir: string): string {
  return join(dataDir, 'logs');
}

/**
 * The machine's IANA timezone for a brand-new install. Returns the `read`
 * value when it is a non-empty string the runtime accepts, else
 * DEFAULT_TIMEZONE. Never throws (a throwing `read` falls back too).
 */
export function detectSystemTimezone(
  read: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    const tz = read();
    if (typeof tz === 'string' && tz.length > 0) {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    }
  } catch {
    // fall through to the default
  }
  return DEFAULT_TIMEZONE;
}
