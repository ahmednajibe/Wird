/**
 * Versioned schema migrations. Append new migrations; never edit applied ones.
 */
import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  sql: string;
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
];

export function runMigrations(db: DatabaseSync): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map((r) => r.version),
  );
  const ran: number[] = [];
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
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
