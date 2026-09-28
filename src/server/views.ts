/**
 * Read models for the API (dashboard, week, tracks, quran, stats, calendar).
 */
import { dayCapacity, fastingInfo, toHijri } from '../shared/calendar.js';
import { addDays, dateRange, dayOfWeek, DOW_NAMES, maxDate, minDate, weekStart } from '../shared/dates.js';
import { normalWeekPlan, weeklyMinutesByStream } from '../shared/planner.js';
import { ModuleLedger } from '../shared/progress.js';
import { quranProjection, streamProjections } from '../shared/projections.js';
import {
  buildSession,
  memorizationOrder,
  memorizedCount,
  nextPage,
  nextSessionType,
  plannedMemorizeMinutes,
  selectReviewPages,
} from '../shared/quran.js';
import { JUZ, juzOfPage, pageContents, pageContentsLabel, QURAN_ATTRIBUTION, QURAN_PAGES, SURAHS, surahLabelForPage } from '../shared/quranData.js';
import { computeStreak, dayCounts, levelFor } from '../shared/streak.js';
import type { IsoDate, Resource } from '../shared/types.js';
import { isQuranType } from '../shared/types.js';
import type { LearningService } from './service.js';

function quranSummary(service: LearningService) {
  const settings = service.settings();
  const state = service.quranState();
  const next = nextPage(state, settings.quran.memorizationOrder);
  const review = selectReviewPages(state, settings.quran);
  return {
    memorized: memorizedCount(state),
    remaining: QURAN_PAGES - memorizedCount(state),
    nextPage: next,
    nextPageSurahs: next ? surahLabelForPage(next) : null,
    nextPageContents: next ? pageContentsLabel(next) : null,
    nextPageJuz: next ? juzOfPage(next) : null,
    nextSessionType: nextSessionType(state),
    lastCompletedSessionType: state.lastCompletedSessionType,
    plannedMemorizeMinutes: plannedMemorizeMinutes(state, settings.quran),
    reviewCycleLength: review.cycleLength,
  };
}

export function dashboard(service: LearningService, date: IsoDate) {
  const t = service.today();
  const trackingStartDate = service.trackingStartDate();
  service.rollForward();
  service.syncQuranTasks();
  service.ensureWeek(t);
  if (date >= t) service.ensureWeek(date);
  const settings = service.settings();
  const day = service.dayView(date);
  const expl = service.baseline(settings);
  const asOf = minDate(date, t);
  const streak = computeStreak(service.streakRecords(asOf), asOf);
  const week = service.dayViews(weekStart(date), addDays(weekStart(date), 6));
  const tasks = [...day.tasks].sort((a, b) => {
    const qa = isQuranType(a.type) ? 0 : 1;
    const qb = isQuranType(b.type) ? 0 : 1;
    if (qa !== qb) return qa - qb;
    if (a.source !== b.source) return a.source === 'generated' ? -1 : 1;
    return a.sortOrder - b.sortOrder || a.id - b.id;
  });
  return {
    date,
    today: t,
    trackingStartDate,
    beforeStart: day.beforeStart,
    bufferMinutes: day.bufferMinutes,
    dayName: day.dayName,
    hijri: day.hijri,
    fasting: { isFasting: day.fasting.isFasting, reasons: day.fasting.reasons, codes: day.fasting.codes },
    capacity: day.capacity,
    override: day.override,
    tasks,
    pointsToday: day.earnedPoints,
    plannedPointsToday: day.plannedPoints,
    baseline: {
      value: day.baseline,
      normal: expl.normal,
      fasting: expl.fasting,
      explanation: expl,
    },
    streak,
    level: levelFor(service.totalPoints()),
    weekSummary: week.map((d) => ({
      date: d.date,
      dayName: d.dayName,
      plannedPoints: d.plannedPoints,
      earnedPoints: d.earnedPoints,
      baseline: d.baseline,
      counts: d.counts,
      fasting: d.baselineSnapshot.isFasting,
      isRestDay: d.baselineSnapshot.isRestDay,
      baselineFrozen: d.baselineSnapshot.frozen,
      capacity: d.capacity.total,
      bufferMinutes: d.bufferMinutes,
      beforeStart: d.beforeStart,
      isPast: d.isPast,
      isToday: d.isToday,
    })),
    quranSummary: quranSummary(service),
  };
}

export function week(service: LearningService, start: IsoDate) {
  const s = weekStart(start);
  const trackingStartDate = service.trackingStartDate();
  service.rollForward();
  service.syncQuranTasks();
  service.ensureWeek(s);
  const days = service.dayViews(s, addDays(s, 6));
  return {
    start: s,
    end: addDays(s, 6),
    trackingStartDate,
    totals: {
      plannedMinutes: days.reduce((a, d) => a + d.plannedMinutes, 0),
      bufferMinutes: days.reduce((a, d) => a + d.bufferMinutes, 0),
      capacity: days.reduce((a, d) => a + d.capacity.total, 0),
      plannedPoints: days.reduce((a, d) => a + d.plannedPoints, 0),
      earnedPoints: days.reduce((a, d) => a + d.earnedPoints, 0),
    },
    days,
  };
}

