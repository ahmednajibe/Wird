/**
 * Plan-pack import: preview purity, update semantics (archive/revive,
 * history preserved), fresh mode with onIdReuse, catalog view, export
 * round trip, and the empty-plan streak fix.
 */
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/server/db.js';
import { CatalogRepo } from '../src/server/repoCatalog.js';
import { OWNER_PACK } from '../src/server/seed/ownerCatalog.js';
import { addDays } from '../src/shared/dates.js';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ctx: ReturnType<typeof makeTestApp> | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await ctx!.app.request(path, init);
  return { status: res.status, json: (await res.json()) as Json };
}

function dumpTables(db: Db): Record<string, unknown[]> {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) out[name] = db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
  return out;
}

function summaryRows(db: Db, before: string): unknown[] {
  return db
    .prepare(
      'SELECT date, earned_points, planned_points, baseline, counts, is_rest_day, is_fasting, snapshot_date FROM daily_summary WHERE date < ? ORDER BY date',
    )
    .all(before);
}

/** First generated study task with a module on today's dashboard. */
async function completeFirstStudyTask(): Promise<{ id: number; moduleId: string }> {
  const { json } = await call('GET', '/api/dashboard');
  const task = (json.tasks as Json[]).find((t) => !t.type.startsWith('quran') && t.moduleId);
  expect(task).toBeDefined();
  const done = await call('POST', `/api/tasks/${task!.id}/complete`, { actualMinutes: task!.minutes });
  expect(done.status).toBe(200);
  return { id: task!.id as number, moduleId: task!.moduleId as string };
}

const MEDICINE_TRACK = {
  id: 'medicine',
  kind: 'study' as const,
  label: 'Medicine',
  theme: 'green',
  icon: 'heartbeat',
  streams: [
    { id: 'main', label: 'Main', style: 'study' as const },
    { id: 'drills', label: 'Drills', style: 'practice' as const, defaultDrills: 'Flashcards.' },
  ],
};

function medicinePack(moduleId: string) {
  return {
    version: 1,
    name: 'Medicine plan',
    tracks: [MEDICINE_TRACK],
    modules: [
      { id: moduleId, track: 'medicine', stream: 'main', phase: { id: 'M1', title: 'Block 1' }, title: 'Anatomy intro', estMinutes: 60 },
      { id: 'med-phys', track: 'medicine', stream: 'main', phase: { id: 'M1', title: 'Block 1' }, title: 'Physiology', estMinutes: 45 },
    ],
    settings: {
      weeklyTemplate: [[{ track: 'medicine', stream: 'main', role: 'focus', kind: 'share', share: 1 }], [], [], [], [], [], []],
    },
  };
}

describe('import preview', () => {
  it('writes nothing to the database', async () => {
    ctx = makeTestApp('2026-10-04');
    await call('GET', '/api/dashboard'); // materialize today so the dump covers real rows
    const before = dumpTables(ctx.db);
    const res = await call('POST', '/api/import/preview', { pack: medicinePack('ai-py'), mode: 'fresh' });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    const after = dumpTables(ctx.db);
    expect(after).toEqual(before);
  });

  it('reports the owner pack as unchanged in update mode', async () => {
    ctx = makeTestApp('2026-10-04');
    const res = await call('POST', '/api/import/preview', { pack: OWNER_PACK, mode: 'update' });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    for (const k of ['tracks', 'streams', 'modules'] as const) {
      const c = res.json.counts[k] as Json;
      expect(c.added + c.updated + c.revived + c.archived).toBe(0);
      expect(c.unchanged).toBeGreaterThan(0);
    }
    expect(res.json.regenerates).toBe(false);
    expect(res.json.settingsChanged).toEqual([]);
    expect(res.json.archived).toEqual([]);
  });

  it('returns ok:false (still 200) for an invalid pack', async () => {
    ctx = makeTestApp('2026-10-04');
    const res = await call('POST', '/api/import/preview', { pack: { version: 2 }, mode: 'update' });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(false);
    expect((res.json.errors as Json[]).length).toBeGreaterThan(0);
  });
});

