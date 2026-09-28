/**
 * Task persistence: maps DB rows <-> engine Task objects.
 */
import type { SQLInputValue } from 'node:sqlite';
import type { IsoDate, PlannedTask, StoredTaskStatus, Task, TaskSource, TaskType } from '../shared/types.js';
import type { Db } from './db.js';

interface TaskRow {
  id: number;
  date: string;
  track: string;
  stream: string;
  type: string;
  intensity: string;
  title: string;
  description: string;
  planned_minutes: number;
  actual_minutes: number | null;
  source: string;
  status: string;
  completed_date: string | null;
  completed_at: string | null;
  module_id: string | null;
  slot_key: string | null;
  sort_order: number;
  session_no: number | null;
  quran_pages: string;
  pages_count: number | null;
  off_curriculum: number;
  points: number | null;
}

function parsePages(raw: string): number[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    date: r.date,
    track: r.track as Task['track'],
    stream: r.stream as Task['stream'],
    type: r.type as TaskType,
    intensity: r.intensity as Task['intensity'],
    title: r.title,
    description: r.description,
    plannedMinutes: r.planned_minutes,
    actualMinutes: r.actual_minutes,
    source: r.source as TaskSource,
    status: r.status as StoredTaskStatus,
    completedDate: r.completed_date,
    completedAt: r.completed_at,
    moduleId: r.module_id,
    slotKey: r.slot_key,
    sortOrder: r.sort_order,
    sessionNo: r.session_no,
    quranPages: parsePages(r.quran_pages),
    pagesCount: r.pages_count,
    offCurriculum: r.off_curriculum === 1,
    points: r.points,
  };
}

export class TaskRepo {
  constructor(private readonly db: Db) {}

  private all(sql: string, ...params: SQLInputValue[]): Task[] {
    return (this.db.prepare(sql).all(...params) as unknown as TaskRow[]).map(rowToTask);
  }

  get(id: number): Task | null {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as TaskRow | undefined;
    return row ? rowToTask(row) : null;
  }

  byDate(date: IsoDate): Task[] {
    return this.all(
      "SELECT * FROM tasks WHERE date = ? ORDER BY CASE WHEN type IN ('quran-memorize','quran-review') THEN 0 ELSE 1 END, source DESC, sort_order, id",
      date,
    );
  }

  byDateRange(from: IsoDate, to: IsoDate): Task[] {
    return this.all(
      "SELECT * FROM tasks WHERE date BETWEEN ? AND ? ORDER BY date, CASE WHEN type IN ('quran-memorize','quran-review') THEN 0 ELSE 1 END, source DESC, sort_order, id",
      from,
      to,
    );
  }

  completed(): Task[] {
    return this.all("SELECT * FROM tasks WHERE status = 'completed' ORDER BY completed_date, completed_at, id");
  }

  completedQuran(): Task[] {
    return this.all(
      "SELECT * FROM tasks WHERE status = 'completed' AND type IN ('quran-memorize','quran-review') ORDER BY completed_date, completed_at, id",
    );
  }

  completedBetween(from: IsoDate, to: IsoDate): Task[] {
    return this.all(
      "SELECT * FROM tasks WHERE status = 'completed' AND completed_date BETWEEN ? AND ? ORDER BY completed_date, completed_at, id",
      from,
      to,
    );
  }

  pendingGeneratedFrom(from: IsoDate): Task[] {
    return this.all(
      "SELECT * FROM tasks WHERE source = 'generated' AND status = 'pending' AND date >= ? ORDER BY date, sort_order, id",
      from,
    );
  }

  firstActivityDate(): IsoDate | null {
    const row = this.db
      .prepare("SELECT MIN(COALESCE(completed_date, date)) AS d FROM tasks WHERE status = 'completed'")
      .get() as { d: string | null } | undefined;
    return row?.d ?? null;
  }

  maxGeneratedDate(): IsoDate | null {
    const row = this.db.prepare("SELECT MAX(date) AS d FROM tasks WHERE source = 'generated'").get() as
      | { d: string | null }
      | undefined;
    return row?.d ?? null;
  }

