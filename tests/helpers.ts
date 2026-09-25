import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.js';
import type { Clock } from '../src/server/service.js';

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

export function makeTestApp(startDate: string) {
  const dir = mkdtempSync(join(tmpdir(), 'learning-test-'));
  const clock = new TestClock(new Date(`${startDate}T04:00:00Z`));
  const { app, service, db } = createApp({ dbPath: join(dir, 'test.db'), clock, webDir: join(dir, 'no-web') });
  return {
    app,
    service,
    db,
    clock,
    dir,
    cleanup(): void {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