export function tracks(service: LearningService) {
  const t = service.today();
  const settings = service.settings();
  const ledger = service.ledger();
  const catalog = service.catalog;
  const normal = normalWeekPlan(settings, new ModuleLedger(catalog));
  const projections = streamProjections(ledger, normal, service.planFloor());
  const weekly = weeklyMinutesByStream(normal);
  const groups = catalog.studyStreams().map(({ track, stream }) => {
    const modules = catalog.modulesFor(track, stream);
    const current = ledger.current(track, stream);
    const phases: { id: string; title: string; modules: unknown[] }[] = [];
    for (const m of modules) {
      let ph = phases.find((p) => p.id === m.phase.id);
      if (!ph) {
        ph = { id: m.phase.id, title: m.phase.title, modules: [] };
        phases.push(ph);
      }
      const { warmupDrills: _warmup, archived: _archived, ...moduleView } = m;
      ph.modules.push({ ...moduleView, progress: ledger.progress(m.id), isCurrent: current?.id === m.id });
    }
    return {
      track,
      stream,
      trackLabel: catalog.track(track)?.label ?? track,
      streamLabel: catalog.stream(track, stream)?.label ?? stream,
      currentModuleId: current?.id ?? null,
      currentModuleTitle: current?.title ?? null,
      phases,
      projection: projections.find((p) => p.track === track && p.stream === stream) ?? null,
      unscheduledResources: catalog.data.library.filter((r) => r.track === track && r.stream === stream),
    };
  });
  const quranWeekly = weekly.find((w) => catalog.kindOf(w.track) === 'quran');
  return {
    today: t,
    normalWeekMinutes: weekly,
    normalWeek: {
      capacity: normal.reduce((a, d) => a + d.capacity, 0),
      quranReserveMinutes: normal.reduce((a, d) => a + d.quranReserve, 0),
      quranPlannedMinutes: quranWeekly?.plannedMinutes ?? 0,
      bufferMinutes: normal.reduce((a, d) => a + d.bufferMinutes, 0),
      studyMinutes: weekly.filter((w) => catalog.kindOf(w.track) !== 'quran').reduce((a, w) => a + w.plannedMinutes, 0),
    },
    streams: groups,
    quran: { ...quranSummary(service), weeklyPlannedMinutes: quranWeekly?.plannedMinutes ?? 0 },
    totals: {
      modules: catalog.data.modules.length,
      completedModules: catalog.data.modules.filter((m) => ledger.isComplete(m.id)).length,
    },
  };
}

export function quran(service: LearningService) {
  const t = service.today();
  const settings = service.settings();
  const state = service.quranState();
  const review = selectReviewPages(state, settings.quran);
  const activeDays = settings.capacityByDow.filter((c) => c > 0).length;
  return {
    today: t,
    attribution: QURAN_ATTRIBUTION,
    settings: settings.quran,
    pages: state.pages.map((p) => ({
      page: p.page,
      memorized: p.memorizedDate !== null,
      memorizedDate: p.memorizedDate,
      lastReviewed: p.lastReviewed,
      juz: juzOfPage(p.page),
      surahs: pageContents(p.page).map((seg) => seg.surah),
      segments: pageContents(p.page),
      label: pageContentsLabel(p.page),
    })),
    memorized: memorizedCount(state),
    nextPage: nextPage(state, settings.quran.memorizationOrder),
    nextSessionType: nextSessionType(state),
    nextSession: buildSession(state, settings),
    lastCompletedSessionType: state.lastCompletedSessionType,
    plannedMemorizeMinutes: plannedMemorizeMinutes(state, settings.quran),
    reviewCycle: {
      capPages: review.capPages,
      nearPages: settings.quran.nearPages,
      farPerSession: review.farPerSession,
      cycleLength: review.cycleLength,
      reviewAll: review.reviewAll,
      nextReview: { pages: review.pages, near: review.near, far: review.far, minutes: review.minutes },
    },
    projection: quranProjection(state, activeDays, service.planFloor()),
    order: memorizationOrder(settings.quran.memorizationOrder),
    surahs: SURAHS,
    juz: JUZ,
  };
}

