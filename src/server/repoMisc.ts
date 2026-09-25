/**
 * Settings, day overrides, module state, daily summary cache and meta.
 */
import { resolveSettings, type Settings } from '../shared/settings.js';
import type { ModuleStateRecord } from '../shared/progress.js';
import type { DayOverride, IsoDate } from '../shared/types.js';
import type { Db } from './db.js';

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(): Settings {
    const row = this.db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string } | undefined;
    let stored: unknown = {};
    if (row) {
      try {
        stored = JSON.parse(row.json);
      } catch {
        stored = {};
      }
    }
    return resolveSettings(stored);
  }

  save(settings: Settings, nowIso: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
      )
      .run(JSON.stringify(settings), nowIso);
  }
}

interface OverrideRow {
  date: string;
  fasting: number | null;
  capacity_override: number | null;
  note: string | null;
}

function toOverride(r: OverrideRow): DayOverride {
  return {
    date: r.date,
    fasting: r.fasting === null ? null : r.fasting === 1,
    capacityOverride: r.capacity_override,
    note: r.note,
  };
}

export class DayOverrideRepo {
  constructor(private readonly db: Db) {}

  get(date: IsoDate): DayOverride | null {
    const row = this.db.prepare('SELECT * FROM day_overrides WHERE date = ?').get(date) as unknown as
      | OverrideRow
      | undefined;
    return row ? toOverride(row) : null;
  }

  range(from: IsoDate, to: IsoDate): Map<IsoDate, DayOverride> {
    const rows = this.db
      .prepare('SELECT * FROM day_overrides WHERE date BETWEEN ? AND ?')
      .all(from, to) as unknown as OverrideRow[];
    return new Map(rows.map((r) => [r.date, toOverride(r)]));
  }

  upsert(o: DayOverride): void {
    if (o.fasting === null && o.capacityOverride === null && (o.note === null || o.note === '')) {
      this.db.prepare('DELETE FROM day_overrides WHERE date = ?').run(o.date);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO day_overrides (date, fasting, capacity_override, note) VALUES (?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET fasting = excluded.fasting, capacity_override = excluded.capacity_override, note = excluded.note`,
      )
      .run(o.date, o.fasting === null ? null : o.fasting ? 1 : 0, o.capacityOverride, o.note);
  }
}

interface ModuleStateRow {
  module_id: string;
  manual_complete: number;
  completed_at: string | null;
  reset_at: string | null;
}

export class ModuleStateRepo {
  constructor(private readonly db: Db) {}

  all(): ModuleStateRecord[] {
    const rows = this.db.prepare('SELECT * FROM module_state').all() as unknown as ModuleStateRow[];
    return rows.map((r) => ({
      moduleId: r.module_id,
      manualComplete: r.manual_complete === 1,
      completedAt: r.completed_at,
      resetAt: r.reset_at,
    }));
  }

  markComplete(moduleId: string, nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO module_state (module_id, manual_complete, completed_at, reset_at) VALUES (?, 1, ?, NULL)
         ON CONFLICT(module_id) DO UPDATE SET manual_complete = 1, completed_at = excluded.completed_at`,
      )
      .run(moduleId, nowIso);
  }

  reset(moduleId: string, nowIso: string): void {
    this.db
      .prepare(
        `INSERT INTO module_state (module_id, manual_complete, completed_at, reset_at) VALUES (?, 0, NULL, ?)
         ON CONFLICT(module_id) DO UPDATE SET manual_complete = 0, completed_at = NULL, reset_at = excluded.reset_at`,
      )
      .run(moduleId, nowIso);
  }
}

export interface DailySummaryRow {
  date: IsoDate;
  earnedPoints: number;
  plannedPoints: number;
  baseline: number;
  counts: boolean;
  isRestDay: boolean;
  isFasting: boolean;
}

export class SummaryRepo {
  constructor(private readonly db: Db) {}

  upsertMany(rows: readonly DailySummaryRow[], nowIso: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO daily_summary (date, earned_points, planned_points, baseline, counts, is_rest_day, is_fasting, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET earned_points = excluded.earned_points, planned_points = excluded.planned_points,
         baseline = excluded.baseline, counts = excluded.counts, is_rest_day = excluded.is_rest_day,
         is_fasting = excluded.is_fasting, updated_at = excluded.updated_at`,
    );
    for (const r of rows) {
      stmt.run(
        r.date,
        r.earnedPoints,
        r.plannedPoints,
        r.baseline,
        r.counts ? 1 : 0,
        r.isRestDay ? 1 : 0,
        r.isFasting ? 1 : 0,
        nowIso,
      );
    }
  }
}

export class MetaRepo {
  constructor(private readonly db: Db) {}

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }
}
