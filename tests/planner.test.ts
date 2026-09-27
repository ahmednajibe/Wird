import { describe, expect, it } from 'vitest';
import { getModule } from '../src/shared/curriculum.js';
import {
  CONSOLIDATE_MIN_CREDIT,
  distributeSlots,
  normalWeekPlan,
  planDay,
  planDays,
  replanStream,
  splitMinutes,
  weeklyMinutesByStream,
  type PlanDayInput,
} from '../src/shared/planner.js';
import { ModuleLedger } from '../src/shared/progress.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { QuranSessionPlan } from '../src/shared/types.js';

const S = DEFAULT_SETTINGS;
const R = 40;
const memorize: QuranSessionPlan = { type: 'memorize', pages: [604], minutes: 40, title: 'Memorize page 604', description: '' };
const review: QuranSessionPlan = { type: 'review', pages: [604], minutes: 15, title: 'Review', description: '' };
const day = (p: Omit<PlanDayInput, 'quranReserve' | 'kept'> & Partial<Pick<PlanDayInput, 'quranReserve' | 'kept'>>): PlanDayInput => ({
  quranReserve: R,
  kept: [],
  ...p,
});
const study = (tasks: ReturnType<typeof planDay>) => tasks.filter((t) => t.track !== 'quran');

describe('normal week', () => {
  const week = normalWeekPlan(S);

  it('capacity is 864; every day is R + study slots = capacity; the rest of R is buffer', () => {
    expect(week.map((d) => d.capacity)).toEqual([120, 72, 120, 120, 72, 180, 180]);
    expect(week.reduce((a, d) => a + d.capacity, 0)).toBe(864);
    for (const d of week) {
      const studyMinutes = study(d.tasks).reduce((b, t) => b + t.plannedMinutes, 0);
      const quran = d.tasks.filter((t) => t.track === 'quran').reduce((b, t) => b + t.plannedMinutes, 0);
      expect(d.quranReserve, `dow ${d.dow}`).toBe(R);
      expect(R + studyMinutes, `dow ${d.dow}`).toBe(d.capacity);
      expect(d.bufferMinutes, `dow ${d.dow}`).toBe(R - quran);
    }
    // Review days (Mon, Wed, Fri: 15 min) leave a 25 min buffer each.
    expect(week.map((d) => d.bufferMinutes)).toEqual([0, 25, 0, 25, 0, 25, 0]);
    const planned = week.reduce((a, d) => a + d.tasks.reduce((b, t) => b + t.plannedMinutes, 0), 0);
    expect(planned).toBe(864 - 75);
  });

  it('per-track weekly minutes', () => {
    const w = weeklyMinutesByStream(week);
    const table = Object.fromEntries(w.map((x) => [`${x.track}/${x.stream}`, { planned: x.plannedMinutes, credited: x.creditedMinutes }]));
    const reserved = week.reduce((a, d) => a + d.quranReserve, 0);
    console.log('Normal-week minutes per track/stream:', JSON.stringify({ ...table, quranReserved: reserved }));
    expect(table['animation/draw']?.planned).toBe(160);
    expect(table['animation/story']?.planned).toBe(70);
    expect(table['ai/main']?.planned).toBe(207);
    expect(table['fsd/main']?.planned).toBe(147);
    expect(table['quran/main']?.planned).toBe(205); // 4 x 40 memorize + 3 x 15 review
    expect(reserved).toBe(280);
    expect(reserved + w.filter((x) => x.track !== 'quran').reduce((a, x) => a + x.plannedMinutes, 0)).toBe(864);
  });

  it('has exactly one Quran task per day, first, and no task over 75 minutes', () => {
    for (const d of week) {
      const quran = d.tasks.filter((t) => t.track === 'quran');
      expect(quran).toHaveLength(1);
      expect(d.tasks[0]?.track).toBe('quran');
      for (const t of d.tasks) expect(t.plannedMinutes).toBeLessThanOrEqual(75);
    }
  });

  it('numbers every stream as its own session queue (warm-up included in drawing)', () => {
    const numbers = (key: string) => week.flatMap((d) => d.tasks.filter((t) => `${t.track}/${t.stream}` === key).map((t) => t.sessionNo));
    expect(numbers('animation/draw')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(numbers('ai/main')).toEqual([1, 2, 3, 4]);
    expect(numbers('fsd/main')).toEqual([1, 2, 3]);
    expect(numbers('animation/story')).toEqual([1]);
    expect(week[0]?.tasks.find((t) => t.track === 'ai')?.title).toBe('Deep study: Python for Data Science, AI & Development (session 1)');
    for (const d of week) for (const t of d.tasks) if (t.track === 'quran') expect(t.sessionNo).toBeNull();
  });

  it('fasting days: drawing is light practice; unstarted modules get light study; started ones are consolidated', () => {
    const mon = week[1];
    expect(mon?.isFasting).toBe(true);
    const warm = mon?.tasks.find((t) => t.slotKey === 'animation/draw/warmup');
    expect(warm?.type).toBe('practice');
    expect(warm?.intensity).toBe('light');
    expect(warm?.plannedMinutes).toBe(15);
    expect(warm?.title).toBe('Light drawing practice: Drawabox Lessons 0-1 (lines, ellipses, boxes) (session 2)');
    // fsd-cs50 has 0 credited minutes on Monday of a fresh curriculum -> light study (learn).
    const monFsd = mon?.tasks.find((t) => t.track === 'fsd');
    expect(monFsd?.type).toBe('learn');
    expect(monFsd?.intensity).toBe('light');
    expect(monFsd?.title).toMatch(/^Light study: CS50x/);
    // By Thursday ai-py has 60 (Sun) + 60 (Wed) simulated minutes -> consolidate (review).
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
    expect(tueWarm?.title).toBe('Drawing warm-up, 20 min (session 3)');
    // No task on any day reviews drawing.
    for (const d of week) {
      for (const t of d.tasks) if (t.track === 'animation' && t.stream === 'draw') expect(t.type).not.toBe('review');
    }
  });

  it('fasting Friday: the drawing study block is light practice too', () => {
    const tasks = planDay(day({ date: '2026-09-25', isFasting: true, totalMinutes: 108, quran: memorize }), S, new ModuleLedger());
    const draw = tasks.filter((t) => t.stream === 'draw');
    expect(draw.map((t) => [t.type, t.intensity, t.plannedMinutes])).toEqual([['practice', 'light', 35]]);
    expect(draw[0]?.title).toMatch(/^Light drawing practice: /);
    expect(tasks.find((t) => t.track === 'ai')?.title).toMatch(/^Light study: /);
  });
});

describe('fixed daily caps', () => {
  it('the Quran session type never changes study minutes; buffer = R - Quran minutes', () => {
    for (const [date, isFasting, total] of [
      ['2026-09-27', false, 120],
      ['2026-09-28', true, 72],
      ['2026-10-02', false, 180],
      ['2026-10-03', false, 180],
    ] as const) {
      const withMemorize = planDay(day({ date, isFasting, totalMinutes: total, quran: memorize }), S, new ModuleLedger());
      const withReview = planDay(day({ date, isFasting, totalMinutes: total, quran: review }), S, new ModuleLedger());
      const withShortReview = planDay(day({ date, isFasting, totalMinutes: total, quran: { ...review, minutes: 10 } }), S, new ModuleLedger());
      expect(study(withReview), date).toEqual(study(withMemorize));
      expect(study(withShortReview), date).toEqual(study(withMemorize));
      const studyMinutes = study(withMemorize).reduce((a, t) => a + t.plannedMinutes, 0);
      expect(studyMinutes + R, date).toBe(total);
      const quranMinutes = withReview.find((t) => t.track === 'quran')?.plannedMinutes ?? 0;
      console.log(`${date}: study ${studyMinutes} min, review day buffer ${R - quranMinutes} min`);
    }
  });

  it('a capacity below R reserves the whole day for Quran', () => {
    const tasks = planDay(day({ date: '2026-09-27', isFasting: false, totalMinutes: 30, quran: memorize }), S, new ModuleLedger());
    expect(tasks.map((t) => t.track)).toEqual(['quran']);
  });
});

describe('slot distribution', () => {
  const tpl = S.weeklyTemplate;

  it('rounds to multiples of 5, last slot absorbs an off-grid remainder', () => {
    // Fasting Monday: 72 - R 40 = 32 -> warm-up 15, fsd 17.
    expect(distributeSlots(32, tpl[1] ?? [], true, S.planner).map((s) => s.minutes)).toEqual([15, 17]);
    // Friday template with 165 minutes: draw round(82.5)=85, ai 80.
    const fri = distributeSlots(165, tpl[5] ?? [], false, S.planner);
    expect(fri.map((s) => [s.slotKey, s.minutes])).toEqual([
      ['animation/draw/focus', 85],
      ['ai/main/focus', 80],
    ]);
    // Saturday: 180 - 40 = 140 -> 70 / 70.
    expect(distributeSlots(140, tpl[6] ?? [], false, S.planner).map((s) => s.minutes)).toEqual([70, 70]);
  });

  it('merges a slot shorter than 15 minutes into the previous slot', () => {
    // Monday template with 27 minutes: warm-up 15 + fsd 12 -> merged into warm-up.
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
    const tasks = planDay(day({ date: '2026-10-03', isFasting: false, totalMinutes: 300, quran: memorize }), S, new ModuleLedger());
    for (const t of tasks) expect(t.plannedMinutes).toBeLessThanOrEqual(75);
    expect(tasks.reduce((a, t) => a + t.plannedMinutes, 0)).toBe(300);
    // Each chunk is its own numbered session of the stream.
    expect(tasks.filter((t) => t.track === 'fsd').map((t) => t.sessionNo)).toEqual([1, 2]);
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
      day({ date: '2026-09-27', isFasting: false, totalMinutes: 120, quran: memorize }), // Sun: ai 60
      day({ date: '2026-09-30', isFasting: false, totalMinutes: 120, quran: review }), // Wed: ai 60 (fixed cap)
    ];
    const plan = planDays(inputs, S, ledger);
    const sun = plan.get('2026-09-27')?.find((t) => t.track === 'ai');
    expect(sun?.moduleId).toBe('ai-py');
    expect(sun?.description).toMatch(/Expected to finish this module/);
    const wed = plan.get('2026-09-30')?.filter((t) => t.track === 'ai') ?? [];
    expect(wed.every((t) => t.moduleId === 'ai-linalg')).toBe(true);
    // 30 min finished ai-py; the remaining 30 flowed into ai-linalg, plus Wednesday's 60.
    expect(ledger.creditedOf('ai-linalg')).toBe(30 + 60);
  });

  it('fasting-day credit: drawing practice and light study 100%, consolidation 50%', () => {
    const fresh = new ModuleLedger();
    planDay(day({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review }), S, fresh);
    // Monday fasting: 72 - R 40 = 32: warm-up 15 practice, fsd 17 light study (module not started).
    expect(fresh.creditedOf('an-dab1')).toBe(15);
    expect(fresh.creditedOf('fsd-cs50')).toBe(17);

    const started = new ModuleLedger();
    started.apply('fsd-cs50', CONSOLIDATE_MIN_CREDIT);
    const tasks = planDay(day({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review }), S, started);
    expect(tasks.find((t) => t.track === 'fsd')?.type).toBe('review');
    expect(started.creditedOf('fsd-cs50')).toBe(CONSOLIDATE_MIN_CREDIT + 8.5);
  });

  it('no-module fallback is open practice (light on fasting days)', () => {
    const ledger = new ModuleLedger();
    for (const id of ['fsd-cs50', 'fsd-missing', 'fsd-http', 'fsd-js', 'fsd-css', 'fsd-a11y', 'fsd-ts', 'fsd-react', 'fsd-seo', 'fsd-fso', 'fsd-sql', 'fsd-sec', 'fsd-ddia', 'fsd-devops', 'fsd-ibm-cloud', 'fsd-ci', 'fsd-sysdesign', 'fsd-perf', 'fsd-capstone']) {
      ledger.apply(id, 100_000);
    }
    expect(ledger.current('fsd', 'main')).toBeNull();
    const fasting = planDay(day({ date: '2026-09-28', isFasting: true, totalMinutes: 72, quran: review }), S, ledger);
    const f = fasting.find((t) => t.track === 'fsd');
    expect([f?.type, f?.intensity, f?.moduleId]).toEqual(['practice', 'light', null]);
    expect(f?.title).toBe('Open practice (light): Full Stack Development (session 1)');
    const normal = planDay(day({ date: '2026-09-29', isFasting: false, totalMinutes: 120, quran: review }), S, ledger);
    expect(normal.find((t) => t.track === 'fsd')?.title).toMatch(/^Open practice: Full Stack Development/);
  });

  it('kept (completed/skipped/rolled) generated tasks reduce only their own slot', () => {
    const tasks = planDay(
      day({
        date: '2026-09-27',
        isFasting: false,
        totalMinutes: 120,
        quran: null,
        kept: [
          { slotKey: 'quran', minutes: 40 },
          { slotKey: 'animation/draw/warmup', minutes: 20 },
        ],
      }),
      S,
      new ModuleLedger(),
    );
    expect(tasks.map((t) => [t.slotKey, t.plannedMinutes])).toEqual([['ai/main/focus', 60]]);
    // A kept task whose slot does not exist that day never eats another track's slot.
    const unmatched = planDay(
      day({ date: '2026-09-27', isFasting: false, totalMinutes: 120, quran: memorize, kept: [{ slotKey: 'fsd/main/focus', minutes: 45 }] }),
      S,
      new ModuleLedger(),
    );
    expect(unmatched.map((t) => [t.slotKey, t.plannedMinutes])).toEqual([
      ['quran', 40],
      ['animation/draw/warmup', 20],
      ['ai/main/focus', 60],
    ]);
  });

  it('capacity 0 (rest day) plans nothing', () => {
    expect(planDay(day({ date: '2026-09-27', isFasting: false, totalMinutes: 0, quran: memorize }), S, new ModuleLedger())).toEqual([]);
  });
});

describe('stream re-plan (roll-forward)', () => {
  it('keeps slots and minutes, recomputes content and numbering from real progress', () => {
    const items = [
      { date: '2026-09-30', slotKey: 'ai/main/focus', plannedMinutes: 60, isFasting: false },
      { date: '2026-10-01', slotKey: 'ai/main/focus', plannedMinutes: 17, isFasting: true },
    ];
    const out = replanStream(items, new ModuleLedger(), 1);
    expect(out.map((c) => [c.sessionNo, c.moduleId, c.type, c.intensity])).toEqual([
      [1, 'ai-py', 'learn', 'deep'],
      [2, 'ai-py', 'review', 'light'],
    ]);
    expect(out[0]?.title).toBe('Deep study: Python for Data Science, AI & Development (session 1)');
    const warm = replanStream([{ date: '2026-09-30', slotKey: 'animation/draw/warmup', plannedMinutes: 20, isFasting: false }], new ModuleLedger(), 4);
    expect(warm[0]?.title).toBe('Drawing warm-up, 20 min (session 4)');
  });
});
