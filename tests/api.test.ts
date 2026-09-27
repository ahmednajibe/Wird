import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ctx: ReturnType<typeof makeTestApp>;

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await ctx.app.request(path, init);
  return { status: res.status, json: (await res.json()) as Json };
}

beforeAll(() => {
  ctx = makeTestApp('2026-09-27'); // Sunday, not fasting (16 Rabi al-Thani)
});
afterAll(() => ctx.cleanup());

describe('API smoke test', () => {
  it('dashboard generates the week with Quran first', async () => {
    const { status, json } = await call('GET', '/api/dashboard?date=2026-09-27');
    expect(status).toBe(200);
    expect(json.date).toBe('2026-09-27');
    expect(json.hijri.label).toMatch(/Rabi/);
    expect(json.fasting.isFasting).toBe(false);
    expect(json.capacity.total).toBe(120);
    expect(json.tasks[0].track).toBe('quran');
    expect(json.tasks[0].title).toBe('Memorize page 604');
    expect(json.tasks.reduce((a: number, t: Json) => a + t.plannedMinutes, 0)).toBe(120);
    expect(json.bufferMinutes).toBe(0); // memorize day: Quran uses the whole 40 min reservation
    expect(json.trackingStartDate).toBe('2026-09-27');
    expect(json.baseline.value).toBe(42);
    expect(json.baseline.explanation.avgDailyPlannedPoints).toBeCloseTo(151.29, 2);
    expect(json.weekSummary).toHaveLength(7);
    expect(json.streak).toEqual({ current: 0, longest: 0, todayCounts: false });
    const week = await call('GET', '/api/week?start=2026-09-27');
    expect(week.status).toBe(200);
    expect(week.json.days).toHaveLength(7);
    expect(week.json.totals.capacity).toBe(week.json.totals.plannedMinutes + week.json.totals.bufferMinutes);
    expect(week.json.totals.bufferMinutes).toBeGreaterThan(0);
    console.log('Sample dashboard (trimmed):', JSON.stringify({ ...json, tasks: json.tasks.map((t: Json) => ({ id: t.id, track: t.track, stream: t.stream, type: t.type, title: t.title, plannedMinutes: t.plannedMinutes, plannedPoints: t.plannedPoints, status: t.status })), baseline: { value: json.baseline.value, normal: json.baseline.normal, fasting: json.baseline.fasting, text: json.baseline.explanation.text } }, null, 1));
  });

  it('completing the Quran task updates points and streak', async () => {
    const dash = await call('GET', '/api/dashboard?date=2026-09-27');
    const quran = dash.json.tasks[0];
    const done = await call('POST', `/api/tasks/${quran.id}/complete`, {});
    expect(done.status).toBe(200);
    expect(done.json.status).toBe('completed');
    expect(done.json.earnedPoints).toBe(75);
    const after = await call('GET', '/api/dashboard?date=2026-09-27');
    expect(after.json.pointsToday).toBe(75);
    expect(after.json.streak.todayCounts).toBe(true);
    expect(after.json.streak.current).toBe(1);
    expect(after.json.level.totalPoints).toBe(75);
    expect(after.json.quranSummary.memorized).toBe(1);
    expect(after.json.quranSummary.nextSessionType).toBe('review');
  });

  it('score preview and manual task', async () => {
    const input = { track: 'ai', title: 'Bonus: watched a lecture during a slow hour', minutes: 30, type: 'learn' };
    const preview = await call('POST', '/api/tasks/score-preview', input);
    expect(preview.status).toBe(200);
    expect(preview.json.points).toBe(36);
    const off = await call('POST', '/api/tasks/score-preview', { ...input, offCurriculum: true });
    expect(off.json.points).toBe(31); // 30 * 1.2 * 0.85 = 30.6
    const created = await call('POST', '/api/tasks', input);
    expect(created.status).toBe(201);
    expect(created.json.source).toBe('manual');
    expect(created.json.moduleId).toBe('ai-py');
    expect(created.json.earnedPoints).toBe(36);
    const dash = await call('GET', '/api/dashboard?date=2026-09-27');
    expect(dash.json.pointsToday).toBe(111);
    const del = await call('DELETE', `/api/tasks/${created.json.id}`);
    expect(del.status).toBe(200);
    const genId = dash.json.tasks.find((t: Json) => t.source === 'generated' && t.track !== 'quran').id;
    expect((await call('DELETE', `/api/tasks/${genId}`)).status).toBe(400);
  });

  it('rejects bad input with 400 and messages', async () => {
    const bad = await call('POST', '/api/tasks', { track: 'ai', title: '', minutes: -1, type: 'memorize' });
    expect(bad.status).toBe(400);
    expect(Array.isArray(bad.json.details)).toBe(true);
    expect((await call('GET', '/api/dashboard?date=2026-13-01')).status).toBe(400);
    expect((await call('GET', '/api/week?start=2026-09-28')).status).toBe(400);
    expect((await call('PUT', '/api/settings', { capacityByDow: [1, 2] })).status).toBe(400);
    expect((await call('GET', '/api/nope')).status).toBe(404);
  });

  it('regenerate keeps completed tasks', async () => {
    const res = await call('POST', '/api/plan/regenerate', {});
    expect(res.status).toBe(200);
    expect(res.json.from).toBe('2026-09-27');
    const dash = await call('GET', '/api/dashboard?date=2026-09-27');
    const quran = dash.json.tasks.filter((t: Json) => t.track === 'quran');
    expect(quran).toHaveLength(1);
    expect(quran[0].status).toBe('completed');
    expect(dash.json.pointsToday).toBe(75);
  });

  it('day override and settings trigger re-planning', async () => {
    const day = await call('PUT', '/api/days/2026-09-29', { fasting: null, capacityOverride: 0, note: 'travel' });
    expect(day.status).toBe(200);
    expect(day.json.capacity.isRestDay).toBe(true);
    expect(day.json.tasks).toHaveLength(0);
    const settings = await call('PUT', '/api/settings', { capacityByDow: [120, 120, 120, 120, 120, 180, 150] });
    expect(settings.status).toBe(200);
    expect(settings.json.regenerated).toBe(true);
    const sat = await call('GET', '/api/days/2026-10-03');
    expect(sat.json.plannedMinutes + sat.json.bufferMinutes).toBe(150);
    expect(sat.json.tasks.filter((t: Json) => t.track !== 'quran').reduce((a: number, t: Json) => a + t.plannedMinutes, 0)).toBe(150 - 40);
    await call('PUT', '/api/settings', { capacityByDow: [120, 120, 120, 120, 120, 180, 180] });
  });

  it('tracks, quran, stats and calendar endpoints respond', async () => {
    const tracks = await call('GET', '/api/tracks');
    expect(tracks.status).toBe(200);
    expect(tracks.json.streams).toHaveLength(4);
    const ai = tracks.json.streams.find((s: Json) => s.track === 'ai');
    expect(ai.currentModuleId).toBe('ai-py');
    expect(ai.projection.weeklyPlannedMinutes).toBe(207);
    expect(tracks.json.normalWeek).toEqual({ capacity: 864, quranReserveMinutes: 280, quranPlannedMinutes: 205, bufferMinutes: 75, studyMinutes: 584 });
    const quran = await call('GET', '/api/quran');
    expect(quran.json.pages).toHaveLength(604);
    expect(quran.json.memorized).toBe(1);
    expect(quran.json.surahs).toHaveLength(114);
    expect(quran.json.attribution).toBe('Quran metadata: Tanzil.net (CC BY 3.0)');
    expect(quran.json.pages[582].label).toBe("An-Naba 31-40, An-Nazi'at 1-15");
    expect(quran.json.pages[603].segments).toHaveLength(3);
    const stats = await call('GET', '/api/stats');
    expect(stats.json.daily).toHaveLength(365);
    expect(stats.json.daily[364].points).toBe(75);
    expect(stats.json.trackingStartDate).toBe('2026-09-27');
    expect(stats.json.daily[363].beforeStart).toBe(true);
    expect(stats.json.daily[364].beforeStart).toBe(false);
    const cal = await call('GET', '/api/calendar?from=2026-09-25&to=2026-09-26');
    expect(cal.json.days[0].fasting.codes).toContain('white-day');
    const mod = await call('POST', '/api/modules/ai-py/complete');
    expect(mod.status).toBe(200);
    expect(mod.json.streams.find((s: Json) => s.track === 'ai').currentModuleId).toBe('ai-linalg');
    const reset = await call('POST', '/api/modules/ai-py/reset');
    expect(reset.json.streams.find((s: Json) => s.track === 'ai').currentModuleId).toBe('ai-py');
    expect((await call('POST', '/api/modules/nope/complete')).status).toBe(404);
  });
});
