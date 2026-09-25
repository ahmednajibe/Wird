/**
 * Honest projections based on remaining work and normal-week capacity.
 * Progress uses credited minutes (review counts 50%), so weekly pace is the
 * credited pace, not the raw scheduled minutes.
 */
import { modulesFor } from './curriculum.js';
import { addDays, diffDays } from './dates.js';
import type { NormalWeekDay, StreamWeekly } from './planner.js';
import { weeklyMinutesByStream } from './planner.js';
import type { ModuleLedger } from './progress.js';
import { memorizedCount, memorizedPages, type QuranProjection, type QuranState } from './quran.js';
import { QURAN_PAGES } from './quranData.js';
import type { IsoDate, StreamId, TrackId } from './types.js';
import { STUDY_TRACK_STREAMS } from './types.js';

export interface PhaseProjection {
  phaseId: string;
  title: string;
  remainingMinutes: number;
  projectedCompletionDate: IsoDate | null;
  completed: boolean;
}

export interface StreamProjection {
  track: TrackId;
  stream: StreamId;
  totalMinutes: number;
  remainingMinutes: number;
  weeklyPlannedMinutes: number;
  weeklyCreditedMinutes: number;
  weeksRemaining: number | null;
  projectedCompletionDate: IsoDate | null;
  phases: PhaseProjection[];
}

function projectDate(today: IsoDate, remaining: number, weekly: number): IsoDate | null {
  if (remaining <= 0) return today;
  if (weekly <= 0) return null;
  return addDays(today, Math.ceil((remaining / weekly) * 7));
}

export function streamProjections(
  ledger: ModuleLedger,
  normalWeek: readonly NormalWeekDay[],
  today: IsoDate,
): StreamProjection[] {
  const weekly = weeklyMinutesByStream(normalWeek);
  return STUDY_TRACK_STREAMS.map(({ track, stream }) => {
    const w: StreamWeekly = weekly.find((x) => x.track === track && x.stream === stream) ?? {
      track,
      stream,
      plannedMinutes: 0,
      creditedMinutes: 0,
    };
    const modules = modulesFor(track, stream);
    const phases: PhaseProjection[] = [];
    let cumulative = 0;
    for (const m of modules) {
      cumulative += ledger.remainingOf(m.id);
      let ph = phases.find((p) => p.phaseId === m.phase.id);
      if (!ph) {
        ph = { phaseId: m.phase.id, title: m.phase.title, remainingMinutes: 0, projectedCompletionDate: null, completed: true };
        phases.push(ph);
      }
      ph.remainingMinutes += ledger.remainingOf(m.id);
      if (!ledger.isComplete(m.id)) ph.completed = false;
      // Phase completes when all work up to and including its last module is done.
      ph.projectedCompletionDate = projectDate(today, cumulative, w.creditedMinutes);
    }
    const remaining = cumulative;
    return {
      track,
      stream,
      totalMinutes: modules.reduce((a, m) => a + m.estMinutes, 0),
      remainingMinutes: Math.round(remaining),
      weeklyPlannedMinutes: w.plannedMinutes,
      weeklyCreditedMinutes: Math.round(w.creditedMinutes * 10) / 10,
      weeksRemaining: w.creditedMinutes > 0 ? Math.round((remaining / w.creditedMinutes) * 10) / 10 : null,
      projectedCompletionDate: projectDate(today, remaining, w.creditedMinutes),
      phases: phases.map((p) => ({ ...p, remainingMinutes: Math.round(p.remainingMinutes) })),
    };
  });
}

/**
 * Quran projection. Planned pace: memorize sessions alternate with review, so
 * with one page per memorize session the pace is (active days per week) / 2.
 * Actual pace is reported once at least 14 days of data exist.
 */
export function quranProjection(
  state: QuranState,
  activeDaysPerWeek: number,
  today: IsoDate,
  actualWindowDays = 28,
): QuranProjection {
  const memorized = memorizedCount(state);
  const remaining = QURAN_PAGES - memorized;
  const plannedPagesPerWeek = activeDaysPerWeek / 2;
  const pages = memorizedPages(state);
  const first = pages.reduce<IsoDate | null>(
    (min, p) => (p.memorizedDate !== null && (min === null || p.memorizedDate < min) ? p.memorizedDate : min),
    null,
  );
  const daysOfData = first ? diffDays(first, today) + 1 : 0;
  let actualPagesPerWeek: number | null = null;
  let actualCompletionDate: IsoDate | null = null;
  if (daysOfData >= 14) {
    const windowDays = Math.min(actualWindowDays, daysOfData);
    const windowStart = addDays(today, -(windowDays - 1));
    const inWindow = pages.filter((p) => p.memorizedDate !== null && p.memorizedDate >= windowStart).length;
    actualPagesPerWeek = Math.round((inWindow / windowDays) * 7 * 100) / 100;
    actualCompletionDate = projectDate(today, remaining, actualPagesPerWeek);
  }
  return {
    memorized,
    remaining,
    plannedPagesPerWeek,
    plannedCompletionDate: projectDate(today, remaining, plannedPagesPerWeek),
    actualPagesPerWeek,
    actualCompletionDate,
    daysOfData,
  };
}