describe('import commit (update mode)', () => {
  it('committing the owner pack changes nothing and writes a backup', async () => {
    ctx = makeTestApp('2026-10-04');
    const tracksBefore = (await call('GET', '/api/tracks')).json;
    const weekBefore = (await call('GET', '/api/week?start=2026-10-04')).json;
    const res = await call('POST', '/api/import', { pack: OWNER_PACK, mode: 'update' });
    expect(res.status).toBe(200);
    expect(res.json.regenerated).toBe(false);
    expect(res.json.backup).toMatch(/pre-import-\d{8}-\d{6}(-\d+)?\.db$/);
    expect(existsSync(res.json.backup as string)).toBe(true);
    expect((await call('GET', '/api/tracks')).json).toEqual(tracksBefore);
    expect((await call('GET', '/api/week?start=2026-10-04')).json).toEqual(weekBefore);
  });

  it('archives missing modules, updates metadata, preserves history, revives on re-import', async () => {
    ctx = makeTestApp('2026-10-04');
    const db = ctx!.db;
    const service = ctx!.service;

    // Give module X real progress: complete one of its tasks.
    const done = await completeFirstStudyTask();
    const xid = done.moduleId;
    const creditedBefore = service.ledger().creditedOf(xid);
    expect(creditedBefore).toBeGreaterThan(0);

    const taskRowBefore = db.prepare('SELECT * FROM tasks WHERE id = ?').get(done.id);
    // Past-day summaries are frozen; today's snapshot is refreshed on every
    // evaluation by design, so history means rows before today.
    const summaryBefore = summaryRows(db, service.today());
    const startBefore = db.prepare("SELECT value FROM meta WHERE key = 'tracking_start_date'").get();
    const moduleStateBefore = db.prepare('SELECT * FROM module_state ORDER BY module_id').all();

    // Pack without X, with a retitled module and a new module.
    const retitleId = 'ai-py' === xid ? 'fsd-http' : 'ai-py';
    const edited = JSON.parse(JSON.stringify(OWNER_PACK)) as any;
    edited.name = 'Edited plan';
    edited.modules = edited.modules.filter((m: Json) => m.id !== xid);
    const retitled = edited.modules.find((m: Json) => m.id === retitleId);
    retitled.title = 'Retitled module';
    edited.modules.push({
      id: 'new-mod',
      track: retitled.track,
      stream: retitled.stream,
      phase: { id: 'NEW-1', title: 'New phase' },
      title: 'A brand new module',
      estMinutes: 30,
    });

    const preview = await call('POST', '/api/import/preview', { pack: edited, mode: 'update' });
    expect(preview.json.ok).toBe(true);
    const archived = preview.json.archived as Json[];
    expect(archived).toContainEqual(expect.objectContaining({ kind: 'module', id: xid, hasProgress: true }));
    expect(preview.json.counts.modules.added).toBe(1);
    expect(preview.json.counts.modules.updated).toBe(1);
    expect(preview.json.regenerates).toBe(true);

    const commit = await call('POST', '/api/import', { pack: edited, mode: 'update' });
    expect(commit.status).toBe(200);
    expect(commit.json.regenerated).toBe(true);

    // The module row is archived, not deleted.
    const row = db.prepare('SELECT archived_at FROM plan_modules WHERE id = ?').get(xid) as { archived_at: string | null };
    expect(row.archived_at).not.toBeNull();
    // /api/tracks no longer lists it.
    const tracksJson = (await call('GET', '/api/tracks')).json;
    const listed = JSON.stringify(tracksJson);
    expect(listed).not.toContain(`"id":"${xid}"`);

    // History is preserved exactly.
    expect(db.prepare('SELECT * FROM tasks WHERE id = ?').get(done.id)).toEqual(taskRowBefore);
    expect(summaryRows(db, service.today())).toEqual(summaryBefore);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'tracking_start_date'").get()).toEqual(startBefore);
    expect(db.prepare('SELECT * FROM module_state ORDER BY module_id').all()).toEqual(moduleStateBefore);
    expect(service.ledger().creditedOf(xid)).toBe(creditedBefore);

    // plan_imports logged the update.
    const imp = db.prepare('SELECT mode, pack_name FROM plan_imports ORDER BY id DESC LIMIT 1').get() as Json;
    expect(imp.mode).toBe('update');
    expect(imp.pack_name).toBe('Edited plan');

    // Re-importing a pack that contains X revives it with its progress.
    const rev = await call('POST', '/api/import/preview', { pack: OWNER_PACK, mode: 'update' });
    expect(rev.json.ok).toBe(true);
    const revivedRow = rev.json.counts.modules as Json;
    expect(revivedRow.revived).toBe(1);
    const commit2 = await call('POST', '/api/import', { pack: OWNER_PACK, mode: 'update' });
    expect(commit2.status).toBe(200);
    const row2 = db.prepare('SELECT archived_at FROM plan_modules WHERE id = ?').get(xid) as { archived_at: string | null };
    expect(row2.archived_at).toBeNull();
    expect(service.ledger().creditedOf(xid)).toBe(creditedBefore);
  });

  it('restores the in-memory catalog when the transaction fails after reload', async () => {
    ctx = makeTestApp('2026-10-04');
    const edited = JSON.parse(JSON.stringify(OWNER_PACK)) as Json;
    edited.modules.push({
      id: 'new-mod',
      track: 'ai',
      stream: 'main',
      phase: { id: 'NEW-1', title: 'New phase' },
      title: 'A brand new module',
      estMinutes: 30,
    });
    // recordImport runs last, after service.reloadCatalog(): forcing it to
    // throw leaves the in-memory catalog holding the rolled-back import.
    const spy = vi.spyOn(CatalogRepo.prototype, 'recordImport').mockImplementation(() => {
      throw new Error('forced failure');
    });
    try {
      const res = await call('POST', '/api/import', { pack: edited, mode: 'update' });
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(ctx!.db.prepare("SELECT id FROM plan_modules WHERE id = 'new-mod'").get()).toBeUndefined();
    expect(ctx!.service.catalog.data).toEqual(new CatalogRepo(ctx!.db).load());
  });

  it('rejects moving a module to another stream with the exact message', async () => {
    ctx = makeTestApp('2026-10-04');
    const edited = JSON.parse(JSON.stringify(OWNER_PACK)) as any;
    const m = edited.modules.find((x: Json) => x.id === 'ai-py');
    m.track = 'fsd';
    m.stream = 'main';
    const preview = await call('POST', '/api/import/preview', { pack: edited, mode: 'update' });
    expect(preview.json.ok).toBe(false);
    expect(preview.json.errors).toContainEqual(
      expect.objectContaining({ message: `module 'ai-py' already exists in ai/main; it cannot move to fsd/main. Give it a new id.` }),
    );
    const commit = await call('POST', '/api/import', { pack: edited, mode: 'update' });
    expect(commit.status).toBe(422);
    expect(commit.json.error).toBe('Invalid plan');
    expect((commit.json.details.errors as Json[]).map((e) => e.message)).toContain(
      `module 'ai-py' already exists in ai/main; it cannot move to fsd/main. Give it a new id.`,
    );
  });
});

describe('import commit (fresh mode)', () => {
  async function setupWithProgress() {
    const done = await completeFirstStudyTask();
    // Reset drops credits strictly older than reset_at; move the clock past
    // the completion instant so the reset is strictly later.
    ctx!.clock.advanceMinutes(1);
    const creditedBefore = ctx!.service.ledger().creditedOf(done.moduleId);
    expect(creditedBefore).toBeGreaterThan(0);
    return { done, creditedBefore };
  }

  /**
   * Past-day summary rows are frozen; today's row is intentionally refreshed
   * under the new plan, so history means rows before today plus today's
   * earned points.
   */
  function historySnapshot() {
    const db = ctx!.db;
    const t = ctx!.service.today();
    return {
      completed: db.prepare("SELECT * FROM tasks WHERE status = 'completed' ORDER BY id").all(),
      summary: db
        .prepare('SELECT * FROM daily_summary WHERE date < ? ORDER BY date')
        .all(t),
      todayEarned: db.prepare('SELECT earned_points FROM daily_summary WHERE date = ?').get(t),
      start: db.prepare("SELECT value FROM meta WHERE key = 'tracking_start_date'").get(),
    };
  }

  function medicinePreview(moduleId: string) {
    return call('POST', '/api/import/preview', { pack: medicinePack(moduleId), mode: 'fresh' });
  }

  it('previews reused ids, resets or keeps progress, archives old tracks', async () => {
    ctx = makeTestApp('2026-10-04');
    const { done, creditedBefore } = await setupWithProgress();
    const before = historySnapshot();

    const preview = await medicinePreview(done.moduleId);
    expect(preview.json.ok).toBe(true);
    expect(preview.json.reusedWithProgress).toEqual([
      expect.objectContaining({ id: done.moduleId, creditedMinutes: creditedBefore }),
    ]);

    // reset: progress is wiped via module_state.reset_at.
    const res = await call('POST', '/api/import', { pack: medicinePack(done.moduleId), mode: 'fresh', onIdReuse: 'reset' });
    expect(res.status).toBe(200);
    expect(res.json.regenerated).toBe(true);

    const db = ctx!.db;
    const service = ctx!.service;
    expect(service.ledger().creditedOf(done.moduleId)).toBe(0);

    // All old study tracks are archived; Quran is not.
    const trackRows = db.prepare('SELECT id, kind, archived_at FROM plan_tracks ORDER BY sort_order').all() as Json[];
    for (const t of trackRows) {
      if (t.kind === 'quran' || t.id === 'medicine') expect(t.archived_at).toBeNull();
      else expect(t.archived_at).not.toBeNull();
    }

    // History preserved.
    const after = historySnapshot();
    expect(after.completed).toEqual(before.completed);
    expect(after.summary).toEqual(before.summary);
    expect(after.todayEarned).toEqual(before.todayEarned);
    expect(after.start).toEqual(before.start);

    // New plan generates tasks on the medicine stream (Sunday slot).
    const week = await call('GET', '/api/week?start=2026-10-04');
    const tasks = (week.json.days as Json[]).flatMap((d) => d.tasks as Json[]);
    expect(tasks.some((t) => t.track === 'medicine' && t.stream === 'main')).toBe(true);
  });

  it('keep preserves progress on reused ids', async () => {
    ctx = makeTestApp('2026-10-04');
    const { done, creditedBefore } = await setupWithProgress();
    const before = historySnapshot();

    const res = await call('POST', '/api/import', { pack: medicinePack(done.moduleId), mode: 'fresh', onIdReuse: 'keep' });
    expect(res.status).toBe(200);
    expect(ctx!.service.ledger().creditedOf(done.moduleId)).toBe(creditedBefore);

    const after = historySnapshot();
    expect(after.completed).toEqual(before.completed);
    expect(after.summary).toEqual(before.summary);
    expect(after.todayEarned).toEqual(before.todayEarned);
    expect(after.start).toEqual(before.start);
    const st = ctx!.db.prepare('SELECT reset_at FROM module_state WHERE module_id = ?').get(done.moduleId) as Json | undefined;
    expect(st === undefined || st.reset_at === null).toBe(true);
  });
});

describe('catalog and export read models', () => {
  it('GET /api/catalog returns the owner catalog shape', async () => {
    ctx = makeTestApp('2026-10-04');
    const res = await call('GET', '/api/catalog');
    expect(res.status).toBe(200);
    expect(res.json.hasPlan).toBe(true);
    expect(res.json.planName).toBe('Owner plan (migrated)');
    expect(typeof res.json.importedAt).toBe('string');
    expect(res.json.quranEnabled).toBe(true);
    expect(res.json.timezone).toBe('Africa/Cairo');
    expect(res.json.themes).toEqual(['amber', 'blue', 'violet', 'coral', 'green', 'teal', 'rose', 'slate']);
    expect(res.json.icons).toHaveLength(16);
    const tracks = res.json.tracks as Json[];
    expect(tracks.map((t) => t.id)).toEqual(['quran', 'ai', 'fsd', 'animation']);
    expect(tracks.every((t) => t.archived === false)).toBe(true);
    // data carries the full catalog as CatalogRepo.load returns it.
    expect((res.json.data as Json).tracks).toEqual(res.json.tracks);
    expect(Array.isArray((res.json.data as Json).modules)).toBe(true);
  });

  it('GET /api/catalog on an empty plan reports hasPlan false', async () => {
    ctx = makeTestApp('2026-10-04', { plan: 'empty' });
    const res = await call('GET', '/api/catalog');
    expect(res.json.hasPlan).toBe(false);
    expect(res.json.planName).toBeNull();
    expect(res.json.importedAt).toBeNull();
    expect((res.json.tracks as Json[]).map((t) => t.id)).toEqual(['quran']);
  });

  it('GET /api/plan-pack round-trips through preview with no changes', async () => {
    ctx = makeTestApp('2026-10-04');
    const pack = (await call('GET', '/api/plan-pack')).json;
    expect(pack.version).toBe(1);
    expect(pack.name).toBe('Owner plan (migrated)');
    const before = dumpTables(ctx!.db);
    const preview = await call('POST', '/api/import/preview', { pack, mode: 'update' });
    expect(preview.json.ok).toBe(true);
    for (const k of ['tracks', 'streams', 'modules'] as const) {
      const c = preview.json.counts[k] as Json;
      expect(c.added + c.updated + c.revived + c.archived).toBe(0);
    }
    expect(preview.json.regenerates).toBe(false);
    expect(dumpTables(ctx!.db)).toEqual(before);
  });
});

describe('import timezone handling', () => {
  it('a pack without settings.timezone keeps the install zone', async () => {
    ctx = makeTestApp('2026-10-04');
    const put = await call('PUT', '/api/settings', { timezone: 'Asia/Tokyo' });
    expect(put.status).toBe(200);

    const preview = await call('POST', '/api/import/preview', { pack: medicinePack('tz-med'), mode: 'update' });
    expect(preview.json.ok).toBe(true);
    expect(preview.json.settingsChanged).not.toContain('timezone');

    const commit = await call('POST', '/api/import', { pack: medicinePack('tz-med'), mode: 'update' });
    expect(commit.status).toBe(200);
    expect((await call('GET', '/api/settings')).json.timezone).toBe('Asia/Tokyo');
  });

  it('a pack that names a timezone still applies it', async () => {
    ctx = makeTestApp('2026-10-04');
    const pack = medicinePack('tz-mad') as Json;
    (pack.settings as Json).timezone = 'Europe/Madrid';
    const commit = await call('POST', '/api/import', { pack, mode: 'update' });
    expect(commit.status).toBe(200);
    expect((await call('GET', '/api/settings')).json.timezone).toBe('Europe/Madrid');
  });

  it('GET /api/plan-pack omits the timezone and re-importing it keeps the zone', async () => {
    ctx = makeTestApp('2026-10-04');
    expect((await call('PUT', '/api/settings', { timezone: 'Asia/Tokyo' })).status).toBe(200);

    const pack = (await call('GET', '/api/plan-pack')).json;
    expect('timezone' in (pack.settings as Json)).toBe(false);

    const commit = await call('POST', '/api/import', { pack, mode: 'update' });
    expect(commit.status).toBe(200);
    expect((await call('GET', '/api/settings')).json.timezone).toBe('Asia/Tokyo');
  });
});

describe('empty plan with Quran disabled', () => {
  it('empty days are rest days and the streak stays at 0', async () => {
    ctx = makeTestApp('2026-10-04', { plan: 'empty' });
    const put = await call('PUT', '/api/settings', { quran: { enabled: false } });
    expect(put.status).toBe(200);

    for (let i = 0; i < 4; i++) {
      const date = addDays('2026-10-04', i);
      ctx!.clock.setCairoMorning(date);
      const res = await call('GET', '/api/dashboard');
      expect(res.status).toBe(200);
      expect(res.json.streak.current).toBe(0);
      expect(res.json.tasks).toEqual([]);
      const day = (res.json.weekSummary as Json[]).find((d) => d.date === date);
      expect(day?.isRestDay).toBe(true);
    }
  });
});
