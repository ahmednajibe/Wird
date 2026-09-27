/**
 * Resets the plan and restarts tracking today.
 *
 *   npm run reset-plan -- --confirm [--force]
 *
 * Uses the same database as the server (LEARNING_DB_PATH or data/learning.db).
 * Refuses to run while a server answers on the configured port (PORT or 4545),
 * refuses if any task is completed unless --force, and requires --confirm.
 * Writes a backup (backups/pre-reset-YYYYMMDD-HHMMSS.db next to the database)
 * via VACUUM INTO, then deletes all rows of tasks, planned_days,
 * daily_summary, module_state and day_overrides, keeps settings, and sets
 * tracking_start_date to today (Africa/Cairo). It does not generate a plan:
 * the server plans from today on the next load.
 */
import { existsSync } from 'node:fs';
import { backupDirFor, resolveDbPath } from '../src/server/config.js';
import { openDb } from '../src/server/db.js';
import { backupBeforeReset, completedTaskCount, resetPlan, tableCounts, type TableCounts } from '../src/server/resetPlan.js';
import { today as cairoToday } from '../src/shared/dates.js';

function printCounts(label: string, counts: TableCounts): void {
  console.log(`${label}:`);
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(14)} ${n}`);
}

async function serverAnswers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const confirm = args.has('--confirm');
  const force = args.has('--force');
  const dbPath = resolveDbPath(process.env, process.cwd());
  const port = Number(process.env.PORT ?? 4545);

  console.log(`Database: ${dbPath}`);
  if (await serverAnswers(port)) {
    console.error(`A server is answering on http://127.0.0.1:${port}. Stop it first (close its window or press Ctrl+C), then run this again.`);
    return 1;
  }
  if (!existsSync(dbPath)) {
    console.error('No database file found there; nothing to reset.');
    return 1;
  }

  const db = openDb(dbPath);
  try {
    const completed = completedTaskCount(db);
    if (completed > 0 && !force) {
      console.error(`${completed} task(s) are completed. Resetting would delete that history. Re-run with --force to reset anyway.`);
      return 1;
    }
    if (!confirm) {
      printCounts('Rows that would be deleted', tableCounts(db));
      console.error('Nothing changed. Re-run with --confirm to reset: npm run reset-plan -- --confirm');
      return 1;
    }
    const backup = backupBeforeReset(db, backupDirFor(dbPath));
    console.log(`Backup written: ${backup}`);
    const result = resetPlan(db, cairoToday(new Date()));
    printCounts('Before', result.before);
    printCounts('After', result.after);
    console.log(`Settings kept. Tracking starts on ${result.trackingStartDate}. Start the server; it plans from today on the next load.`);
    return 0;
  } finally {
    db.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  },
);
