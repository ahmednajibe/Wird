/**
 * Versioned schema migrations. Append new migrations; never edit applied ones.
 */
import type { DatabaseSync } from 'node:sqlite';
import { BUILTIN_QURAN_TRACK } from '../shared/catalog.js';
import { seedOwnerPlan } from './seed/seed.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  /** Runs after `sql`, inside the same transaction. */
  run?: (db: DatabaseSync, ctx: { existingDb: boolean }) => void;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        track TEXT NOT NULL CHECK (track IN ('quran','fsd','ai','animation')),
        stream TEXT NOT NULL CHECK (stream IN ('main','draw','story')),
        type TEXT NOT NULL CHECK (type IN ('learn','build','practice','review','quran-memorize','quran-review')),
        intensity TEXT NOT NULL CHECK (intensity IN ('deep','normal','light')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes >= 0),
        actual_minutes INTEGER,
        source TEXT NOT NULL CHECK (source IN ('generated','manual')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped')),
        completed_date TEXT,
        completed_at TEXT,
        module_id TEXT,
        slot_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        quran_pages TEXT NOT NULL DEFAULT '[]',
        pages_count INTEGER,
        off_curriculum INTEGER NOT NULL DEFAULT 0,
        points INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_tasks_date ON tasks(date);
      CREATE INDEX idx_tasks_completed_date ON tasks(completed_date);
      CREATE INDEX idx_tasks_track_status ON tasks(track, status);

      CREATE TABLE planned_days (
        date TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL
      );

      CREATE TABLE day_overrides (
        date TEXT PRIMARY KEY,
        fasting INTEGER,
        capacity_override INTEGER,
        note TEXT
      );

      CREATE TABLE module_state (
        module_id TEXT PRIMARY KEY,
        manual_complete INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        reset_at TEXT
      );

      CREATE TABLE daily_summary (
        date TEXT PRIMARY KEY,
        earned_points INTEGER NOT NULL,
        planned_points INTEGER NOT NULL,
        baseline INTEGER NOT NULL,
        counts INTEGER NOT NULL,
        is_rest_day INTEGER NOT NULL,
        is_fasting INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'daily_summary snapshot date',
    // Cairo date on which the baseline snapshot was written. Snapshots of days
    // before today are frozen; existing rows are kept as their snapshots.
    sql: `ALTER TABLE daily_summary ADD COLUMN snapshot_date TEXT;`,
  },
  {
    version: 3,
    name: 'session queues: rolled status, session_no, planned_days.quran_reserve',
    // SQLite cannot alter a CHECK constraint, so tasks is rebuilt to allow
    // status 'rolled' and gain session_no. Existing rows are copied as-is.
    sql: `
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        track TEXT NOT NULL CHECK (track IN ('quran','fsd','ai','animation')),
        stream TEXT NOT NULL CHECK (stream IN ('main','draw','story')),
        type TEXT NOT NULL CHECK (type IN ('learn','build','practice','review','quran-memorize','quran-review')),
        intensity TEXT NOT NULL CHECK (intensity IN ('deep','normal','light')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes >= 0),
        actual_minutes INTEGER,
        source TEXT NOT NULL CHECK (source IN ('generated','manual')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','rolled')),
        completed_date TEXT,
        completed_at TEXT,
        module_id TEXT,
        slot_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        session_no INTEGER,
        quran_pages TEXT NOT NULL DEFAULT '[]',
        pages_count INTEGER,
        off_curriculum INTEGER NOT NULL DEFAULT 0,
        points INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO tasks_new (id, date, track, stream, type, intensity, title, description, planned_minutes, actual_minutes,
        source, status, completed_date, completed_at, module_id, slot_key, sort_order, session_no, quran_pages, pages_count,
        off_curriculum, points, created_at)
      SELECT id, date, track, stream, type, intensity, title, description, planned_minutes, actual_minutes,
        source, status, completed_date, completed_at, module_id, slot_key, sort_order, NULL, quran_pages, pages_count,
        off_curriculum, points, created_at
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX idx_tasks_date ON tasks(date);
      CREATE INDEX idx_tasks_completed_date ON tasks(completed_date);
      CREATE INDEX idx_tasks_track_status ON tasks(track, status);

      ALTER TABLE planned_days ADD COLUMN quran_reserve INTEGER;
    `,
  },
  {
    version: 4,
    name: 'plan catalog tables; tasks track/stream become free-form',
    // The catalog moves into the database (plan packs in phase 3). Existing
    // databases are seeded with the owner plan; fresh installs get only the
    // built-in Quran track and an empty weekly template.
    sql: `
      CREATE TABLE plan_tracks (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('study','quran')),
        label TEXT NOT NULL, short_label TEXT NOT NULL, theme TEXT NOT NULL, icon TEXT NOT NULL,
        type_labels TEXT NOT NULL DEFAULT '{}', sort_order INTEGER NOT NULL, archived_at TEXT,
        CHECK (kind <> 'quran' OR id = 'quran'));
      CREATE TABLE plan_streams (
        track_id TEXT NOT NULL REFERENCES plan_tracks(id), id TEXT NOT NULL,
        label TEXT NOT NULL, short_label TEXT NOT NULL, style TEXT NOT NULL CHECK (style IN ('study','practice')),
        warmup_title TEXT, light_title TEXT, default_drills TEXT, theme TEXT, icon TEXT,
        sort_order INTEGER NOT NULL, archived_at TEXT, PRIMARY KEY (track_id, id));
      CREATE TABLE plan_modules (
        id TEXT PRIMARY KEY, track_id TEXT NOT NULL, stream_id TEXT NOT NULL,
        phase_id TEXT NOT NULL, phase_title TEXT NOT NULL, title TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('study','project')), est_minutes INTEGER NOT NULL CHECK (est_minutes > 0),
        estimate_uncertain INTEGER NOT NULL DEFAULT 0, note TEXT, warmup_drills TEXT,
        sort_order INTEGER NOT NULL, archived_at TEXT,
        FOREIGN KEY (track_id, stream_id) REFERENCES plan_streams(track_id, id));
      CREATE TABLE plan_resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, module_id TEXT REFERENCES plan_modules(id),
        track_id TEXT, stream_id TEXT, name TEXT NOT NULL, url TEXT,
        owned INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, note TEXT, sort_order INTEGER NOT NULL,
        CHECK (module_id IS NOT NULL OR (track_id IS NOT NULL AND stream_id IS NOT NULL)));
      CREATE TABLE plan_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, imported_at TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('seed','update','fresh')), pack_name TEXT,
        pack_json TEXT NOT NULL, summary_json TEXT NOT NULL);

      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        track TEXT NOT NULL CHECK (length(track) > 0),
        stream TEXT NOT NULL CHECK (length(stream) > 0),
        type TEXT NOT NULL CHECK (type IN ('learn','build','practice','review','quran-memorize','quran-review')),
        intensity TEXT NOT NULL CHECK (intensity IN ('deep','normal','light')),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes >= 0),
        actual_minutes INTEGER,
        source TEXT NOT NULL CHECK (source IN ('generated','manual')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','rolled')),
        completed_date TEXT,
        completed_at TEXT,
        module_id TEXT,
        slot_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        session_no INTEGER,
        quran_pages TEXT NOT NULL DEFAULT '[]',
        pages_count INTEGER,
        off_curriculum INTEGER NOT NULL DEFAULT 0,
        points INTEGER,
        created_at TEXT NOT NULL
      );
      INSERT INTO tasks_new (id, date, track, stream, type, intensity, title, description, planned_minutes, actual_minutes,
        source, status, completed_date, completed_at, module_id, slot_key, sort_order, session_no, quran_pages, pages_count,
        off_curriculum, points, created_at)
      SELECT id, date, track, stream, type, intensity, title, description, planned_minutes, actual_minutes,
        source, status, completed_date, completed_at, module_id, slot_key, sort_order, session_no, quran_pages, pages_count,
        off_curriculum, points, created_at
      FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
      CREATE INDEX idx_tasks_date ON tasks(date);
      CREATE INDEX idx_tasks_completed_date ON tasks(completed_date);
      CREATE INDEX idx_tasks_track_status ON tasks(track, status);
    `,
    run(db, { existingDb }) {
      const t = BUILTIN_QURAN_TRACK;
      const hasQuran = db.prepare('SELECT 1 FROM plan_tracks WHERE id = ?').get(t.id);
      if (!hasQuran) {
        db.prepare(
          `INSERT INTO plan_tracks (id, kind, label, short_label, theme, icon, type_labels, sort_order, archived_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
        ).run(t.id, t.kind, t.label, t.shortLabel, t.theme, t.icon, JSON.stringify(t.typeLabels));
      }
      if (existingDb) seedOwnerPlan(db);
    },
  },
];

/** Versions defined but not yet applied to this database, ascending. */
export function pendingVersions(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  return MIGRATIONS.map((m) => m.version).filter((v) => !applied.has(v)).sort((a, b) => a - b);
}

export function runMigrations(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const existingDb = applied.size > 0;
  const ran: number[] = [];
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      m.run?.(db, { existingDb });
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        new Date().toISOString(),
      );
      db.exec('COMMIT');
      ran.push(m.version);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return ran;
}
