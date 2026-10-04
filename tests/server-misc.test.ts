import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { backupIfDue } from '../src/server/backup.js';
import { openDb } from '../src/server/db.js';
import { buildCatalog } from '../src/shared/catalog.js';
import { DEFAULT_TIMEZONE } from '../src/shared/dates.js';
import { OWNER_CATALOG_DATA } from '../src/server/seed/ownerCatalog.js';

const CATALOG = buildCatalog(OWNER_CATALOG_DATA);

const dir = mkdtempSync(join(tmpdir(), 'learning-misc-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('curriculum data', () => {
  it('matches the stated totals per track/stream', () => {
    const hours = (track: string, stream: string) =>
      CATALOG.modulesFor(track, stream).reduce((a, m) => a + m.estMinutes, 0) / 60;
    expect(hours('ai', 'main')).toBeCloseTo(663.1, 1);
    expect(hours('fsd', 'main')).toBeCloseTo(364.5, 1);
    expect(hours('animation', 'draw')).toBe(225);
    expect(hours('animation', 'story')).toBe(182);
    expect(new Set(OWNER_CATALOG_DATA.modules.map((m) => m.id)).size).toBe(OWNER_CATALOG_DATA.modules.length);
  });
});

describe('backups', () => {
  it('writes one backup per day with VACUUM INTO and keeps the last 30', () => {
    const db = openDb(join(dir, 'b.db'));
    const backups = join(dir, 'backups');
    mkdirSync(backups, { recursive: true });
    for (let i = 1; i <= 31; i++) writeFileSync(join(backups, `learning-2026-01-${String(i).padStart(2, '0')}.db`), '');
    const r = backupIfDue(db, backups, '2026-09-25');
    expect(r.created).not.toBeNull();
    expect(existsSync(join(backups, 'learning-2026-09-25.db'))).toBe(true);
    expect(backupIfDue(db, backups, '2026-09-25').created).toBeNull();
    expect(readdirSync(backups)).toHaveLength(30);
    expect(r.removed).toEqual(['learning-2026-01-01.db', 'learning-2026-01-02.db']);
    db.close();
  });
});

describe('static web serving', () => {
  it('serves files from the web dir with SPA fallback', async () => {
    const web = join(dir, 'web');
    mkdirSync(join(web, 'assets'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>app</title>');
    writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
    const { app, db } = createApp({ dbPath: join(dir, 'w.db'), webDir: web, initialTimezone: DEFAULT_TIMEZONE });
    const js = await app.request('/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    const deep = await app.request('/tracks/ai');
    expect(await deep.text()).toMatch(/<title>app<\/title>/);
    const traversal = await app.request('/..%2f..%2fpackage.json');
    expect(await traversal.text()).toMatch(/<title>app<\/title>/);
    const api = await app.request('/api/unknown');
    expect(api.status).toBe(404);
    db.close();
  });
});
