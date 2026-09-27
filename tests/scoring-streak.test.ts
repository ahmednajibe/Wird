import { describe, expect, it } from 'vitest';
import { addDays, dateRange } from '../src/shared/dates.js';
import { completionPoints, effectiveMinutes, plannedPoints, priorityOf, type ScorableTask } from '../src/shared/scoring.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import { baselineFor, computeBaseline, computeStreak, levelFor, levelThreshold, type DayRecord } from '../src/shared/streak.js';

const ctx = { memorizeSessionMinutes: 40 };
const gen = (p: Partial<ScorableTask> & Pick<ScorableTask, 'type' | 'plannedMinutes' | 'track'>): ScorableTask => ({
  source: 'generated',
  offCurriculum: false,
  ...p,
});

const quranMemorize40 = plannedPoints(gen({ track: 'quran', type: 'quran-memorize', plannedMinutes: 40 }), ctx).points;
const quranReview15 = plannedPoints(gen({ track: 'quran', type: 'quran-review', plannedMinutes: 15 }), ctx).points;
const warmup20 = plannedPoints(gen({ track: 'animation', type: 'practice', plannedMinutes: 20 }), ctx).points;
const deepAi75 = plannedPoints(gen({ track: 'ai', type: 'learn', plannedMinutes: 75 }), ctx).points;

describe('scoring', () => {
  it('computes the reference task points', () => {
    console.log('Points:', JSON.stringify({ quranMemorize40, quranReview15, warmup20, deepAi75 }));
    expect(quranMemorize40).toBe(75); // 40 * 1.5 * 1.25
    expect(quranReview15).toBe(24); // 15 * 1.3 * 1.25 = 24.375
    expect(warmup20).toBe(22); // 20 * 1.1
    expect(deepAi75).toBe(90); // 75 * 1.2
  });

  it('priorities', () => {
    expect(priorityOf({ track: 'quran', source: 'manual', offCurriculum: false })).toBe(1.25);
    expect(priorityOf({ track: 'ai', source: 'generated', offCurriculum: false })).toBe(1);
    expect(priorityOf({ track: 'ai', source: 'manual', offCurriculum: false })).toBe(1);
    expect(priorityOf({ track: 'ai', source: 'manual', offCurriculum: true })).toBe(0.85);
    expect(plannedPoints({ track: 'fsd', type: 'build', source: 'manual', offCurriculum: true, plannedMinutes: 60 }, ctx).points).toBe(66);
  });

  it('clamps minutes to [5, 180] and caps actual minutes at 2x planned', () => {
    expect(plannedPoints(gen({ track: 'ai', type: 'learn', plannedMinutes: 2 }), ctx).points).toBe(6); // 5 * 1.2
    expect(plannedPoints(gen({ track: 'ai', type: 'learn', plannedMinutes: 300 }), ctx).points).toBe(216); // 180 * 1.2
    expect(effectiveMinutes({ plannedMinutes: 30, actualMinutes: 90 })).toBe(60);
    expect(effectiveMinutes({ plannedMinutes: 30, actualMinutes: 1 })).toBe(5);
    expect(effectiveMinutes({ plannedMinutes: 30, actualMinutes: null })).toBe(30);
    expect(completionPoints(gen({ track: 'ai', type: 'learn', plannedMinutes: 30, actualMinutes: 45 }), ctx).points).toBe(54);
  });

  it('extra Quran pages earn one memorize session of points per page', () => {
    const p = plannedPoints(
      { track: 'quran', type: 'quran-memorize', source: 'manual', offCurriculum: false, plannedMinutes: 20, pagesCount: 2 },
      ctx,
    );
    expect(p.points).toBe(150);
  });
});

