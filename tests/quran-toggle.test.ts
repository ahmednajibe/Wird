/**
 * settings.quran.enabled: turning Quran off removes the reservation and all
 * generated Quran tasks from today onward while leaving the past untouched;
 * turning it back on restores them.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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

function quranTasks(tasks: Json[]): Json[] {
  return tasks.filter((t) => (t.type as string).startsWith('quran-'));
}

describe('quran.enabled = false', () => {
  it('drops Quran from today onward, keeps history, restores on re-enable', async () => {
    ctx = makeTestApp('2026-09-27'); // Sunday
    await call('GET', '/api/dashboard');

    // Complete today's Quran session so there is history to preserve.
    const sun = await call('GET', '/api/dashboard?date=2026-09-27');
    const quranTask = (sun.json.tasks as Json[]).find((t) => t.track === 'quran') as Json;
    expect(quranTask).toBeTruthy();
    expect((await call('POST', `/api/tasks/${quranTask.id}/complete`, { actualMinutes: 40 })).status).toBe(200);

    // Monday: dashboard evaluation rolls Sunday's missed study tasks forward.
    c().clock.setCairoMorning('2026-09-28');
    await call('GET', '/api/dashboard');

    // Today's daily_summary row is refreshed on every evaluation by design;
    // only past rows are frozen, so compare those.
    const pastTasks = c().db.prepare(`SELECT * FROM tasks WHERE date < '2026-09-28' ORDER BY id`).all();
    const summaries = c().db.prepare(`SELECT * FROM daily_summary WHERE date < '2026-09-28' ORDER BY date`).all();
    const pastDays = c().db.prepare(`SELECT * FROM planned_days WHERE date < '2026-09-28' ORDER BY date`).all();
    expect(pastTasks.length).toBeGreaterThan(0);
    expect(pastDays.some((d) => (d as Json).quran_reserve !== null && (d as Json).quran_reserve > 0)).toBe(true);

    // Turn Quran off.
    const put = await call('PUT', '/api/settings', { quran: { enabled: false } });
    expect(put.status).toBe(200);
    expect(put.json.settings.quran.enabled).toBe(false);

    // Past is untouched: task rows, daily summaries, planned-day reserves.
    expect(c().db.prepare(`SELECT * FROM tasks WHERE date < '2026-09-28' ORDER BY id`).all()).toEqual(pastTasks);
    expect(c().db.prepare(`SELECT * FROM daily_summary WHERE date < '2026-09-28' ORDER BY date`).all()).toEqual(summaries);
    expect(c().db.prepare(`SELECT * FROM planned_days WHERE date < '2026-09-28' ORDER BY date`).all()).toEqual(pastDays);

    // Today and the rest of the week have no Quran tasks at all.
    const week = await call('GET', '/api/week?start=2026-09-27');
    const days = week.json.days as Json[];
    for (const d of days.filter((x) => x.date >= '2026-09-28')) {
      expect(quranTasks(d.tasks as Json[])).toEqual([]);
    }

    // Monday is a fasting day (capacity 72): study slots now get all of it.
    const monday = days.find((d) => d.date === '2026-09-28') as Json;
    const studyMinutes = (monday.tasks as Json[])
      .filter((t) => t.track !== 'quran' && t.status !== 'rolled')
      .reduce((a: number, t) => a + (t.plannedMinutes as number), 0);
    expect(studyMinutes).toBe(monday.capacity.total);
    expect(monday.bufferMinutes).toBe(0);

    // Manual Quran tasks are rejected; the Quran page still shows history.
    const manual = await call('POST', '/api/tasks', { track: 'quran', title: 'x', minutes: 10, type: 'review' });
    expect(manual.status).toBe(400);
    expect(manual.json.error).toBe('Quran is turned off in Settings');
    const quran = await call('GET', '/api/quran');
    expect(quran.status).toBe(200);
    expect(quran.json.memorized).toBe(1);

    // Re-enabling restores generated Quran tasks from today onward.
    const back = await call('PUT', '/api/settings', { quran: { enabled: true } });
    expect(back.status).toBe(200);
    const week2 = await call('GET', '/api/week?start=2026-09-27');
    for (const d of (week2.json.days as Json[]).filter((x) => x.date >= '2026-09-28' && x.capacity.total > 0)) {
      expect(quranTasks(d.tasks as Json[]).length).toBe(1);
    }
  });

  it('empty plan with Quran disabled: no tasks, dashboard and stats stay stable', async () => {
    ctx = makeTestApp('2026-09-28', { plan: 'empty' });
    const put = await call('PUT', '/api/settings', { quran: { enabled: false } });
    expect(put.status).toBe(200);

    const dash = await call('GET', '/api/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.json.tasks).toEqual([]);

    const stats = await call('GET', '/api/stats');
    expect(stats.status).toBe(200);

    const week = await call('GET', '/api/week?start=2026-09-27');
    expect(week.status).toBe(200);
    for (const d of week.json.days as Json[]) expect(d.tasks).toEqual([]);
  });
});
