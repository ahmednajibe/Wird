/**
 * Runtime configuration from the environment.
 */
import { dirname, join, resolve } from 'node:path';

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