  insertPlanned(t: PlannedTask, nowIso: string): number {
    const res = this.db
      .prepare(
        `INSERT INTO tasks (date, track, stream, type, intensity, title, description, planned_minutes, source, status,
           module_id, slot_key, sort_order, session_no, quran_pages, off_curriculum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generated', 'pending', ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        t.date,
        t.track,
        t.stream,
        t.type,
        t.intensity,
        t.title,
        t.description,
        t.plannedMinutes,
        t.moduleId,
        t.slotKey,
        t.sortOrder,
        t.sessionNo,
        JSON.stringify(t.quranPages),
        nowIso,
      );
    return Number(res.lastInsertRowid);
  }

  insertManual(
    t: Omit<PlannedTask, 'slotKey' | 'sessionNo'> & { pagesCount: number | null; offCurriculum: boolean },
    nowIso: string,
  ): number {
    const res = this.db
      .prepare(
        `INSERT INTO tasks (date, track, stream, type, intensity, title, description, planned_minutes, source, status,
           module_id, slot_key, sort_order, quran_pages, pages_count, off_curriculum, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'pending', ?, NULL, ?, ?, ?, ?, ?)`,
      )
      .run(
        t.date,
        t.track,
        t.stream,
        t.type,
        t.intensity,
        t.title,
        t.description,
        t.plannedMinutes,
        t.moduleId,
        t.sortOrder,
        JSON.stringify(t.quranPages),
        t.pagesCount,
        t.offCurriculum ? 1 : 0,
        nowIso,
      );
    return Number(res.lastInsertRowid);
  }

  updateQuranContent(id: number, s: { type: TaskType; title: string; description: string; pages: number[]; minutes: number }): void {
    this.db
      .prepare('UPDATE tasks SET type = ?, title = ?, description = ?, quran_pages = ?, planned_minutes = ? WHERE id = ?')
      .run(s.type, s.title, s.description, JSON.stringify(s.pages), s.minutes, id);
  }

  markCompleted(
    id: number,
    p: { completedDate: IsoDate; completedAt: string; actualMinutes: number | null; points: number; quranPages?: number[] },
  ): void {
    if (p.quranPages) {
      this.db.prepare('UPDATE tasks SET quran_pages = ? WHERE id = ?').run(JSON.stringify(p.quranPages), id);
    }
    this.db
      .prepare(
        "UPDATE tasks SET status = 'completed', completed_date = ?, completed_at = ?, actual_minutes = ?, points = ? WHERE id = ?",
      )
      .run(p.completedDate, p.completedAt, p.actualMinutes, p.points, id);
  }

  markPending(id: number, clearPages: boolean): void {
    this.db
      .prepare(
        `UPDATE tasks SET status = 'pending', completed_date = NULL, completed_at = NULL, actual_minutes = NULL, points = NULL${
          clearPages ? ", quran_pages = '[]'" : ''
        } WHERE id = ?`,
      )
      .run(id);
  }

  markSkipped(id: number): void {
    this.db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").run(id);
  }

  markRolled(id: number): void {
    this.db.prepare("UPDATE tasks SET status = 'rolled' WHERE id = ? AND status <> 'completed'").run(id);
  }

  /**
   * Generated study (non-Quran) tasks to roll forward: pending ones dated in
   * [from, before) and skipped ones from `from` on (skip used to leave them).
   */
  rollCandidates(from: IsoDate, before: IsoDate): Task[] {
    return this.all(
      `SELECT * FROM tasks WHERE source = 'generated' AND type NOT IN ('quran-memorize','quran-review') AND date >= ?
         AND ((status = 'pending' AND date < ?) OR status = 'skipped')
       ORDER BY date, sort_order, id`,
      from,
      before,
    );
  }

  countCompletedGenerated(track: string, stream: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM tasks WHERE source = 'generated' AND status = 'completed' AND track = ? AND stream = ?")
      .get(track, stream) as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  updateStudyContent(
    id: number,
    c: { type: TaskType; intensity: string; title: string; description: string; moduleId: string | null; sessionNo: number },
  ): void {
    this.db
      .prepare('UPDATE tasks SET type = ?, intensity = ?, title = ?, description = ?, module_id = ?, session_no = ? WHERE id = ?')
      .run(c.type, c.intensity, c.title, c.description, c.moduleId, c.sessionNo, id);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  }

  deletePendingGeneratedOn(date: IsoDate): number {
    const res = this.db.prepare("DELETE FROM tasks WHERE date = ? AND source = 'generated' AND status = 'pending'").run(date);
    return Number(res.changes);
  }
}

export class PlannedDaysRepo {
  constructor(private readonly db: Db) {}

  plannedIn(from: IsoDate, to: IsoDate): Set<IsoDate> {
    const rows = this.db.prepare('SELECT date FROM planned_days WHERE date BETWEEN ? AND ?').all(from, to) as {
      date: string;
    }[];
    return new Set(rows.map((r) => r.date));
  }

  mark(date: IsoDate, nowIso: string, quranReserve: number | null = null): void {
    this.db
      .prepare(
        `INSERT INTO planned_days (date, generated_at, quran_reserve) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET generated_at = excluded.generated_at, quran_reserve = excluded.quran_reserve`,
      )
      .run(date, nowIso, quranReserve);
  }

  /** Quran reservation R each planned day was planned with (null if unknown). */
  reservesIn(from: IsoDate, to: IsoDate): Map<IsoDate, number | null> {
    const rows = this.db.prepare('SELECT date, quran_reserve FROM planned_days WHERE date BETWEEN ? AND ?').all(from, to) as {
      date: string;
      quran_reserve: number | null;
    }[];
    return new Map(rows.map((r) => [r.date, r.quran_reserve]));
  }

  maxPlanned(): IsoDate | null {
    const row = this.db.prepare('SELECT MAX(date) AS d FROM planned_days').get() as { d: string | null } | undefined;
    return row?.d ?? null;
  }
}
