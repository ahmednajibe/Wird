/**
 * Daily baseline (derived from real planned capacity), streaks and levels.
 */
import type { Catalog } from './catalog.js';
import { DOW_NAMES } from './dates.js';
import { normalWeekPlan } from './planner.js';
import { ModuleLedger } from './progress.js';
import { effectiveReviewCapMinutes, quranReserveMinutes } from './quran.js';
import { plannedPoints, type ScoringContext } from './scoring.js';
import type { Settings } from './settings.js';
import type { IsoDate } from './types.js';

export interface BaselineExplanation {
  /** Daily Quran reservation R (planned memorize session length). */
  quranReserveMinutes: number;
  /** min(reviewCapMinutes, R). */
  effectiveReviewCapMinutes: number;
  /** Sum of the normal week's daily buffers (reservation minus Quran session). */
  normalWeekBufferMinutes: number;
  normalWeekPlannedPoints: number;
  avgDailyPlannedPoints: number;
  factor: number;
  fastingFactor: number;
  normal: number;
  fasting: number;
  restDay: 0;
  perDay: { dow: number; day: string; isFasting: boolean; capacity: number; plannedPoints: number }[];
  text: string;
  rationale: string;
}

export function computeBaseline(settings: Settings, catalog: Catalog): BaselineExplanation {
  const week = normalWeekPlan(settings, new ModuleLedger(catalog));
  const ctx: ScoringContext = { memorizeSessionMinutes: settings.quran.memorizeMinutes };
  const perDay = week.map((d) => ({
    dow: d.dow,
    day: DOW_NAMES[d.dow] ?? String(d.dow),
    isFasting: d.isFasting,
    capacity: d.capacity,
    plannedPoints: d.tasks.reduce(
      (sum, t) =>
        sum + plannedPoints({ ...t, source: 'generated', offCurriculum: false, actualMinutes: null }, ctx).points,
      0,
    ),
  }));
  const total = perDay.reduce((a, d) => a + d.plannedPoints, 0);
  const avg = total / 7;
  const { factor, fastingFactor } = settings.baseline;
  const normal = Math.round(factor * avg);
  const fasting = Math.round(normal * fastingFactor);
  const reserve = quranReserveMinutes(null, settings.quran);
  const reviewCap = effectiveReviewCapMinutes(settings.quran, reserve);
  const bufferWeek = week.reduce((a, d) => a + d.bufferMinutes, 0);
  return {
    quranReserveMinutes: reserve,
    effectiveReviewCapMinutes: reviewCap,
    normalWeekBufferMinutes: bufferWeek,
    normalWeekPlannedPoints: total,
    avgDailyPlannedPoints: Math.round(avg * 100) / 100,
    factor,
    fastingFactor,
    normal,
    fasting,
    restDay: 0,
    perDay,
    text:
      `A normal week (Mon/Thu fasting) plans ${total} points, ${avg.toFixed(2)} per day. ` +
      `Daily baseline = round(${factor} x ${avg.toFixed(2)}) = ${normal}. ` +
      `Fasting-day baseline = round(${normal} x ${fastingFactor}) = ${fasting}. Rest days (capacity 0) have no baseline and are skipped by the streak. ` +
      `Why this factor: on an off day, doing only the two daily core habits (the day's Quran session plus the drawing warm-up) must keep the streak. ` +
      `Every day reserves ${reserve} min for Quran (the memorize session length), and study tracks share the rest, so a track's time never depends on the day's Quran session. ` +
      `Review sessions are capped at ${reviewCap} min (the review cap, never more than the reservation); the unused part of the reservation is an optional buffer and is never planned or scored. ` +
      `Past days keep the baseline that was in effect for them; later settings changes never affect them.`,
    rationale:
      "On an off day, doing only the two daily core habits (the day's Quran session plus the drawing warm-up) must keep the streak.",
  };
}

export function baselineFor(expl: BaselineExplanation, day: { isFasting: boolean; isRestDay: boolean }): number {
  if (day.isRestDay) return 0;
  return day.isFasting ? expl.fasting : expl.normal;
}

export interface DayRecord {
  date: IsoDate;
  earned: number;
  baseline: number;
  isRestDay: boolean;
}

export function dayCounts(d: DayRecord): boolean {
  return !d.isRestDay && d.earned >= d.baseline;
}

export interface StreakResult {
  current: number;
  longest: number;
  todayCounts: boolean;
}

/**
 * `days` must be chronological and contiguous, ending at `today` (later days
 * are ignored). Rest days are skipped: they neither break nor extend a streak.
 * Today, while in progress, never breaks the streak.
 */
export function computeStreak(days: readonly DayRecord[], today: IsoDate): StreakResult {
  const upToToday = days.filter((d) => d.date <= today);
  const todayRec = upToToday.find((d) => d.date === today);
  const todayCounts = todayRec ? dayCounts(todayRec) : false;

  let longest = 0;
  let run = 0;
  for (const d of upToToday) {
    if (d.isRestDay) continue;
    if (dayCounts(d)) {
      run++;
      longest = Math.max(longest, run);
    } else if (d.date !== today) {
      run = 0;
    }
  }

  let current = 0;
  for (let i = upToToday.length - 1; i >= 0; i--) {
    const d = upToToday[i] as DayRecord;
    if (d.isRestDay) continue;
    if (dayCounts(d)) {
      current++;
      continue;
    }
    if (d.date === today) continue;
    break;
  }
  return { current, longest, todayCounts };
}

export interface LevelInfo {
  level: number;
  totalPoints: number;
  pointsIntoLevel: number;
  /** Size of the current level (points between this level and the next). */
  pointsForNextLevel: number;
  pointsToNextLevel: number;
  currentLevelStart: number;
  nextLevelStart: number;
}

export const LEVEL_STEP = 300;

/** Cumulative points required to reach `level` (level 1 starts at 0). */
export function levelThreshold(level: number): number {
  const n = level - 1;
  return (LEVEL_STEP * n * (n + 1)) / 2;
}

export function levelFor(totalPoints: number): LevelInfo {
  let level = 1;
  while (totalPoints >= levelThreshold(level + 1)) level++;
  const start = levelThreshold(level);
  const next = levelThreshold(level + 1);
  return {
    level,
    totalPoints,
    pointsIntoLevel: totalPoints - start,
    pointsForNextLevel: next - start,
    pointsToNextLevel: next - totalPoints,
    currentLevelStart: start,
    nextLevelStart: next,
  };
}
