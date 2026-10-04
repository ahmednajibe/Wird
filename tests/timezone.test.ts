/**
 * Install timezone: system detection, first-boot storage, day boundaries and
 * the rule that existing databases never change zone by themselves.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { detectSystemTimezone } from '../src/server/config.js';
import { openDb, type Db } from '../src/server/db.js';
import { TRACKING_START_KEY } from '../src/server/service.js';
import { DEFAULT_TIMEZONE } from '../src/shared/dates.js';
import { TestClock } from './helpers.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let dir: string | null = null;
let opened: Db[] = [];

afterEach(() => {
  for (const db of opened) if (db.isOpen) db.close();
  opened = [];
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function testDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'tz-test-'));
  return dir;
}

const settingsRow = (db: Db) => db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string } | undefined;

describe('detectSystemTimezone', () => {
  it('returns the machine zone when it is a valid IANA name', () => {
    expect(detectSystemTimezone(() => 'Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('falls back to DEFAULT_TIMEZONE for unusable readings', () => {
    expect(detectSystemTimezone(() => undefined)).toBe(DEFAULT_TIMEZONE);
    expect(detectSystemTimezone(() => '')).toBe(DEFAULT_TIMEZONE);
    expect(detectSystemTimezone(() => 'Not/AZone')).toBe(DEFAULT_TIMEZONE);
    expect(
      detectSystemTimezone(() => {
        throw new Error('no Intl');
      }),
    ).toBe(DEFAULT_TIMEZONE);
  });
});

describe('initial timezone on a brand-new database', () => {
  it('stores only the timezone key and serves it from /api/settings', async () => {
    const dbPath = join(testDir(), 'test.db');
    const { app, db } = createApp({
      dbPath,
      clock: new TestClock(new Date('2026-10-04T04:00:00Z')),
      webDir: join(dir!, 'no-web'),
      initialTimezone: 'Asia/Tokyo',
    });
    opened.push(db);

    const res = await app.request('/api/settings');
    expect(res.status).toBe(200);
    expect((await res.json() as Json).timezone).toBe('Asia/Tokyo');
    expect(JSON.parse(settingsRow(db)!.json)).toEqual({ timezone: 'Asia/Tokyo' });
  });

  it('draws the day boundary in the stored zone', async () => {
    const dbPath = join(testDir(), 'test.db');
    // 19:00 in Cairo (still 2026-10-04), 01:00 in Tokyo (already 2026-10-05).
    const { app, service, db } = createApp({
      dbPath,
      clock: new TestClock(new Date('2026-10-04T16:00:00Z')),
      webDir: join(dir!, 'no-web'),
      initialTimezone: 'Asia/Tokyo',
    });
    opened.push(db);

    expect(service.today()).toBe('2026-10-05');
    expect((await app.request('/api/dashboard')).status).toBe(200);
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(TRACKING_START_KEY) as { value: string };
    expect(row.value).toBe('2026-10-05');
  });

  it('leaves existing databases on their own zone and writes no settings row', async () => {
    const dbPath = join(testDir(), 'test.db');
    const first = openDb(dbPath); // no option: migrates but stores nothing
    expect(settingsRow(first)).toBeUndefined();
    first.close();

    const { service, db } = createApp({
      dbPath,
      clock: new TestClock(new Date('2026-10-04T04:00:00Z')),
      webDir: join(dir!, 'no-web'),
      initialTimezone: 'Asia/Tokyo',
    });
    opened.push(db);
    expect(service.settings().timezone).toBe(DEFAULT_TIMEZONE);
    expect(settingsRow(db)).toBeUndefined();
  });

  it('keeps the stored zone when the DB is reopened with a different option', () => {
    const dbPath = join(testDir(), 'test.db');
    const first = createApp({
      dbPath,
      clock: new TestClock(new Date('2026-10-04T04:00:00Z')),
      webDir: join(dir!, 'no-web'),
      initialTimezone: 'Asia/Tokyo',
    });
    first.db.close();

    const second = createApp({
      dbPath,
      clock: new TestClock(new Date('2026-10-04T04:00:00Z')),
      webDir: join(dir!, 'no-web'),
      initialTimezone: 'Europe/Berlin',
    });
    opened.push(second.db);
    expect(second.service.settings().timezone).toBe('Asia/Tokyo');
  });
});
