import { spawn, spawnSync } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dateRange } from '../src/shared/dates.js';
import { openDb } from '../src/server/db.js';
import { MetaRepo } from '../src/server/repoMisc.js';
import { completedTaskCount, resetPlan, tableCounts } from '../src/server/resetPlan.js';
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

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

describe('tracking start date', () => {
  it('is set to the injected today on first planning, and earlier days are "not started"', async () => {
    ctx = makeTestApp('2026-09-30'); // Wednesday
    expect(c().service.meta.get(TRACKING_START_KEY)).toBeNull();
    const dash = await call('GET', '/api/dashboard');
    expect(dash.json.trackingStartDate).toBe('2026-09-30');
    expect(c().service.meta.get(TRACKING_START_KEY)).toBe('2026-09-30');
    const flags = dash.json.weekSummary.map((d: Json) => [d.date, d.beforeStart]);
    expect(flags).toEqual([
      ['2026-09-27', true],
      ['2026-09-28', true],
      ['2026-09-29', true],
      ['2026-09-30', false],
      ['2026-10-01', false],
      ['2026-10-02', false],
      ['2026-10-03', false],
    ]);
    // Manual logging before the start is refused.
    const early = await call('POST', '/api/tasks', { date: '2026-09-29', track: 'ai', title: 'x', minutes: 30, type: 'learn' });
    expect(early.status).toBe(400);
  });

  it('reset clears everything, restarts tracking today, and the next load plans only today..Saturday', async () => {
    ctx = makeTestApp('2026-09-27'); // Sunday
    const { service, clock, db } = ctx;
    await call('GET', '/api/dashboard'); // first server run: plans Sun..Sat
    await call('PUT', '/api/days/2026-10-02', { fasting: null, capacityOverride: 60, note: 'trip' });
    const quran = service.tasks.byDate('2026-09-27').find((t) => t.track === 'quran');
    service.complete(quran?.id ?? 0);
    service.completeModule('fsd-cs50');
    expect(service.meta.get(TRACKING_START_KEY)).toBe('2026-09-27');

    // Days pass with no use; on Wednesday the owner resets.
    clock.setCairoMorning('2026-09-30');
    expect(completedTaskCount(db)).toBe(1);
    const settingsBefore = JSON.stringify(service.settings());
    const result = resetPlan(db, service.today());
    console.log('Reset counts:', JSON.stringify(result));
    expect(result.before.tasks).toBeGreaterThan(0);
    expect(result.before.planned_days).toBe(7);
    expect(result.before.module_state).toBe(1);
    expect(result.before.day_overrides).toBe(1);
    expect(result.after).toEqual({ tasks: 0, planned_days: 0, daily_summary: 0, module_state: 0, day_overrides: 0 });
    expect(tableCounts(db)).toEqual(result.after);
    expect(service.meta.get(TRACKING_START_KEY)).toBe('2026-09-30');
    expect(JSON.stringify(service.settings())).toBe(settingsBefore);

    const dash = await call('GET', '/api/dashboard');
    expect(dash.json.trackingStartDate).toBe('2026-09-30');
    expect(dash.json.tasks.length).toBeGreaterThan(0);
    expect(dash.json.tasks[0].title).toBe('Memorize page 604'); // fresh progress, fresh Quran
    expect(dash.json.tasks.find((t: Json) => t.track === 'ai').sessionNo).toBe(1);
    const week = await call('GET', '/api/week?start=2026-09-27');
    for (const d of week.json.days.slice(0, 3)) {
      expect(d.beforeStart, d.date).toBe(true);
      expect(d.tasks, d.date).toEqual([]);
      expect(d.counts).toBe(false);
      expect(d.bufferMinutes).toBe(0);
    }
    for (const d of week.json.days.slice(3)) {
      expect(d.beforeStart, d.date).toBe(false);
      expect(d.tasks.length, d.date).toBeGreaterThan(0);
    }
    expect(service.tasks.byDateRange('2000-01-01', '2026-09-29')).toEqual([]);
    expect([...service.plannedDays.plannedIn('2000-01-01', '2100-01-01')].sort()).toEqual(dateRange('2026-09-30', '2026-10-03'));
    // No snapshot is persisted for days before the start; the streak ignores them.
    const snaps = db.prepare('SELECT date FROM daily_summary ORDER BY date').all() as { date: string }[];
    expect(snaps.every((r) => r.date >= '2026-09-30')).toBe(true);
    expect(dash.json.streak).toEqual({ current: 0, longest: 0, todayCounts: false });
    const stats = await call('GET', '/api/stats');
    expect(stats.json.trackingStartDate).toBe('2026-09-30');
    const daily = stats.json.daily as Json[];
    expect(daily.filter((d) => d.beforeStart).length).toBe(365 - 1);
    expect(daily.every((d) => !d.beforeStart || (d.points === 0 && !d.counts))).toBe(true);

    // The next day, a regenerate anchors to the new today (no hardcoded date).
    const wedIds = service.tasks.byDate('2026-09-30').map((t) => t.id);
    clock.setCairoMorning('2026-10-01');
    const regen = await call('POST', '/api/plan/regenerate', {});
    expect(regen.json.from).toBe('2026-10-01');
    expect(regen.json.to).toBe('2026-10-03');
    expect(service.tasks.byDate('2026-09-30').map((t) => t.id)).toEqual(wedIds);
    expect(service.meta.get(TRACKING_START_KEY)).toBe('2026-09-30');
    expect(service.tasks.byDate('2026-10-01').length).toBeGreaterThan(0);
    // Wednesday's missed AI session rolled into its own stream's next slot.
    await call('GET', '/api/dashboard');
    const wedAi = service.tasks.byDate('2026-09-30').find((t) => t.track === 'ai');
    expect(wedAi?.status).toBe('rolled');
    expect(service.tasks.byDate('2026-10-01').find((t) => t.track === 'ai')?.sessionNo).toBe(1);
  });
});

