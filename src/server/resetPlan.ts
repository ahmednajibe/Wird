/**
 * Plan reset: clears all plan/progress rows (keeps settings) and restarts
 * tracking today. Used by scripts/reset-plan.ts; kept here so it is testable
 * with an injected date.
 */
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { IsoDate } from '../shared/types.js';
import { transaction, type Db } from './db.js';
import { MetaRepo } from './repoMisc.js';
import { TRACKING_START_KEY } from './service.js';

/** Tables emptied by a reset. settings and meta (except the start date) are kept. */
export const RESET_TABLES = ['tasks', 'planned_days', 'daily_summary', 'module_state', 'day_overrides'] as const;

export type TableCounts = Record<(typeof RESET_TABLES)[number], number>;

export function tableCounts(db: Db): TableCounts {
  const out = {} as TableCounts;
  for (const t of RESET_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number } | undefined;
    out[t] = Number(row?.n ?? 0);
  }
  return out;
}

export function completedTaskCount(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'completed'").get() as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export interface ResetResult {
  before: TableCounts;
  after: TableCounts;
  trackingStartDate: IsoDate;
}

/**
 * Deletes every row of RESET_TABLES and sets tracking_start_date = `today`.
 * Does not plan anything: the server plans from today on the next load.
 */
export function resetPlan(db: Db, today: IsoDate): ResetResult {
  const before = tableCounts(db);
  transaction(db, () => {
    for (const t of RESET_TABLES) db.exec(`DELETE FROM ${t}`);
    new MetaRepo(db).set(TRACKING_START_KEY, today);
  });
  return { before, after: tableCounts(db), trackingStartDate: today };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYYMMDD-HHMMSS' in local time. */
export function backupStamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Writes `pre-reset-YYYYMMDD-HHMMSS.db` into `dir` via VACUUM INTO and returns its path. */
export function backupBeforeReset(db: Db, dir: string, now: Date = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `pre-reset-${backupStamp(now)}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}
