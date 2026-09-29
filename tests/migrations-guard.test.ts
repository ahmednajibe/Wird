/**
 * Downgrade guard: a database with a newer schema version must refuse to
 * open, leave schema_migrations untouched, and write no pre-migrate backup.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { backupDirFor } from '../src/server/config.js';
import { openDb } from '../src/server/db.js';
import { MIGRATIONS, assertSchemaNotNewer, runMigrations } from '../src/server/migrations.js';

const MAX = Math.max(...MIGRATIONS.map((m) => m.version));
const EXPECTED = `This data was created by a newer version of Wird (database schema v${MAX + 1}, this version supports up to v${MAX}). Install the latest Wird from https://github.com/ahmednajibe/Wird/releases. Your data has not been changed.`;

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function newerDb(): string {
  dir = mkdtempSync(join(tmpdir(), 'guard-test-'));
  const dbPath = join(dir, 'x.db');
  const db = openDb(dbPath); // migrates fully to MAX
  db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
    MAX + 1,
    'future schema',
    new Date().toISOString(),
  );
  db.close();
  return dbPath;
}

const backupFiles = (dbPath: string) => {
  const b = backupDirFor(dbPath);
  return existsSync(b) ? readdirSync(b) : [];
};

describe('assertSchemaNotNewer', () => {
  it('openDb refuses a newer schema, writes no backup, changes nothing', () => {
    const dbPath = newerDb();
    const peek = new DatabaseSync(dbPath);
    const rowsBefore = peek.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    peek.close();
    expect(() => openDb(dbPath)).toThrow(EXPECTED);
    expect(backupFiles(dbPath)).toEqual([]);
    const db = new DatabaseSync(dbPath);
    expect(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(rowsBefore);
    db.close();
  });

  it('runMigrations refuses a newer schema directly', () => {
    const dbPath = newerDb();
    const db = new DatabaseSync(dbPath);
    expect(() => runMigrations(db)).toThrow(EXPECTED);
    expect(() => assertSchemaNotNewer(db)).toThrow(EXPECTED);
    db.close();
  });

  it('openDb still opens a same-version database normally', () => {
    dir = mkdtempSync(join(tmpdir(), 'guard-test-'));
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, 'ok.db');
    const db = openDb(dbPath);
    db.close();
    const again = openDb(dbPath); // reopen is a no-op
    again.close();
  });
});
