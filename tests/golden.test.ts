/**
 * Golden behavior contract: snapshot every read model before and after a
 * deterministic usage scenario. These files pin the current output; the
 * catalog refactor must leave them byte-identical (never regenerate).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { TRACKING_START_KEY } from '../src/server/service.js';
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

const snap = async (name: string, res: { status: number; json: Json }) =>
  expect(JSON.stringify(res.json, null, 2)).toMatchFileSnapshot(`./__snapshots__/golden/${name}.json`);

const WEEK_STARTS = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'];
const DAYS = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];

/** Snapshots every GET read model. `today` is the dashboard's pinned date. */
async function snapshotAll(tag: string, today: string) {
  await snap(`${tag}-dashboard`, await call('GET', `/api/dashboard?date=${today}`));
  for (const start of WEEK_STARTS) {
    await snap(`${tag}-week-${start}`, await call('GET', `/api/week?start=${start}`));
  }
  for (const d of DAYS) {
    await snap(`${tag}-day-${d}`, await call('GET', `/api/days/${d}`));
  }
  await snap(`${tag}-tracks`, await call('GET', '/api/tracks'));
  await snap(`${tag}-resources`, await call('GET', '/api/resources'));
  const quranRes = await call('GET', '/api/quran');
  const quranJson: Json = { ...quranRes.json, settings: { ...(quranRes.json.settings as Json) } };
  delete (quranJson.settings as Json).enabled;
  await snap(`${tag}-quran`, { status: quranRes.status, json: quranJson });
  await snap(`${tag}-stats`, await call('GET', '/api/stats'));
  const settingsRes = await call('GET', '/api/settings');
  // settings.timezone and settings.quran.enabled were added after these
  // snapshots were pinned; strip them rather than regenerating the files.
  const settingsJson: Json = { ...settingsRes.json, quran: { ...(settingsRes.json.quran as Json) } };
  delete settingsJson.timezone;
  delete (settingsJson.quran as Json).enabled;
  await snap(`${tag}-settings`, { status: settingsRes.status, json: settingsJson });
  await snap(`${tag}-calendar`, await call('GET', '/api/calendar?from=2026-10-04&to=2026-10-17'));
  await snap(`${tag}-health`, await call('GET', '/api/health'));
}

describe('golden read-model snapshots', () => {
  it('fresh week, then a scenario: complete, skip, missed day, manual tasks, module complete', async () => {
    ctx = makeTestApp('2026-10-04'); // Sunday
    c().service.meta.set(TRACKING_START_KEY, '2026-10-04');
    await snapshotAll('a', '2026-10-04');

    // Sunday: complete the Quran task and the first study task, skip the AI session.
    const sun = await call('GET', '/api/dashboard?date=2026-10-04');
    const sunTasks = sun.json.tasks as Json[];
    const quranTask = sunTasks.find((t) => t.track === 'quran') as Json;
    const studyTasks = sunTasks.filter((t) => t.track !== 'quran');
    expect((await call('POST', `/api/tasks/${quranTask.id}/complete`, { actualMinutes: 38 })).status).toBe(200);
    expect((await call('POST', `/api/tasks/${studyTasks[0]?.id}/complete`, {})).status).toBe(200);
    expect((await call('POST', `/api/tasks/${studyTasks[1]?.id}/skip`)).status).toBe(200);

    // Monday: everything is left pending; advancing past it rolls it forward.
    c().clock.setCairoMorning('2026-10-05');
    expect((await call('GET', '/api/dashboard')).status).toBe(200);
    c().clock.setCairoMorning('2026-10-07');
    expect((await call('GET', '/api/dashboard')).status).toBe(200);

    // Manual tasks: a study one on 'animation' (service defaults its stream), a Quran review.
    const manual = c().service.createManual({
      track: 'animation',
      title: 'Timed gesture practice at the cafe',
      minutes: 30,
      type: 'practice',
    });
    expect(manual.stream).toBe('draw');
    const qreview = await call('POST', '/api/tasks', { track: 'quran', title: 'Evening review', minutes: 20, type: 'review' });
    expect(qreview.status).toBe(201);

    // Mark a module complete manually.
    expect((await call('POST', '/api/modules/fsd-http/complete')).status).toBe(200);

    await snapshotAll('b', '2026-10-07');
  });
});
