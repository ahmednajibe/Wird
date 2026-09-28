/**
 * Plan catalog persistence: DB round-trip of the owner catalog and the
 * fresh-install state (only the built-in Quran track, empty template).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/server/db.js';
import { CatalogRepo } from '../src/server/repoCatalog.js';
import { OWNER_CATALOG_DATA } from '../src/server/seed/ownerCatalog.js';
import { seedOwnerPlan } from '../src/server/seed/seed.js';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let ctx: ReturnType<typeof makeTestApp> | null = null;
let db: Db | null = null;
let dir: string | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
  if (db?.isOpen) db.close();
  db = null;
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await ctx!.app.request(path, init);
  return { status: res.status, json: (await res.json()) as Json };
}

describe('catalog repo', () => {
  it('load() reconstructs CatalogData deep-equal to the seeded owner data', () => {
    dir = mkdtempSync(join(tmpdir(), 'learning-catalog-'));
    db = openDb(join(dir, 'test.db'));
    // Fresh DB: migrations seeded only the built-in Quran track.
    expect(new CatalogRepo(db).load().tracks.map((t) => t.id)).toEqual(['quran']);
    seedOwnerPlan(db);
    expect(new CatalogRepo(db).load()).toEqual(OWNER_CATALOG_DATA);
  });
});

describe('fresh install (empty plan)', () => {
  it('has only the Quran track, an empty template, quran-only days and stable stats', async () => {
    ctx = makeTestApp('2026-09-28', { plan: 'empty' });

    expect(ctx.service.catalog.data.tracks.map((t) => t.id)).toEqual(['quran']);
    expect(ctx.service.catalog.studyStreams()).toEqual([]);
    expect(ctx.service.settings().weeklyTemplate).toEqual([[], [], [], [], [], [], []]);

    const dash = await call('GET', '/api/dashboard');
    expect(dash.status).toBe(200);
    const tasks = dash.json.tasks as Json[];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.track === 'quran')).toBe(true);

    const tracks = await call('GET', '/api/tracks');
    expect(tracks.status).toBe(200);
    expect(tracks.json.streams).toEqual([]);

    const stats = await call('GET', '/api/stats');
    expect(stats.status).toBe(200);

    const week = await call('GET', '/api/week?start=2026-09-27');
    expect(week.status).toBe(200);
  });
});
