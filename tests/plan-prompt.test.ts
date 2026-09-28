/**
 * The PLAN_PROMPT.md contract: every JSON example in the doc must validate and
 * import cleanly, and the documented minute math must match what the planner
 * actually produces.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validatePack } from '../src/shared/pack.js';
import { distributeSlots } from '../src/shared/planner.js';
import { DEFAULT_SETTINGS, type TemplateSlot } from '../src/shared/settings.js';
import { makeTestApp } from './helpers.js';

const md = readFileSync(join(import.meta.dirname, '..', 'PLAN_PROMPT.md'), 'utf8');
const jsonBlocks = [...md.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1] as string);

interface WeekTask {
  track: string;
  stream: string;
  title: string;
  plannedMinutes: number;
}
interface Week {
  days: { date: string; bufferMinutes: number; tasks: WeekTask[] }[];
}

const minutesFor = (day: { tasks: WeekTask[] }, track: string, stream: string) =>
  day.tasks.filter((t) => t.track === track && t.stream === stream).reduce((a, t) => a + t.plannedMinutes, 0);

describe('PLAN_PROMPT.md examples', () => {
  it('contains at least two json example blocks', () => {
    expect(jsonBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it('every json block parses and validates with no errors', () => {
    for (const [i, src] of jsonBlocks.entries()) {
      const pack = JSON.parse(src) as unknown;
      const res = validatePack(pack);
      if (!res.ok) {
        expect(res.errors, `json block ${i}`).toEqual([]);
      }
    }
  });

  it('the inline Quran-only plan validates', () => {
    const res = validatePack(JSON.parse('{ "version": 1, "name": "Quran", "tracks": [] }'));
    expect(res.ok).toBe(true);
  });

  it('the minimal example plans 40 min of Spanish on a 60 min Sunday', async () => {
    const ctx = makeTestApp('2026-09-27', { plan: 'empty' }); // Sunday
    try {
      const pack = JSON.parse(jsonBlocks[0] as string) as unknown;
      const res = await ctx.app.request('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack, mode: 'fresh' }),
      });
      expect(res.status).toBe(200);
      const week = (await (await ctx.app.request('/api/week?start=2026-09-27')).json()) as Week;
      const sunday = week.days.find((d) => d.date === '2026-09-27');
      expect(sunday).toBeTruthy();
      // capacity 60 - Quran reserve 20 = 40 for the only rest slot.
      expect(minutesFor(sunday!, 'spanish', 'main')).toBe(40);
    } finally {
      ctx.cleanup();
    }
  });

  it('the full example plans the documented Sunday and Monday minutes', async () => {
    const ctx = makeTestApp('2026-09-27', { plan: 'empty' }); // Sunday
    try {
      const pack = JSON.parse(jsonBlocks[jsonBlocks.length - 1] as string) as unknown;
      const res = await ctx.app.request('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack, mode: 'fresh' }),
      });
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

      const week = (await (await ctx.app.request('/api/week?start=2026-09-27')).json()) as Week;
      const sunday = week.days.find((d) => d.date === '2026-09-27');
      const monday = week.days.find((d) => d.date === '2026-09-28');
      expect(sunday).toBeTruthy();
      expect(monday).toBeTruthy();

      // Sunday: capacity 120 - Quran reserve 40 = 80 study; fixed warm-up 15,
      // core rest gets the remaining 65.
      expect(minutesFor(sunday!, 'german', 'speak')).toBe(15);
      expect(minutesFor(sunday!, 'german', 'core')).toBe(65);
      // Monday: fasting, 90 x 0.6 = 54. The Quran session is a 10 min review
      // but the reserve stays 40 (30 min buffer). Study budget is 14, which the
      // fixed warm-up (fastingMinutes 15) takes entirely; the rest slot gets 0.
      console.log(JSON.stringify(monday!.tasks.map((t) => [t.track, t.stream, t.plannedMinutes])));
      expect(minutesFor(monday!, 'german', 'speak')).toBe(14);
      expect(minutesFor(monday!, 'web-dev', 'main')).toBe(0);
      expect(minutesFor(monday!, 'quran', 'main')).toBe(10);
      expect(monday!.bufferMinutes).toBe(30);
    } finally {
      ctx.cleanup();
    }
  });
});

describe('template slot order', () => {
  it('a share slot listed after the rest slot still gets its share', () => {
    const warmup: TemplateSlot = { track: 'aaa', stream: 'main', role: 'warmup', kind: 'fixed', minutes: 20 };
    const restB: TemplateSlot = { track: 'bbb', stream: 'main', role: 'focus', kind: 'rest' };
    const shareC: TemplateSlot = { track: 'ccc', stream: 'main', role: 'focus', kind: 'share', share: 0.5 };

    // 80 remaining: fixed 20 leaves 60; share takes 0.5 x 60 = 30; rest takes 30.
    const trailing = distributeSlots(80, [warmup, restB, shareC], false, DEFAULT_SETTINGS.planner);
    const leading = distributeSlots(80, [warmup, shareC, restB], false, DEFAULT_SETTINGS.planner);

    const mins = (slots: ReturnType<typeof distributeSlots>, track: string) =>
      slots.filter((s) => s.track === track).reduce((a, s) => a + s.minutes, 0);
    expect(mins(trailing, 'ccc')).toBe(30);
    expect(mins(leading, 'ccc')).toBe(30);
    expect(mins(trailing, 'bbb')).toBe(30);
    expect(mins(trailing, 'aaa')).toBe(20);
  });
});
