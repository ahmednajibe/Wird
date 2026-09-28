/**
 * Settings validation: template slots are cross-referenced against the
 * catalog in the service, and the timezone setting is validated with Intl.
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

const templateWith = (slot: Json) => Array.from({ length: 7 }, () => [slot]);

describe('weekly template cross-reference', () => {
  it('rejects a slot whose track is not in the catalog', async () => {
    ctx = makeTestApp('2026-09-28');
    const res = await call('PUT', '/api/settings', {
      weeklyTemplate: templateWith({ track: 'medicine', stream: 'lab', role: 'focus', kind: 'rest' }),
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Invalid settings');
    expect((res.json.details as Json[]).map((d) => d.message)).toContain(
      "weeklyTemplate[0][0] references stream 'lab' which is not defined in track 'medicine'",
    );
  });

  it('rejects a stream that the track does not have', async () => {
    ctx = makeTestApp('2026-09-28');
    const res = await call('PUT', '/api/settings', {
      weeklyTemplate: templateWith({ track: 'ai', stream: 'lab', role: 'focus', kind: 'rest' }),
    });
    expect(res.status).toBe(400);
    expect((res.json.details as Json[]).map((d) => d.message)).toContain(
      "weeklyTemplate[0][0] references stream 'lab' which is not defined in track 'ai'",
    );
  });

  it('rejects a slot on the Quran track', async () => {
    ctx = makeTestApp('2026-09-28');
    const res = await call('PUT', '/api/settings', {
      weeklyTemplate: templateWith({ track: 'quran', stream: 'main', role: 'focus', kind: 'rest' }),
    });
    expect(res.status).toBe(400);
  });

  it('still accepts a valid template', async () => {
    ctx = makeTestApp('2026-09-28');
    const res = await call('PUT', '/api/settings', {
      weeklyTemplate: templateWith({ track: 'animation', stream: 'story', role: 'focus', kind: 'rest' }),
    });
    expect(res.status).toBe(200);
    expect(res.json.regenerated).toBe(true);
  });
});

describe('timezone', () => {
  it('Asia/Tokyo moves today across the Cairo boundary', async () => {
    ctx = makeTestApp('2026-09-28');
    // 2026-09-28T16:00Z = 19:00 in Cairo (still the 28th), 01:00 the 29th in Tokyo.
    c().clock.advanceMinutes(12 * 60);
    expect(c().service.today()).toBe('2026-09-28');
    const res = await call('PUT', '/api/settings', { timezone: 'Asia/Tokyo' });
    expect(res.status).toBe(200);
    expect(res.json.settings.timezone).toBe('Asia/Tokyo');
    expect(c().service.today()).toBe('2026-09-29');
  });

  it('rejects an unknown timezone', async () => {
    ctx = makeTestApp('2026-09-28');
    const res = await call('PUT', '/api/settings', { timezone: 'Not/AZone' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json.details)).toContain("unknown timezone 'Not/AZone'");
  });
});
