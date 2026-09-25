import { describe, expect, it } from 'vitest';
import { getModule } from '../src/shared/curriculum.js';
import {
  CONSOLIDATE_MIN_CREDIT,
  distributeSlots,
  normalWeekPlan,
  planDay,
  planDays,
  splitMinutes,
  weeklyMinutesByStream,
  type PlanDayInput,
} from '../src/shared/planner.js';
import { ModuleLedger } from '../src/shared/progress.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { QuranSessionPlan } from '../src/shared/types.js';

const S = DEFAULT_SETTINGS;
const memorize: QuranSessionPlan = { type: 'memorize', pages: [604], minutes: 40, title: 'Memorize page 604', description: '' };
const review: QuranSessionPlan = { type: 'review', pages: [604], minutes: 15, title: 'Review', description: '' };

describe('normal week', () => {
  const week = normalWeekPlan(S);

  it('totals exactly 864 minutes (capacity and planned task minutes)', () => {
    expect(week.map((d) => d.capacity)).toEqual([120, 72, 120, 120, 72, 180, 180]);
    expect(week.reduce((a, d) => a + d.capacity, 0)).toBe(864);
    const planned = week.reduce((a, d) => a + d.tasks.reduce((b, t) => b + t.plannedMinutes, 0), 0);
    expect(planned).toBe(864);
    for (const d of week) {
      expect(d.tasks.reduce((b, t) => b + t.plannedMinutes, 0), `dow ${d.dow}`).toBe(d.capacity);
    }
  });

  it('per-track weekly minutes', () => {
    const w = weeklyMinutesByStream(week);
    const table = Object.fromEntries(w.map((x) => [`${x.track}/${x.stream}`, { planned: x.plannedMinutes, credited: x.creditedMinutes }]));
    console.log('Normal-week minutes per track/stream:', JSON.stringify(table));
    expect(table['quran/main']?.planned).toBe(205);
    expect(table['ai/main']?.planned).toBe(242);
    expect(table['fsd/main']?.planned).toBe(172);
    expect(table['animation/draw']?.planned).toBe(175);
    expect(table['animation/story']?.planned).toBe(70);
    expect(w.reduce((a, x) => a + x.plannedMinutes, 0)).toBe(864);
  });

  it('has exactly one Quran task per day, first, and no task over 75 minutes', () => {
    for (const d of week) {
      const quran = d.tasks.filter((t) => t.track === 'quran');
      expect(quran).toHaveLength(1);
      expect(d.tasks[0]?.track).toBe('quran');
      for (const t of d.tasks) expect(t.plannedMinutes).toBeLessThanOrEqual(75);
    }
  });

  it('fasting days: drawing is light practice; unstarted modules get light study; started ones are consolidated', () => {
    const mon = week[1];
    expect(mon?.isFasting).toBe(true);
    const warm = mon?.tasks.find((t) => t.slotKey === 'animation/draw/warmup');
    expect(warm?.type).toBe('practice');
    expect(warm?.intensity).toBe('light');
    expect(warm?.plannedMinutes).toBe(15);
    expect(warm?.title).toBe('Light drawing practice: Drawabox Lessons 0-1 (lines, ellipses, boxes)');
    // fsd-cs50 has 0 credited minutes on Monday of a fresh curriculum -> light study (learn).
    const monFsd = mon?.tasks.find((t) => t.track === 'fsd');
    expect(monFsd?.type).toBe('learn');
    expect(monFsd?.intensity).toBe('light');
    expect(monFsd?.title).toMatch(/^Light study: CS50x/);
    // By Thursday ai-py has 60 (Sun) + 85 (Wed) simulated minutes -> consolidate (review).
    const thuAi = week[4]?.tasks.find((t) => t.track === 'ai');
    expect(thuAi?.type).toBe('review');
    expect(thuAi?.intensity).toBe('light');
    expect(thuAi?.title).toMatch(/^Consolidate: Python for Data Science/);
    // Normal days: deep learn and a normal warm-up.
    const tue = week[2];
    const deep = tue?.tasks.find((t) => t.track === 'fsd');
    expect(deep?.type).toBe('learn');
    expect(deep?.intensity).toBe('deep');
    const tueWarm = tue?.tasks.find((t) => t.slotKey === 'animation/draw/warmup');
    expect(tueWarm?.plannedMinutes).toBe(20);
    expect(tueWarm?.title).toBe('Drawing warm-up (20 min)');
    // No task on any day reviews drawing.
    for (const d of week) {
      for (const t of d.tasks) if (t.track === 'animation' && t.stream === 'draw') expect(t.type).not.toBe('review');
    }
  });

  it('fasting Friday: the drawing study block is light practice too', () => {
    const tasks = planDay({ date: '2026-09-25', isFasting: true, totalMinutes: 108, quran: memorize, kept: [] }, S, new ModuleLedger());
    const draw = tasks.filter((t) => t.stream === 'draw');
    expect(draw.map((t) => [t.type, t.intensity, t.plannedMinutes])).toEqual([['practice', 'light', 35]]);
    expect(draw[0]?.title).toMatch(/^Light drawing practice: /);
    expect(tasks.find((t) => t.track === 'ai')?.title).toMatch(/^Light study: /);
  });
});

