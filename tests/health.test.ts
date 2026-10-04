/**
 * GET /api/health: app id, the configured version, and the data dir (dirname
 * of the database path, null for injected/in-memory databases).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { openDb } from '../src/server/db.js';
import { DEFAULT_TIMEZONE } from '../src/shared/dates.js';
import { TestClock, makeTestApp } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('GET /api/health', () => {
  it('reports the app id, version and data dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'health-test-'));
    const dbPath = join(dir, 'test.db');
    const { app, db } = createApp({ dbPath, clock: new TestClock(new Date('2026-09-27T04:00:00Z')), version: '9.9.9-test', webDir: join(dir, 'no-web'), initialTimezone: DEFAULT_TIMEZONE });
    cleanup = () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    };
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const j = (await res.json()) as Json;
    expect(j).toMatchObject({ ok: true, app: 'wird', version: '9.9.9-test', dataDir: dir });
    expect(typeof j.today).toBe('string');
  });

  it('reports null dataDir for an injected in-memory database', async () => {
    const db = openDb(':memory:');
    const { app } = createApp({ db, clock: new TestClock(new Date('2026-09-27T04:00:00Z')), version: '1.2.3' });
    cleanup = () => db.close();
    const j = (await (await app.request('/api/health')).json()) as Json;
    expect(j.dataDir).toBeNull();
    expect(j.version).toBe('1.2.3');
  });

  it('still serves PLAN_PROMPT.md from the default root', async () => {
    const ctx = makeTestApp('2026-09-27');
    cleanup = () => ctx.cleanup();
    const res = await ctx.app.request('/api/plan-prompt');
    expect(res.status).toBe(200);
    const j = (await res.json()) as Json;
    expect(typeof j.markdown).toBe('string');
    expect((j.markdown as string).length).toBeGreaterThan(100);
  });
});
