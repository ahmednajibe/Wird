/**
 * Backward compatibility of migration 4: a database created by migrations 1-3
 * gains the plan tables seeded with the owner catalog, keeps every task row
 * byte-for-byte, and writes a pre-migrate backup. Re-opening is a no-op.
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { backupDirFor } from '../src/server/config.js';
import { MIGRATIONS } from '../src/server/migrations.js';
import { CatalogRepo } from '../src/server/repoCatalog.js';
import { OWNER_CATALOG_DATA, OWNER_WEEKLY_TEMPLATE } from '../src/server/seed/ownerCatalog.js';
import { DEFAULT_TIMEZONE } from '../src/shared/dates.js';
import { makeTestApp, TestClock } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const INSERT_TASK = `INSERT INTO tasks
  (date, track, stream, type, intensity, title, description, planned_minutes, actual_minutes,
   source, status, completed_date, completed_at, module_id, slot_key, sort_order, session_no,
   quran_pages, pages_count, off_curriculum, points, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

/** Builds a database that only has migrations 1-3 applied. */
function createPreMigrationDb(path: string): void {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  for (const m of MIGRATIONS.filter((x) => x.version <= 3)) {
    db.exec(m.sql);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      m.version,
      m.name,
      '2026-09-01T00:00:00Z',
    );
  }
  // A settings row written before weeklyTemplate existed.
  db.prepare('INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?)').run(
    JSON.stringify({ capacityByDow: [100, 100, 100, 100, 100, 150, 150] }),
    '2026-09-01T00:00:00Z',
  );
  const ins = db.prepare(INSERT_TASK);
  ins.run('2026-09-20', 'ai', 'main', 'learn', 'normal', 'Python: core syntax', '', 30, 30,
    'generated', 'completed', '2026-09-20', '2026-09-20T05:00:00Z', 'ai-py', 'ai/main/0', 1, 1, '[]', null, 0, 10, '2026-09-20T04:00:00Z');
  ins.run('2026-09-20', 'quran', 'main', 'quran-memorize', 'normal', 'Memorize page 604', '', 40, 40,
    'generated', 'completed', '2026-09-20', '2026-09-20T06:00:00Z', null, 'quran', 0, null, '[604]', null, 0, 15, '2026-09-20T04:00:00Z');
  ins.run('2026-09-27', 'fsd', 'main', 'learn', 'normal', 'Node and npm basics', '', 60, null,
    'generated', 'pending', null, null, 'fsd-node', 'fsd/main/0', 1, 1, '[]', null, 0, null, '2026-09-27T04:00:00Z');
  db.close();
}

/** Strips task-progress fields so catalogs compare structurally. */
function structural(streams: Json[]): unknown {
  return streams.map(({ currentModuleId, currentModuleTitle, projection, phases, ...rest }) => ({
    ...rest,
    phases: (phases as Json[]).map(({ modules, ...ph }) => ({
      ...ph,
      modules: (modules as Json[]).map(({ progress, isCurrent, ...m }) => m),
    })),
  }));
}

describe('migration 4 on an existing database', () => {
  it('seeds the owner plan, keeps task rows, writes a backup and is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'learning-mig-'));
    const dbPath = join(dir, 'old.db');
    try {
      createPreMigrationDb(dbPath);
      const peek = new DatabaseSync(dbPath);
      const tasksBefore = peek.prepare('SELECT * FROM tasks ORDER BY id').all();
      peek.close();

      const clock = new TestClock(new Date('2026-09-28T04:00:00Z'));
      const { app, service, db } = createApp({ dbPath, clock, webDir: join(dir, 'no-web'), initialTimezone: DEFAULT_TIMEZONE });
      try {
        // Catalog in the DB deep-equals the owner seed.
        expect(new CatalogRepo(db).load()).toEqual(OWNER_CATALOG_DATA);

        // The stored settings gained the owner weekly template; other keys kept.
        const stored = JSON.parse((db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string }).json) as Json;
        expect(stored.capacityByDow).toEqual([100, 100, 100, 100, 100, 150, 150]);
        expect(stored.weeklyTemplate).toEqual(OWNER_WEEKLY_TEMPLATE);
        expect(service.settings().weeklyTemplate).toEqual(OWNER_WEEKLY_TEMPLATE);

        // Every task row survived the rebuild column for column.
        expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(tasksBefore);

        // The import was recorded.
        expect(db.prepare('SELECT mode, pack_name FROM plan_imports').all()).toEqual([
          { mode: 'seed', pack_name: 'Owner plan (migrated)' },
        ]);

        // A pre-migrate backup was written next to the database.
        const backups = readdirSync(backupDirFor(dbPath)).filter((f) => f.startsWith('pre-migrate-v4-'));
        expect(backups).toHaveLength(1);

        // Track read model matches a fresh owner-seeded app at the same clock,
        // ignoring progress fields (this database has different history).
        const migratedTracks = (await (await app.request('/api/tracks')).json()) as Json;
        const fresh = makeTestApp('2026-09-28');
        const freshTracks = (await (await fresh.app.request('/api/tracks')).json()) as Json;
        expect(structural(migratedTracks.streams as Json[])).toEqual(structural(freshTracks.streams as Json[]));
        expect(freshTracks.streams).toHaveLength(4);
        fresh.cleanup();
      } finally {
        if (db.isOpen) db.close();
      }

      // Re-opening an already-migrated database runs nothing: no new backup.
      const second = createApp({ dbPath, clock, webDir: join(dir, 'no-web'), initialTimezone: DEFAULT_TIMEZONE });
      try {
        expect(second.service.catalog.data.tracks.map((t) => t.id)).toEqual(['quran', 'ai', 'fsd', 'animation']);
      } finally {
        second.db.close();
      }
      expect(readdirSync(backupDirFor(dbPath)).filter((f) => f.startsWith('pre-migrate-v4-'))).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