export function stats(service: LearningService) {
  const t = service.today();
  const trackingStartDate = service.trackingStartDate();
  const from = addDays(t, -364);
  const records = service.streakRecords(t);
  const byDate = new Map(records.map((r) => [r.date, r]));
  const snapshots = service.daySnapshots(from, t);
  const daily = dateRange(from, t).map((d) => {
    const r = byDate.get(d);
    const snap = snapshots.get(d);
    const beforeStart = d < trackingStartDate;
    return {
      date: d,
      points: beforeStart ? 0 : (r?.earned ?? 0),
      baseline: beforeStart ? 0 : (r?.baseline ?? snap?.baseline ?? 0),
      counts: !beforeStart && r ? dayCounts(r) : false,
      isRestDay: beforeStart ? false : (r?.isRestDay ?? snap?.isRestDay ?? false),
      beforeStart,
    };
  });
  const completed = service.tasks.completedBetween(maxDate(from, trackingStartDate), t);
  const weeklyMap = new Map<IsoDate, { weekStart: IsoDate; points: number; minutes: number; tasks: number }>();
  const trackMap = new Map<string, { track: string; stream: string; points: number; minutes: number; tasks: number }>();
  for (const task of completed) {
    const d = task.completedDate as IsoDate;
    const ws = weekStart(d);
    const minutes = task.actualMinutes ?? task.plannedMinutes;
    const w = weeklyMap.get(ws) ?? { weekStart: ws, points: 0, minutes: 0, tasks: 0 };
    w.points += task.points ?? 0;
    w.minutes += minutes;
    w.tasks++;
    weeklyMap.set(ws, w);
    const key = `${task.track}/${task.stream}`;
    const tr = trackMap.get(key) ?? { track: task.track, stream: task.stream, points: 0, minutes: 0, tasks: 0 };
    tr.points += task.points ?? 0;
    tr.minutes += minutes;
    tr.tasks++;
    trackMap.set(key, tr);
  }
  const streak = computeStreak(records, t);
  return {
    today: t,
    trackingStartDate,
    daily,
    weekly: [...weeklyMap.values()].sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1)),
    perTrack: [...trackMap.values()],
    totals: {
      points: service.totalPoints(),
      daysCounted: daily.filter((d) => d.counts).length,
    },
    streak,
    level: levelFor(service.totalPoints()),
  };
}

type ResourceAccess = 'owned' | 'free' | 'paid';

function normalizeResource(r: Resource) {
  const access: ResourceAccess = r.owned ? 'owned' : r.paid ? 'paid' : 'free';
  return { name: r.name, url: r.url ?? null, owned: Boolean(r.owned), paid: Boolean(r.paid), access, note: r.note ?? null };
}

/**
 * Every curriculum resource grouped by track/stream (deduplicated by URL or
 * name), with the modules that use it, plus the owned-but-unscheduled ones.
 */
export function resources(service: LearningService) {
  const ledger = service.ledger();
  const catalog = service.catalog;
  const streams = catalog.studyStreams().map(({ track, stream }) => {
    const byKey = new Map<
      string,
      ReturnType<typeof normalizeResource> & {
        modules: { id: string; title: string; phaseId: string; phaseTitle: string; estimateUncertain: boolean; completed: boolean }[];
      }
    >();
    for (const m of catalog.modulesFor(track, stream)) {
      for (const r of m.resources) {
        const key = r.url ?? r.name;
        const entry = byKey.get(key) ?? { ...normalizeResource(r), modules: [] };
        entry.modules.push({
          id: m.id,
          title: m.title,
          phaseId: m.phase.id,
          phaseTitle: m.phase.title,
          estimateUncertain: Boolean(m.estimateUncertain),
          completed: ledger.isComplete(m.id),
        });
        byKey.set(key, entry);
      }
    }
    const list = [...byKey.values()];
    const unscheduled = catalog.data.library.filter((r) => r.track === track && r.stream === stream).map(normalizeResource);
    return {
      track,
      stream,
      trackLabel: catalog.track(track)?.label ?? track,
      streamLabel: catalog.stream(track, stream)?.label ?? stream,
      counts: {
        owned: list.filter((r) => r.access === 'owned').length,
        free: list.filter((r) => r.access === 'free').length,
        paid: list.filter((r) => r.access === 'paid').length,
      },
      resources: list,
      unscheduled,
    };
  });
  return {
    streams,
    modules: catalog.data.modules.map((m) => ({
      id: m.id,
      track: m.track,
      stream: m.stream,
      title: m.title,
      phaseId: m.phase.id,
      phaseTitle: m.phase.title,
      estimateUncertain: Boolean(m.estimateUncertain),
      resources: m.resources.map(normalizeResource),
    })),
    unscheduled: catalog.data.library.map((r) => ({ track: r.track, stream: r.stream, ...normalizeResource(r) })),
  };
}

export function calendar(service: LearningService, from: IsoDate, to: IsoDate) {
  const settings = service.settings();
  const overrides = service.overrides.range(from, to);
  return {
    from,
    to,
    hijriOffsetDays: settings.hijriOffsetDays,
    days: dateRange(from, to).map((d) => {
      const ov = overrides.get(d) ?? null;
      return {
        date: d,
        dow: dayOfWeek(d),
        dayName: DOW_NAMES[dayOfWeek(d)] ?? '',
        hijri: toHijri(d, settings.hijriOffsetDays),
        fasting: fastingInfo(d, settings, ov),
        capacity: dayCapacity(d, settings, ov),
        override: ov,
      };
    }),
  };
}
