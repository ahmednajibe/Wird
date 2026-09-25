import { afterEach, describe, expect, it } from 'vitest';
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
  const res = await (ctx as NonNullable<typeof ctx>).app.request(path, init);
  return { status: res.status, json: (await res.json()) as Json };
}

const PAST = ['2026-09-27', '2026-09-28', '2026-09-29']; // Sun, Mon (fasting), Tue
const TODAY = '2026-09-30'; // Wed
const bonus = { track: 'ai', title: 'Bonus study', minutes: 60, type: 'learn' }; // 72 points

async function pastBaselines(): Promise<number[]> {
  const week = await call('GET', '/api/week?start=2026-09-27');
  return week.json.days.slice(0, 3).map((d: Json) => d.baseline);
}

function storedSnapshots(): { date: string; baseline: number; is_rest_day: number; is_fasting: number }[] {
  return (ctx as NonNullable<typeof ctx>).db
    .prepare('SELECT date, baseline, is_rest_day, is_fasting FROM daily_summary WHERE date < ? ORDER BY date')
    .all(TODAY) as never;
}

describe('streak integrity: past baselines are frozen', () => {
  it('(a) raising capacities to 300/day keeps a 3-day streak and past baselines', async () => {
    ctx = makeTestApp(PAST[0] as string);
    for (const d of PAST) {
      ctx.clock.setCairoMorning(d);
      const dash = await call('GET', `/api/dashboard?date=${d}`);
      expect(dash.status).toBe(200);
      expect((await call('POST', '/api/tasks', bonus)).status).toBe(201);
    }
    ctx.clock.setCairoMorning(TODAY);
    const before = await call('GET', '/api/dashboard');
    expect(before.json.streak).toEqual({ current: 3, longest: 3, todayCounts: false });
    expect(await pastBaselines()).toEqual([46, 28, 46]);
    const snapsBefore = storedSnapshots();
    expect(snapsBefore.map((r) => r.baseline)).toEqual([46, 28, 46]);

    const put = await call('PUT', '/api/settings', { capacityByDow: [300, 300, 300, 300, 300, 300, 300] });
    expect(put.status).toBe(200);
    const after = await call('GET', '/api/dashboard');
    // The new baseline would break every past day (72 points each) if recomputed.
    expect(after.json.baseline.value).toBeGreaterThan(72);
    expect(after.json.streak.current).toBe(3);
    expect(after.json.streak.longest).toBe(3);
    expect(await pastBaselines()).toEqual([46, 28, 46]);
    expect(storedSnapshots()).toEqual(snapsBefore);
    const stats = await call('GET', '/api/stats');
    expect(stats.json.streak.current).toBe(3);

    // Editing a past day's override does not change its frozen snapshot either.
    const day = await call('PUT', '/api/days/2026-09-28', { fasting: false, capacityOverride: 0, note: 'edited later' });
    expect(day.status).toBe(200);
    expect(day.json.baseline).toBe(28);
    expect(day.json.baselineSnapshot).toEqual({ baseline: 28, isRestDay: false, isFasting: true, frozen: true });
    expect((await call('GET', '/api/dashboard')).json.streak.current).toBe(3);
    expect(storedSnapshots()).toEqual(snapsBefore);

    // Earned points of past days stay computed from tasks completed on that date.
    const tue = await call('GET', '/api/days/2026-09-29');
    expect(tue.json.earnedPoints).toBe(72);
    const manual = tue.json.tasks.find((t: Json) => t.source === 'manual');
    expect((await call('POST', `/api/tasks/${manual.id}/uncomplete`)).status).toBe(200);
    expect((await call('GET', '/api/dashboard')).json.streak.current).toBe(0);
  });

  it('(b) a changed baseline factor keeps the streak, even if past days were never evaluated', async () => {
    ctx = makeTestApp(PAST[0] as string);
    for (const d of PAST) {
      ctx.clock.setCairoMorning(d);
      expect((await call('POST', '/api/tasks', bonus)).status).toBe(201); // no dashboard/week evaluation
    }
    ctx.clock.setCairoMorning(TODAY);
    expect(storedSnapshots()).toEqual([]);

    const put = await call('PUT', '/api/settings', { baseline: { factor: 0.9 } });
    expect(put.status).toBe(200);
    // Past days were frozen under the settings in effect for them (factor 0.28).
    expect(storedSnapshots().map((r) => r.baseline)).toEqual([46, 28, 46]);
    const dash = await call('GET', '/api/dashboard');
    expect(dash.json.baseline.value).toBe(148); // round(0.9 x 164.14), today uses current settings
    expect(dash.json.baseline.explanation.factor).toBe(0.9);
    expect(dash.json.streak.current).toBe(3);
    expect(await pastBaselines()).toEqual([46, 28, 46]);
    const week = await call('GET', '/api/week?start=2026-09-27');
    expect(week.json.days.slice(0, 3).map((d: Json) => d.counts)).toEqual([true, true, true]);
    expect(week.json.days[3].baseline).toBe(148);

    // Changing it back and forth never touches the past.
    await call('PUT', '/api/settings', { baseline: { factor: 0.1 } });
    expect(await pastBaselines()).toEqual([46, 28, 46]);
    expect((await call('GET', '/api/dashboard')).json.streak.current).toBe(3);
  });
});
