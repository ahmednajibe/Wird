import { afterEach, describe, expect, it } from 'vitest';
import type { Task } from '../src/shared/types.js';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Row = Record<string, unknown>;

let ctx: ReturnType<typeof makeTestApp> | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

function c(): NonNullable<typeof ctx> {
  return ctx as NonNullable<typeof ctx>;
}

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await c().app.request(path, init);
  return { status: res.status, json: (await res.json()) as Json };
}

function rows(): Row[] {
  return c().db.prepare('SELECT * FROM tasks ORDER BY id').all() as Row[];
}

const notStream = (track: string, stream: string) => (r: Row | Task) => !(r.track === track && r.stream === stream);

/** Planned minutes per date and slot over all generated tasks (any status). */
function slotMinutes(list: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of list) {
    if (r.source !== 'generated') continue;
    const k = `${r.date as string}|${r.slot_key as string}`;
    out[k] = (out[k] ?? 0) + (r.planned_minutes as number);
  }
  return out;
}

function streamTasks(track: string, stream: string, from = '0000-00-00'): Task[] {
  return c()
    .service.tasks.byDateRange(from, '2026-10-03')
    .filter((t) => t.source === 'generated' && t.track === track && t.stream === stream);
}

describe('per-track session queues: roll-forward isolation', () => {
  it('a missed AI session moves to the next AI slot; nothing else changes', async () => {
    ctx = makeTestApp('2026-09-27'); // Sunday
    const { service, clock } = ctx;
    expect((await call('GET', '/api/dashboard')).status).toBe(200);
    const sun = service.tasks.byDate('2026-09-27');
    // Core habits done, the AI session is missed.
    service.complete(sun.find((t) => t.track === 'quran')?.id ?? 0);
    service.complete(sun.find((t) => t.slotKey === 'animation/draw/warmup')?.id ?? 0);
    const missed = sun.find((t) => t.track === 'ai') as Task;
    expect(missed.sessionNo).toBe(1);
    expect(missed.title).toBe('Deep study: Python for Data Science, AI & Development (session 1)');
    const before = rows();
    const aiBefore = streamTasks('ai', 'main');
    expect(aiBefore.map((t) => [t.date, t.sessionNo])).toEqual([
      ['2026-09-27', 1],
      ['2026-09-30', 2],
      ['2026-10-01', 3],
      ['2026-10-02', 4],
    ]);

    clock.setCairoMorning('2026-09-28');
    const dash = await call('GET', '/api/dashboard');
    expect(dash.status).toBe(200);
    const after = rows();

    // The missed session is rolled (not missed, no points, no Complete).
    const rolled = service.tasks.get(missed.id) as Task;
    expect(rolled.status).toBe('rolled');
    expect(service.taskView(rolled).status).toBe('rolled');
    expect(service.taskView(rolled).plannedPoints).toBe(0);

    // The AI stream's next day with a slot starts with the missed session.
    const aiAfter = streamTasks('ai', 'main');
    const head = aiAfter.find((t) => t.status === 'pending') as Task;
    expect(head.date).toBe('2026-09-30');
    expect(head.sessionNo).toBe(missed.sessionNo);
    expect(head.moduleId).toBe(missed.moduleId);
    expect(head.title).toBe(missed.title);
    expect(head.description).toBe(missed.description);
    expect(aiAfter.filter((t) => t.status === 'pending').map((t) => t.sessionNo)).toEqual([1, 2, 3]);
    // Every AI task keeps its id, date, slot and minutes.
    expect(aiAfter.map((t) => [t.id, t.date, t.slotKey, t.plannedMinutes])).toEqual(aiBefore.map((t) => [t.id, t.date, t.slotKey, t.plannedMinutes]));

    // Every fsd, animation and Quran row is identical (all fields).
    expect(after.filter(notStream('ai', 'main'))).toEqual(before.filter(notStream('ai', 'main')));
    // Per-day per-slot minutes are identical.
    expect(slotMinutes(after)).toEqual(slotMinutes(before));
    // The rolled task is shown as moved forward on its day, not as missed.
    const week = await call('GET', '/api/week?start=2026-09-27');
    const sunday = week.json.days[0];
    const view = sunday.tasks.find((t: Json) => t.id === missed.id);
    expect(view.status).toBe('rolled');
    expect(sunday.tasks.some((t: Json) => t.status === 'missed')).toBe(false);
    console.log('AI queue after roll-forward:', JSON.stringify(aiAfter.map((t) => ({ date: t.date, status: t.status, sessionNo: t.sessionNo, minutes: t.plannedMinutes, module: t.moduleId }))));
  });

  it("the owner's example: 3 sessions a day, 2 done, the 3rd rolls; numbering continues", async () => {
    ctx = makeTestApp('2026-09-27');
    const { service, clock } = ctx;
    // One stream only, 3 x 30 min AI sessions a day (130 - R 40 = 90), no fasting.
    service.updateSettings({
      capacityByDow: [130, 130, 130, 130, 130, 130, 130],
      fastingRules: { monday: false, thursday: false, whiteDays: false, ramadan: false, dhulHijjahFirstNine: false },
      weeklyTemplate: Array.from({ length: 7 }, () => [{ track: 'ai', stream: 'main', role: 'focus', kind: 'rest' }]),
      planner: { maxTaskMinutes: 30 },
    });
    await call('GET', '/api/dashboard');
    const byDay = (d: string) => streamTasks('ai', 'main').filter((t) => t.date === d);
    expect(byDay('2026-09-27').map((t) => [t.sessionNo, t.plannedMinutes])).toEqual([
      [1, 30],
      [2, 30],
      [3, 30],
    ]);
    const [s1, s2, s3] = byDay('2026-09-27') as [Task, Task, Task];
    service.complete(s1.id);
    service.complete(s2.id);
    const s3Title = service.tasks.get(s3.id)?.title;
    const monBefore = byDay('2026-09-28');

    clock.setCairoMorning('2026-09-28');
    await call('GET', '/api/dashboard');
    expect(service.tasks.get(s3.id)?.status).toBe('rolled');
    const mon = byDay('2026-09-28');
    expect(mon.map((t) => [t.sessionNo, t.plannedMinutes])).toEqual([
      [3, 30],
      [4, 30],
      [5, 30],
    ]);
    expect(mon[0]?.title).toBe(s3Title);
    expect(mon.map((t) => t.id)).toEqual(monBefore.map((t) => t.id));
    expect(byDay('2026-09-29').map((t) => t.sessionNo)).toEqual([6, 7, 8]);
    expect(byDay('2026-09-29').map((t) => t.plannedMinutes)).toEqual([30, 30, 30]);
  });

  it('Skip moves the session within its own stream only', async () => {
    ctx = makeTestApp('2026-09-27');
    const { service } = ctx;
    await call('GET', '/api/dashboard');
    const ai = service.tasks.byDate('2026-09-27').find((t) => t.track === 'ai') as Task;
    const before = rows();
    const skipped = await call('POST', `/api/tasks/${ai.id}/skip`);
    expect(skipped.status).toBe(200);
    expect(skipped.json.status).toBe('rolled');
    expect(skipped.json.plannedPoints).toBe(0);
    const after = rows();
    expect(after.filter(notStream('ai', 'main'))).toEqual(before.filter(notStream('ai', 'main')));
    expect(slotMinutes(after)).toEqual(slotMinutes(before));
    const next = streamTasks('ai', 'main').find((t) => t.status === 'pending') as Task;
    expect(next.date).toBe('2026-09-30');
    expect([next.sessionNo, next.moduleId, next.title]).toEqual([ai.sessionNo, ai.moduleId, ai.title]);
    // No points for a rolled task; it cannot be completed late or undone.
    const day = await call('GET', '/api/days/2026-09-27');
    const sundayCount = before.filter((r) => r.date === '2026-09-27' && r.source === 'generated').length;
    expect(day.json.tasks).toHaveLength(sundayCount);
    expect(day.json.plannedMinutes).toBe(120 - ai.plannedMinutes);
    expect((await call('POST', `/api/tasks/${ai.id}/complete`, {})).status).toBe(400);
    expect((await call('POST', `/api/tasks/${ai.id}/uncomplete`)).status).toBe(400);
    expect((await call('POST', `/api/tasks/${ai.id}/skip`)).status).toBe(409);
    // A regenerate keeps the rolled slot occupied (caps unchanged).
    service.regenerate('2026-09-27');
    expect(service.tasks.byDate('2026-09-27').filter((t) => t.track === 'ai').map((t) => t.status)).toEqual(['rolled']);
    // Completed tasks are never rolled.
    const warm = service.tasks.byDate('2026-09-27').find((t) => t.slotKey === 'animation/draw/warmup') as Task;
    service.complete(warm.id);
    c().clock.setCairoMorning('2026-09-28');
    await call('GET', '/api/dashboard');
    expect(service.tasks.get(warm.id)?.status).toBe('completed');
  });

  it('a Quran session type change never changes study tasks; buffer = R - Quran minutes', async () => {
    ctx = makeTestApp('2026-09-27');
    const { service } = ctx;
    await call('GET', '/api/dashboard');
    const monBefore = service.dayView('2026-09-28');
    const monQuran = monBefore.tasks.find((t) => t.track === 'quran');
    expect(monQuran?.type).toBe('quran-review');
    expect(monQuran?.plannedMinutes).toBe(10);
    expect(monBefore.bufferMinutes).toBe(40 - 10);
    const studyBefore = rows().filter((r) => r.track !== 'quran');

    // Skipping Sunday's Quran keeps the alternation on memorize: Monday flips to a 40 min memorize.
    const sunQuran = service.tasks.byDate('2026-09-27').find((t) => t.track === 'quran') as Task;
    const res = await call('POST', `/api/tasks/${sunQuran.id}/skip`);
    expect(res.json.status).toBe('skipped'); // Quran skip behavior is unchanged
    const monAfter = service.dayView('2026-09-28');
    const q = monAfter.tasks.find((t) => t.track === 'quran');
    expect(q?.id).toBe(monQuran?.id);
    expect(q?.type).toBe('quran-memorize');
    expect(q?.plannedMinutes).toBe(40);
    expect(monAfter.bufferMinutes).toBe(0);
    expect(rows().filter((r) => r.track !== 'quran')).toEqual(studyBefore);
    for (const d of ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']) {
      const v = service.dayView(d);
      const quran = v.tasks.find((t) => t.track === 'quran')?.plannedMinutes ?? 0;
      expect(v.bufferMinutes, d).toBe(40 - quran);
      expect(v.tasks.filter((t) => t.track !== 'quran').reduce((a, t) => a + t.plannedMinutes, 0) + 40, d).toBe(v.capacity.total);
    }
  });
});

