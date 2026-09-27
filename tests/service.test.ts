import { afterEach, describe, expect, it } from 'vitest';
import { dateRange } from '../src/shared/dates.js';
import { makeTestApp } from './helpers.js';

let ctx: ReturnType<typeof makeTestApp> | null = null;
afterEach(() => {
  ctx?.cleanup();
  ctx = null;
});

describe('planning lifecycle (service + SQLite)', () => {
  it('generates the week only for dates >= today', () => {
    ctx = makeTestApp('2026-09-30'); // Wednesday
    const { service } = ctx;
    service.ensureWeek('2026-09-30');
    for (const d of ['2026-09-27', '2026-09-28', '2026-09-29']) expect(service.tasks.byDate(d)).toHaveLength(0);
    for (const d of dateRange('2026-09-30', '2026-10-03')) {
      const tasks = service.tasks.byDate(d);
      expect(tasks.length, d).toBeGreaterThan(0);
      expect(tasks.filter((t) => t.track === 'quran')).toHaveLength(1);
    }
    // Idempotent.
    expect(service.ensureWeek('2026-09-30')).toBe(0);
  });

  it('regenerate preserves completed and manual tasks and never touches past dates', () => {
    ctx = makeTestApp('2026-09-27'); // Sunday
    const { service, clock } = ctx;
    service.ensureWeek('2026-09-27');
    const sun = service.tasks.byDate('2026-09-27');
    const sunQuran = sun.find((t) => t.track === 'quran');
    const sunWarm = sun.find((t) => t.slotKey === 'animation/draw/warmup');
    expect(sunQuran?.type).toBe('quran-memorize');
    expect(sunQuran?.quranPages).toEqual([604]);
    service.complete(sunQuran?.id ?? 0, 35);
    service.complete(sunWarm?.id ?? 0);
    const manual = service.createManual({ track: 'fsd', title: 'Bonus: read about HTTP caching', minutes: 30, type: 'learn' });

    // Monday is fully missed; move to Tuesday.
    const mondayIds = service.tasks.byDate('2026-09-28').map((t) => t.id);
    clock.setCairoMorning('2026-09-29');
    const tueBefore = service.tasks.byDate('2026-09-29').map((t) => t.id);

    const result = service.regenerate('2026-09-27');
    expect(result.from).toBe('2026-09-29');
    expect(result.to).toBe('2026-10-03');

    // Past days untouched.
    expect(service.tasks.byDate('2026-09-28').map((t) => t.id)).toEqual(mondayIds);
    const sunAfter = service.tasks.byDate('2026-09-27');
    expect(sunAfter.map((t) => t.id).sort((a, b) => a - b)).toEqual([...sun.map((t) => t.id), manual.id].sort((a, b) => a - b));
    expect(sunAfter.filter((t) => t.status === 'pending').length).toBe(sun.length - 2);
    expect(service.tasks.get(sunQuran?.id ?? 0)?.status).toBe('completed');
    expect(service.tasks.get(sunWarm?.id ?? 0)?.status).toBe('completed');
    expect(service.tasks.get(manual.id)?.status).toBe('completed');

    // Tuesday onwards replaced with fresh tasks.
    const tueAfter = service.tasks.byDate('2026-09-29');
    expect(tueAfter.some((t) => tueBefore.includes(t.id))).toBe(false);
    // Monday was missed, so the last completed Quran session is still Sunday's memorize: Tuesday is review.
    expect(tueAfter.find((t) => t.track === 'quran')?.type).toBe('quran-review');
    expect(service.taskView(service.tasks.byDate('2026-09-28')[0]!).status).toBe('missed');
  });

  it('regenerating a day with completed generated tasks does not duplicate them', () => {
    ctx = makeTestApp('2026-09-29'); // Tuesday, 120 min
    const { service } = ctx;
    service.ensureWeek('2026-09-29');
    const tue = service.tasks.byDate('2026-09-29');
    const warm = tue.find((t) => t.slotKey === 'animation/draw/warmup');
    service.complete(warm?.id ?? 0);
    service.regenerate('2026-09-29');
    const after = service.tasks.byDate('2026-09-29').filter((t) => t.source === 'generated');
    expect(after.filter((t) => t.slotKey === 'animation/draw/warmup')).toHaveLength(1);
    expect(after.reduce((a, t) => a + t.plannedMinutes, 0)).toBe(120);
  });

  it('syncQuranTasks re-derives future Quran tasks after completion and uncompletion', () => {
    ctx = makeTestApp('2026-09-27');
    const { service } = ctx;
    service.ensureWeek('2026-09-27');
    const types = () => dateRange('2026-09-27', '2026-10-03').map((d) => service.tasks.byDate(d).find((t) => t.track === 'quran')?.type);
    expect(types()).toEqual(['quran-memorize', 'quran-review', 'quran-memorize', 'quran-review', 'quran-memorize', 'quran-review', 'quran-memorize']);
    const q = service.tasks.byDate('2026-09-27').find((t) => t.track === 'quran');
    service.complete(q?.id ?? 0);
    expect(service.quranState().pages[603]?.memorizedDate).toBe('2026-09-27');
    service.uncomplete(q?.id ?? 0);
    expect(service.quranState().pages[603]?.memorizedDate).toBeNull();
    // Still consistent and one Quran task per day.
    for (const d of dateRange('2026-09-27', '2026-10-03')) {
      expect(service.tasks.byDate(d).filter((t) => t.track === 'quran')).toHaveLength(1);
    }
    // Every day's generated minutes plus its optional buffer still equal its capacity.
    for (const d of dateRange('2026-09-27', '2026-10-03')) {
      const v = service.dayView(d);
      expect(v.plannedMinutes + v.bufferMinutes, d).toBe(v.capacity.total);
    }
  });

  it('manual extra Quran pages memorize the next pages without changing the alternation', () => {
    ctx = makeTestApp('2026-09-27');
    const { service } = ctx;
    service.ensureWeek('2026-09-27');
    const q = service.tasks.byDate('2026-09-27').find((t) => t.track === 'quran');
    service.complete(q?.id ?? 0);
    const extra = service.createManual({ track: 'quran', title: 'Extra pages', minutes: 30, type: 'memorize', pagesCount: 2 });
    expect(extra.quranPages).toEqual([603, 602]);
    expect(extra.earnedPoints).toBe(150);
    const state = service.quranState();
    expect(state.lastCompletedSessionType).toBe('memorize');
    const mon = service.tasks.byDate('2026-09-28').find((t) => t.track === 'quran');
    expect(mon?.type).toBe('quran-review');
    const tue = service.tasks.byDate('2026-09-29').find((t) => t.track === 'quran');
    expect(tue?.quranPages).toEqual([601]);
  });
});