describe('slot distribution', () => {
  const tpl = S.weeklyTemplate;

  it('rounds to multiples of 5, last slot absorbs an off-grid remainder', () => {
    // Fasting Monday with memorize: 72 - 40 = 32 -> warm-up 15, fsd 17.
    expect(distributeSlots(32, tpl[1] ?? [], true, S.planner).map((s) => s.minutes)).toEqual([15, 17]);
    // Friday with review 15: 165 -> draw round(82.5)=85, ai 80.
    const fri = distributeSlots(165, tpl[5] ?? [], false, S.planner);
    expect(fri.map((s) => [s.slotKey, s.minutes])).toEqual([
      ['animation/draw/focus', 85],
      ['ai/main/focus', 80],
    ]);
    // Saturday: 140 -> 70 / 70.
    expect(distributeSlots(140, tpl[6] ?? [], false, S.planner).map((s) => s.minutes)).toEqual([70, 70]);
  });

  it('merges a slot shorter than 15 minutes into the previous slot', () => {
    // Fasting Monday with a 45-minute review: 72 - 45 = 27 -> warm-up 15 + fsd 12 -> merged into warm-up.
    const slots = distributeSlots(27, tpl[1] ?? [], true, S.planner);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.minutes).toBe(27);
    expect(slots[0]?.slotKey).toBe('animation/draw/warmup');
    // When the first slot is short and there is no previous one, it merges forward.
    const shortFirst = distributeSlots(50, [{ track: 'animation', stream: 'draw', role: 'warmup', kind: 'fixed', minutes: 10 }, { track: 'ai', stream: 'main', role: 'focus', kind: 'rest' }], false, S.planner);
    expect(shortFirst.map((s) => [s.slotKey, s.minutes])).toEqual([['ai/main/focus', 50]]);
  });

  it('splits long slots into near-equal tasks of at most 75 minutes', () => {
    expect(splitMinutes(75, 75, 5)).toEqual([75]);
    expect(splitMinutes(85, 75, 5)).toEqual([45, 40]);
    expect(splitMinutes(80, 75, 5)).toEqual([40, 40]);
    expect(splitMinutes(151, 75, 5)).toEqual([50, 50, 51]);
    expect(splitMinutes(165, 75, 5)).toEqual([55, 55, 55]);
    const day = planDay(
      { date: '2026-10-03', isFasting: false, totalMinutes: 300, quran: memorize, kept: [] },
      S,
      new ModuleLedger(),
    );
    for (const t of day) expect(t.plannedMinutes).toBeLessThanOrEqual(75);
    expect(day.reduce((a, t) => a + t.plannedMinutes, 0)).toBe(300);
  });
});

