/**
 * SQLite access via the built-in node:sqlite module.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { snapshotDb } from './backup.js';
import { backupDirFor } from './config.js';
import { assertSchemaNotNewer, pendingVersions, runMigrations } from './migrations.js';

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const existed = path !== ':memory:' && existsSync(path);
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  try {
    assertSchemaNotNewer(db);
  } catch (err) {
    db.close();
    throw err;
  }
  const pending = pendingVersions(db);
  if (existed && pending.length > 0) {
    snapshotDb(db, backupDirFor(path), `pre-migrate-v${Math.max(...pending)}`);
  }
  runMigrations(db);
  return db;
}

/** Runs `fn` inside a transaction (nesting-safe via savepoints). */
const depths = new WeakMap<Db, number>();
export function transaction<T>(db: Db, fn: () => T): T {
  const depth = depths.get(db) ?? 0;
  const name = `sp_${depth}`;
  if (depth === 0) db.exec('BEGIN IMMEDIATE');
  else db.exec(`SAVEPOINT ${name}`);
  depths.set(db, depth + 1);
  try {
    const result = fn();
    depths.set(db, depth);
    if (depth === 0) db.exec('COMMIT');
    else db.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    depths.set(db, depth);
    if (depth === 0) db.exec('ROLLBACK');
    else db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
    throw err;
  }
}
