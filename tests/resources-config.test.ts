import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backupDirFor, resolveDbPath } from '../src/server/config.js';
import { CURRICULUM, UNSCHEDULED_RESOURCES } from '../src/shared/curriculum.js';
import { makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('resolveDbPath (LEARNING_DB_PATH)', () => {
  const cwd = resolve('/tmp/tracker');

  it('defaults to data/learning.db under cwd', () => {
    expect(resolveDbPath({}, cwd)).toBe(join(cwd, 'data', 'learning.db'));
    expect(resolveDbPath({ LEARNING_DB_PATH: '   ' }, cwd)).toBe(join(cwd, 'data', 'learning.db'));
  });

  it('uses LEARNING_DB_PATH, resolving relative paths against cwd', () => {
    expect(resolveDbPath({ LEARNING_DB_PATH: 'tmp/e2e.db' }, cwd)).toBe(resolve(cwd, 'tmp/e2e.db'));
    const abs = resolve('/var/other/x.db');
    expect(resolveDbPath({ LEARNING_DB_PATH: abs }, cwd)).toBe(abs);
  });

  it('puts backups next to the database', () => {
    const db = resolve('/var/other/x.db');
    expect(backupDirFor(db)).toBe(join(resolve('/var/other'), 'backups'));
  });
});

describe('GET /api/resources', () => {
  let ctx: ReturnType<typeof makeTestApp>;
  beforeAll(() => {
    ctx = makeTestApp('2026-09-27');
  });
  afterAll(() => ctx.cleanup());

  async function get(path: string): Promise<{ status: number; json: Json }> {
    const res = await ctx.app.request(path);
    return { status: res.status, json: (await res.json()) as Json };
  }

  it('groups every curriculum resource by stream with access badges and modules', async () => {
    const { status, json } = await get('/api/resources');
    expect(status).toBe(200);
    expect(json.streams.map((s: Json) => `${s.track}/${s.stream}`)).toEqual(['ai/main', 'fsd/main', 'animation/draw', 'animation/story']);

    // Every resource of every module appears exactly once per stream (dedup by url/name).
    for (const s of json.streams) {
      const expected = new Set(
        CURRICULUM.filter((m) => m.track === s.track && m.stream === s.stream).flatMap((m) => m.resources.map((r) => r.url ?? r.name)),
      );
      expect(s.resources.map((r: Json) => r.url ?? r.name).sort()).toEqual([...expected].sort());
      expect(s.counts.owned + s.counts.free + s.counts.paid).toBe(s.resources.length);
    }

    const draw = json.streams.find((s: Json) => s.stream === 'draw');
    const drawabox = draw.resources.find((r: Json) => r.name === 'Drawabox');
    expect(drawabox.access).toBe('free');
    expect(drawabox.modules.map((m: Json) => m.id)).toEqual(['an-dab1', 'an-box250', 'an-dab23']);

    const ai = json.streams.find((s: Json) => s.track === 'ai');
    const coursera = ai.resources.find((r: Json) => r.name.startsWith('Coursera AI Engineer'));
    expect(coursera.access).toBe('owned');
    expect(coursera.modules[0].estimateUncertain).toBe(true);

    const fsd = json.streams.find((s: Json) => s.track === 'fsd');
    expect(fsd.resources.find((r: Json) => r.name.startsWith('Designing Data-Intensive')).access).toBe('paid');
    expect(fsd.unscheduled.map((r: Json) => r.name)).toEqual(UNSCHEDULED_RESOURCES.map((r) => r.name));
    expect(fsd.unscheduled.every((r: Json) => r.access === 'owned' && r.note)).toBe(true);

    // Animation has no owned resources: everything is a free alternative (paid items are optional books).
    const animation = json.streams.filter((s: Json) => s.track === 'animation');
    expect(animation.every((s: Json) => s.counts.owned === 0)).toBe(true);
  });

  it('exposes a flat module list for resource lookups by module id', async () => {
    const { json } = await get('/api/resources');
    expect(json.modules).toHaveLength(CURRICULUM.length);
    const m = json.modules.find((x: Json) => x.id === 'fsd-js');
    expect(m.resources[0]).toMatchObject({ name: 'javascript.info', url: 'https://javascript.info', access: 'free' });
    expect(json.unscheduled).toHaveLength(UNSCHEDULED_RESOURCES.length);
  });

  it('reflects completed modules', async () => {
    await ctx.app.request('/api/modules/an-dab1/complete', { method: 'POST' });
    const { json } = await get('/api/resources');
    const draw = json.streams.find((s: Json) => s.stream === 'draw');
    const drawabox = draw.resources.find((r: Json) => r.name === 'Drawabox');
    expect(drawabox.modules[0]).toMatchObject({ id: 'an-dab1', completed: true });
    expect(drawabox.modules[1]).toMatchObject({ id: 'an-box250', completed: false });
  });
});
