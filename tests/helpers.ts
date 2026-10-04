import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.js';
import { seedOwnerPlan } from '../src/server/seed/seed.js';
import type { Clock } from '../src/server/service.js';
import { DEFAULT_TIMEZONE } from '../src/shared/dates.js';

export class TestClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  /** Sets the clock to 07:00 Cairo time (04:00Z during DST) on `date`. */
  setCairoMorning(date: string): void {
    this.current = new Date(`${date}T04:00:00Z`);
  }
  advanceMinutes(min: number): void {
    this.current = new Date(this.current.getTime() + min * 60_000);
  }
}

export interface TestAppOptions {
  /**
   * Which plan the database starts with: 'owner' seeds the owner catalog and
   * weekly template (like a migrated database), 'empty' leaves the fresh
   * install state (only the built-in Quran track, empty template).
   */
  plan?: 'owner' | 'empty';
}

export function makeTestApp(startDate: string, opts: TestAppOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'learning-test-'));
  const clock = new TestClock(new Date(`${startDate}T04:00:00Z`));
  const { app, service, db } = createApp({
    dbPath: join(dir, 'test.db'),
    clock,
    webDir: join(dir, 'no-web'),
    // Pin the zone so tests never depend on the machine's timezone.
    initialTimezone: DEFAULT_TIMEZONE,
  });
  if ((opts.plan ?? 'owner') === 'owner') {
    // createApp plans lazily on first request, so seeding before any request
    // is identical to a migrated database.
    seedOwnerPlan(db);
    service.reloadCatalog();
  }
  return {
    app,
    service,
    db,
    clock,
    dir,
    cleanup(): void {
      if (db.isOpen) db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