describe('baseline', () => {
  const b = computeBaseline(DEFAULT_SETTINGS);

  it('is derived from the normal-week plan with factor 0.28', () => {
    console.log('Baseline:', JSON.stringify({ avg: b.avgDailyPlannedPoints, week: b.normalWeekPlannedPoints, normal: b.normal, fasting: b.fasting, perDay: b.perDay.map((d) => d.plannedPoints) }));
    expect(b.factor).toBe(0.28);
    // Fixed daily caps: review-day buffers (3 x 25 min) are not planned, so not scored.
    expect(b.normalWeekPlannedPoints).toBe(1059);
    expect(b.avgDailyPlannedPoints).toBeCloseTo(151.29, 2);
    expect(b.normal).toBe(42); // round(0.28 x 151.29) = round(42.36)
    expect(b.fasting).toBe(25); // round(42 x 0.6) = round(25.2)
    expect(b.quranReserveMinutes).toBe(40);
    expect(b.effectiveReviewCapMinutes).toBe(40);
    expect(b.normalWeekBufferMinutes).toBe(75);
    expect(b.text).toMatch(/reserves 40 min for Quran/);
    expect(b.text).toMatch(/Review sessions are capped at 40 min/);
    expect(baselineFor(b, { isFasting: false, isRestDay: true })).toBe(0);
    expect(b.text).toMatch(/two daily core habits/);
  });

  describe('off day: only the two core habits (Quran session + drawing warm-up) keep the streak', () => {
    const warmup15 = plannedPoints(gen({ track: 'animation', type: 'practice', plannedMinutes: 15 }), ctx).points;
    const cases = [
      { name: 'normal memorize day: Quran memorize (40) only', points: quranMemorize40, baseline: b.normal },
      { name: 'normal review day: Quran review (15) + warm-up (20)', points: quranReview15 + warmup20, baseline: b.normal },
      { name: 'fasting memorize day: Quran memorize (40) only', points: quranMemorize40, baseline: b.fasting },
      { name: 'fasting review day: Quran review (15) + warm-up (15)', points: quranReview15 + warmup15, baseline: b.fasting },
    ];
    for (const c of cases) {
      it(c.name, () => {
        console.log(`${c.name}: ${c.points} points vs baseline ${c.baseline}`);
        expect(c.points).toBeGreaterThanOrEqual(c.baseline);
      });
    }
    it('Quran review alone is not enough on a normal day', () => {
      expect(quranReview15).toBeLessThan(b.normal);
    });
  });
});

describe('streak', () => {
  const day = (date: string, earned: number, opts: Partial<DayRecord> = {}): DayRecord => ({
    date,
    earned,
    baseline: 57,
    isRestDay: false,
    ...opts,
  });

  it('counts consecutive days; today in progress does not break it', () => {
    const t = '2026-09-25';
    const days = dateRange('2026-09-20', t).map((d) => day(d, d === t ? 0 : 60));
    days[0] = day('2026-09-20', 10); // broken on the 20th
    const s = computeStreak(days, t);
    expect(s.todayCounts).toBe(false);
    expect(s.current).toBe(4); // 21..24
    expect(s.longest).toBe(4);
    const withToday = computeStreak(days.map((d) => (d.date === t ? day(t, 80) : d)), t);
    expect(withToday.current).toBe(5);
    expect(withToday.todayCounts).toBe(true);
  });

  it('a missed past day breaks the streak', () => {
    const t = '2026-09-25';
    const days = dateRange('2026-09-20', t).map((d) => day(d, d === '2026-09-24' ? 0 : 60));
    expect(computeStreak(days, t).current).toBe(1);
    expect(computeStreak(days, t).longest).toBe(4);
  });

  it('rest days neither break nor extend the streak', () => {
    const t = '2026-09-25';
    const days = dateRange('2026-09-20', t).map((d) => day(d, 60));
    days[2] = day('2026-09-22', 0, { isRestDay: true, baseline: 0 });
    days[3] = day('2026-09-23', 500, { isRestDay: true, baseline: 0 });
    const s = computeStreak(days, t);
    expect(s.current).toBe(4); // 20, 21, 24, 25 (rest days skipped)
    expect(s.longest).toBe(4);
  });

  it('fasting-day baseline applies per day', () => {
    const t = '2026-09-25';
    const days = [day(addDays(t, -1), 40, { baseline: 34 }), day(t, 40, { baseline: 57 })];
    const s = computeStreak(days, t);
    expect(s.current).toBe(1);
    expect(s.todayCounts).toBe(false);
  });
});

describe('levels', () => {
  it('uses increasing thresholds 300 * n * (n + 1) / 2', () => {
    expect(levelThreshold(1)).toBe(0);
    expect(levelThreshold(2)).toBe(300);
    expect(levelThreshold(3)).toBe(900);
    expect(levelFor(0)).toMatchObject({ level: 1, pointsIntoLevel: 0, pointsForNextLevel: 300 });
    expect(levelFor(299).level).toBe(1);
    expect(levelFor(300)).toMatchObject({ level: 2, pointsIntoLevel: 0, pointsForNextLevel: 600 });
    expect(levelFor(1000)).toMatchObject({ level: 3, pointsIntoLevel: 100, pointsForNextLevel: 900, pointsToNextLevel: 800 });
  });
});