describe('scripts/reset-plan.ts', () => {
  it('refuses without --confirm or with completed tasks, then backs up and resets', async () => {
    ctx = makeTestApp('2026-09-27');
    await call('GET', '/api/dashboard');
    const quran = c().service.tasks.byDate('2026-09-27').find((t) => t.track === 'quran');
    c().service.complete(quran?.id ?? 0);
    const dbPath = join(c().dir, 'test.db');
    c().db.close();
    const port = await freePort();
    const root = resolve(import.meta.dirname, '..');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--no-warnings', join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'scripts', 'reset-plan.ts'), ...args], {
        cwd: root,
        env: { ...process.env, LEARNING_DB_PATH: dbPath, PORT: String(port) },
        encoding: 'utf8',
      });
    // A server answering on the configured port blocks the reset.
    const server = createHttpServer((_req, res) => res.end('{"ok":true}'));
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', () => r()));
    const blocked = await new Promise<{ code: number | null; stderr: string }>((res) => {
      const child = spawn(process.execPath, ['--no-warnings', join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'scripts', 'reset-plan.ts'), '--confirm', '--force'], {
        cwd: root,
        env: { ...process.env, LEARNING_DB_PATH: dbPath, PORT: String(port) },
      });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
      child.on('close', (code) => res({ code, stderr }));
    });
    await new Promise<void>((r) => server.close(() => r()));
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toMatch(/Stop it first/);
    const check = openDb(dbPath);
    expect(tableCounts(check).tasks).toBeGreaterThan(0);
    check.close();

    const noForce = run('--confirm');
    expect(noForce.status).toBe(1);
    expect(noForce.stderr).toMatch(/--force/);
    const noConfirm = run('--force');
    expect(noConfirm.status).toBe(1);
    expect(noConfirm.stderr).toMatch(/--confirm/);
    expect(existsSync(join(c().dir, 'backups'))).toBe(false);
    const ok = run('--confirm', '--force');
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/Backup written: .*pre-reset-\d{8}-\d{6}\.db/);
    expect(ok.stdout).toMatch(/Before:[\s\S]*After:/);
    const backups = readdirSync(join(c().dir, 'backups'));
    expect(backups.some((f) => /^pre-reset-\d{8}-\d{6}\.db$/.test(f))).toBe(true);
    // Empty plan, start date = today (real clock: the script uses the system date).
    const db = openDb(dbPath);
    expect(tableCounts(db)).toEqual({ tasks: 0, planned_days: 0, daily_summary: 0, module_state: 0, day_overrides: 0 });
    expect(new MetaRepo(db).get(TRACKING_START_KEY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    db.close();
    rmSync(c().dir, { recursive: true, force: true });
    ctx = null; // db already closed
  }, 30_000);
});