describe('simulated module consumption', () => {
  it('a later day already points at the next module', () => {
    const ledger = new ModuleLedger();
    const py = getModule('ai-py');
    expect(py).toBeDefined();
    // 30 minutes left on ai-py.
    ledger.apply('ai-py', (py?.estMinutes ?? 0) - 30);
    const inputs: PlanDayInput[] = [
      { date: '2026-09-27', isFasting: false, totalMinutes: 120, quran: memorize, kept: [] }, // Sun: ai 60
      { date: '2026-09-30', isFasting: false, totalMinutes: 120, quran: review, kept: [] }, // Wed: ai 85
    ];
    const plan = planDays(inputs, S, ledger);
    const sun = plan.get('2026-09-27')?.find((t) => t.track === 'ai');
    expect(sun?.moduleId).toBe('ai-py');
    expect(sun?.description).toMatch(/Expected to finish this module/);
    const wed = plan.get('2026-09-30')?.filter((t) => t.track === 'ai') ?? [];
    expect(wed.every((t) => t.moduleId === 'ai-linalg')).toBe(true);
    // 30 min finished ai-py; the remaining 30 flowed into ai-linalg, plus Wednesday's 85.
    expect(ledger.creditedOf('ai-linalg')).toBe(30 + 85);
  });

  it('fasting-day credit: drawing practice and light study 100%, consolidation 50%', () => {
    const fresh = new ModuleLedger();
    planDay({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review, kept: [] }, S, fresh);
    // Monday fasting: warm-up 15 practice, fsd 42 light study (module not started).
    expect(fresh.creditedOf('an-dab1')).toBe(15);
    expect(fresh.creditedOf('fsd-cs50')).toBe(42);

    const started = new ModuleLedger();
    started.apply('fsd-cs50', CONSOLIDATE_MIN_CREDIT);
    const tasks = planDay({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review, kept: [] }, S, started);
    expect(tasks.find((t) => t.track === 'fsd')?.type).toBe('review');
    expect(started.creditedOf('fsd-cs50')).toBe(CONSOLIDATE_MIN_CREDIT + 21);
  });

  it('no-module fallback is open practice (light on fasting days)', () => {
    const ledger = new ModuleLedger();
    for (const id of ['fsd-cs50', 'fsd-missing', 'fsd-http', 'fsd-js', 'fsd-css', 'fsd-a11y', 'fsd-ts', 'fsd-react', 'fsd-seo', 'fsd-fso', 'fsd-sql', 'fsd-sec', 'fsd-ddia', 'fsd-devops', 'fsd-ibm-cloud', 'fsd-ci', 'fsd-sysdesign', 'fsd-perf', 'fsd-capstone']) {
      ledger.apply(id, 100_000);
    }
    expect(ledger.current('fsd', 'main')).toBeNull();
    const fasting = planDay({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review, kept: [] }, S, ledger);
    const f = fasting.find((t) => t.track === 'fsd');
    expect([f?.type, f?.intensity, f?.moduleId]).toEqual(['practice', 'light', null]);
    expect(f?.title).toBe('Open practice (light): Full Stack Development');
    const normal = planDay({ date: '2026-09-29', isFasting: false, totalMinutes: 120, quran: review, kept: [] }, S, ledger);
    expect(normal.find((t) => t.track === 'fsd')?.title).toMatch(/^Open practice: Full Stack Development/);
  });


  it('kept (completed/skipped) generated tasks reduce the re-planned slots', () => {
    const day = planDay(
      {
        date: '2026-09-27',
        isFasting: false,
        totalMinutes: 120,
        quran: null,
        kept: [
          { slotKey: 'quran', minutes: 40 },
          { slotKey: 'animation/draw/warmup', minutes: 20 },
        ],
      },
      S,
      new ModuleLedger(),
    );
    expect(day.map((t) => [t.slotKey, t.plannedMinutes])).toEqual([['ai/main/focus', 60]]);
  });

  it('capacity 0 (rest day) plans nothing', () => {
    expect(planDay({ date: '2026-09-27', isFasting: false, totalMinutes: 0, quran: memorize, kept: [] }, S, new ModuleLedger())).toEqual([]);
  });
});
