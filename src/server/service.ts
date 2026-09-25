/**
 * Application service: orchestrates repositories and the pure engine.
 * Planning lifecycle, task commands, and Quran synchronisation live here.
 */
import { dayCapacity, fastingInfo, toHijri, type DayCapacity } from '../shared/calendar.js';
import { getModule } from '../shared/curriculum.js';
import { addDays, dateRange, dayOfWeek, DOW_NAMES, maxDate, today as cairoToday, weekEnd } from '../shared/dates.js';
import { planDays, type KeptMinutes, type PlanDayInput } from '../shared/planner.js';
import { buildLedger, creditMinutes, type CreditEvent, type ModuleLedger } from '../shared/progress.js';
import {
  applySession,
  buildSession,
  deriveQuranState,
  nextPages,
  plannedMemorizeMinutes,
  selectReviewPages,
  type QuranState,
} from '../shared/quran.js';
import { completionPoints, effectiveMinutes, plannedPoints, type ScoringContext } from '../shared/scoring.js';
import { deepMerge, settingsSchema, type Settings } from '../shared/settings.js';
import { baselineFor, computeBaseline, computeStreak, dayCounts, type BaselineExplanation, type DayRecord } from '../shared/streak.js';
import type {
  DayOverride,
  FastingInfo,
  HijriDate,
  IsoDate,
  QuranSessionPlan,
  StreamId,
  Task,
  TaskStatus,
  TaskType,
  TrackId,
} from '../shared/types.js';
import { transaction, type Db } from './db.js';
import { badRequest, conflict, notFound } from './errors.js';
import { DayOverrideRepo, MetaRepo, ModuleStateRepo, SettingsRepo, SummaryRepo } from './repoMisc.js';
import { PlannedDaysRepo, TaskRepo } from './repoTasks.js';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** How far ahead weeks may be planned and persisted. */
export const MAX_WEEKS_AHEAD = 26;

export interface TaskView extends Omit<Task, 'status'> {
  status: TaskStatus;
  plannedPoints: number;
  earnedPoints: number | null;
}

export interface DayView {
  date: IsoDate;
  dow: number;
  dayName: string;
  hijri: HijriDate;
  fasting: FastingInfo;
  capacity: DayCapacity;
  override: DayOverride | null;
  isPast: boolean;
  isToday: boolean;
  tasks: TaskView[];
  plannedMinutes: number;
  plannedPoints: number;
  earnedPoints: number;
  baseline: number;
  counts: boolean;
}

export interface ManualTaskInput {
  date?: IsoDate;
  track: TrackId;
  stream?: StreamId;
  title: string;
  description?: string;
  minutes: number;
  type: 'learn' | 'practice' | 'build' | 'review' | 'memorize';
  pagesCount?: number | null;
  offCurriculum?: boolean;
  completed?: boolean;
  actualMinutes?: number | null;
}

const PLANNING_KEYS = ['capacityByDow', 'fastingReductionPct', 'fastingRules', 'hijriOffsetDays', 'weeklyTemplate', 'planner', 'quran'] as const;

export class LearningService {
  readonly tasks: TaskRepo;
  readonly plannedDays: PlannedDaysRepo;
  readonly settingsRepo: SettingsRepo;
  readonly overrides: DayOverrideRepo;
  readonly modules: ModuleStateRepo;
  readonly summary: SummaryRepo;
  readonly meta: MetaRepo;

  constructor(
    readonly db: Db,
    readonly clock: Clock = systemClock,
  ) {
    this.tasks = new TaskRepo(db);
    this.plannedDays = new PlannedDaysRepo(db);
    this.settingsRepo = new SettingsRepo(db);
    this.overrides = new DayOverrideRepo(db);
    this.modules = new ModuleStateRepo(db);
    this.summary = new SummaryRepo(db);
    this.meta = new MetaRepo(db);
  }

  // ------------------------------------------------------------ context

  today(): IsoDate {
    return cairoToday(this.clock.now());
  }

  nowIso(): string {
    return this.clock.now().toISOString();
  }

  settings(): Settings {
    return this.settingsRepo.get();
  }

  ledger(): ModuleLedger {
    const events: CreditEvent[] = [];
    for (const t of this.tasks.completed()) {
      if (!t.moduleId || t.track === 'quran') continue;
      events.push({
        moduleId: t.moduleId,
        minutes: creditMinutes(t.type, effectiveMinutes(t)),
        at: t.completedAt ?? `${t.completedDate ?? t.date}T00:00:00.000Z`,
      });
    }
    return buildLedger(this.modules.all(), events);
  }

  quranState(): QuranState {
    return deriveQuranState(this.tasks.completedQuran());
  }

  scoringContext(settings: Settings = this.settings(), state: QuranState = this.quranState()): ScoringContext {
    return { memorizeSessionMinutes: plannedMemorizeMinutes(state, settings.quran) };
  }

  baseline(settings: Settings = this.settings()): BaselineExplanation {
    return computeBaseline(settings);
  }

  // ----------------------------------------------------------- planning

  private assertPlannable(date: IsoDate): void {
    const limit = addDays(weekEnd(this.today()), MAX_WEEKS_AHEAD * 7);
    if (date > limit) throw badRequest(`Cannot plan more than ${MAX_WEEKS_AHEAD} weeks ahead`);
  }

  /** Plans every not-yet-planned day in [today, end of the week of `date`]. */
  ensureWeek(date: IsoDate): number {
    const t = this.today();
    const end = weekEnd(date);
    if (end < t) return 0;
    this.assertPlannable(end);
    const planned = this.plannedDays.plannedIn(t, end);
    const missing = dateRange(t, end).filter((d) => !planned.has(d));
    if (missing.length === 0) return 0;
    return transaction(this.db, () => this.planDates(missing));
  }

  /**
   * Deletes uncompleted generated tasks in [from, to] (never before today),
   * then re-plans those days from real progress. Completed, skipped and
   * manual tasks are never touched. `to` defaults to the end of from's week.
   */
  regenerate(from: IsoDate = this.today(), to?: IsoDate): { from: IsoDate; to: IsoDate; deleted: number; created: number } {
    const t = this.today();
    const start = maxDate(from, t);
    const end = to ?? weekEnd(from);
    if (start > end) return { from: start, to: end, deleted: 0, created: 0 };
    this.assertPlannable(end);
    return transaction(this.db, () => {
      let deleted = 0;
      const planned = this.plannedDays.plannedIn(t, end);
      const dates = dateRange(t, end).filter((d) => d >= start || !planned.has(d));
      for (const d of dates) deleted += this.tasks.deletePendingGeneratedOn(d);
      const created = this.planDates(dates);
      return { from: start, to: end, deleted, created };
    });
  }

  /** Core planner call for a sorted list of dates (all >= today). Returns tasks created. */
  private planDates(dates: IsoDate[]): number {
    if (dates.length === 0) return 0;
    const t = this.today();
    const sorted = [...new Set(dates)].filter((d) => d >= t).sort();
    if (sorted.length === 0) return 0;
    const first = sorted[0] as IsoDate;
    const last = sorted[sorted.length - 1] as IsoDate;
    const target = new Set(sorted);
    const settings = this.settings();
    const overrides = this.overrides.range(t, last);
    const plannedSet = this.plannedDays.plannedIn(t, last);
    const rangeTasks = this.tasks.byDateRange(t, last);
    const tasksByDate = new Map<IsoDate, Task[]>();
    for (const task of rangeTasks) {
      const list = tasksByDate.get(task.date) ?? [];
      list.push(task);
      tasksByDate.set(task.date, list);
    }

    // Simulate pending generated work that happens before the first target day.
    const ledger = this.ledger();
    for (const task of rangeTasks) {
      if (task.date >= first || target.has(task.date)) continue;
      if (task.source !== 'generated' || task.status !== 'pending' || !task.moduleId) continue;
      ledger.apply(task.moduleId, creditMinutes(task.type, task.plannedMinutes));
    }

    // Project Quran sessions from today, assuming completion.
    let qState = this.quranState();
    const sessions = new Map<IsoDate, QuranSessionPlan>();
    for (const d of dateRange(t, last)) {
      const dayTasks = tasksByDate.get(d) ?? [];
      const quranTask = dayTasks.find((x) => x.track === 'quran' && x.source === 'generated');
      const cap = dayCapacity(d, settings, overrides.get(d));
      let active: boolean;
      if (target.has(d)) {
        active = cap.total > 0 && (!quranTask || quranTask.status === 'pending');
      } else {
        active = quranTask ? quranTask.status === 'pending' : !plannedSet.has(d) && cap.total > 0;
      }
      if (!active) continue;
      const session = buildSession(qState, settings);
      sessions.set(d, session);
      qState = applySession(qState, session, d, { affectsAlternation: true });
    }

    const inputs: PlanDayInput[] = sorted.map((d) => {
      const ov = overrides.get(d);
      const cap = dayCapacity(d, settings, ov);
      const kept: KeptMinutes[] = (tasksByDate.get(d) ?? [])
        .filter((x) => x.source === 'generated' && x.status !== 'pending' && x.slotKey)
        .map((x) => ({ slotKey: x.slotKey as string, minutes: x.plannedMinutes }));
      return {
        date: d,
        isFasting: cap.isFasting,
        totalMinutes: cap.total,
        quran: sessions.get(d) ?? null,
        kept,
      };
    });

    const plan = planDays(inputs, settings, ledger);
    const nowIso = this.nowIso();
    let created = 0;
    for (const d of sorted) {
      for (const task of plan.get(d) ?? []) {
        this.tasks.insertPlanned(task, nowIso);
        created++;
      }
      this.plannedDays.mark(d, nowIso);
    }
    return created;
  }

  /**
   * Re-derives type/content of today's and future uncompleted generated Quran
   * tasks from the real Quran state. If a session's length changes, the
   * affected days are re-planned so the day's capacity stays consistent.
   */
  syncQuranTasks(): { updated: number; replanned: boolean } {
    const t = this.today();
    const pending = this.tasks.pendingGeneratedFrom(t).filter((x) => x.track === 'quran');
    if (pending.length === 0) return { updated: 0, replanned: false };
    const settings = this.settings();
    const byDate = new Map(pending.map((x) => [x.date, x]));
    const last = pending[pending.length - 1]?.date ?? t;
    let state = this.quranState();
    let updated = 0;
    let replanFrom: IsoDate | null = null;
    return transaction(this.db, () => {
      for (const d of dateRange(t, last)) {
        const task = byDate.get(d);
        if (!task) continue;
        const session = buildSession(state, settings);
        state = applySession(state, session, d, { affectsAlternation: true });
        const type: TaskType = session.type === 'memorize' ? 'quran-memorize' : 'quran-review';
        const same =
          task.type === type &&
          task.title === session.title &&
          task.description === session.description &&
          task.plannedMinutes === session.minutes &&
          JSON.stringify(task.quranPages) === JSON.stringify(session.pages);
        if (same) continue;
        if (task.plannedMinutes !== session.minutes) {
          replanFrom ??= d;
          continue;
        }
        this.tasks.updateQuranContent(task.id, {
          type,
          title: session.title,
          description: session.description,
          pages: session.pages,
          minutes: session.minutes,
        });
        updated++;
      }
      if (replanFrom) {
        const end = maxDate(this.plannedDays.maxPlanned() ?? last, last);
        this.regenerate(replanFrom, end);
        return { updated, replanned: true };
      }
      return { updated, replanned: false };
    });
  }

  // -------------------------------------------------------------- tasks

  private requireTask(id: number): Task {
    const task = this.tasks.get(id);
    if (!task) throw notFound(`Task ${id} not found`);
    return task;
  }

  private buildManual(input: ManualTaskInput, ledger: ModuleLedger): {
    track: TrackId;
    stream: StreamId;
    type: TaskType;
    moduleId: string | null;
    offCurriculum: boolean;
    pagesCount: number | null;
  } {
    const track = input.track;
    const stream: StreamId = track === 'animation' ? (input.stream ?? 'draw') : 'main';
    if (track === 'animation' && stream === 'main') throw badRequest("Animation tasks need stream 'draw' or 'story'");
    let type: TaskType;
    if (track === 'quran') {
      if (input.type === 'memorize') type = 'quran-memorize';
      else if (input.type === 'review') type = 'quran-review';
      else throw badRequest("Quran tasks must have type 'memorize' or 'review'");
    } else {
      if (input.type === 'memorize') throw badRequest("Type 'memorize' is only valid for the quran track");
      type = input.type;
    }
    const offCurriculum = track === 'quran' ? false : Boolean(input.offCurriculum);
    const moduleId = track === 'quran' || offCurriculum ? null : (ledger.current(track, stream)?.id ?? null);
    const pagesCount = type === 'quran-memorize' ? (input.pagesCount ?? null) : null;
    return { track, stream, type, moduleId, offCurriculum, pagesCount };
  }

  scorePreview(input: ManualTaskInput): { points: number; formula: string; minutes: number; benefit: number; priority: number } {
    const settings = this.settings();
    const built = this.buildManual(input, this.ledger());
    const b = plannedPoints(
      {
        track: built.track,
        type: built.type,
        source: 'manual',
        offCurriculum: built.offCurriculum,
        plannedMinutes: input.minutes,
        actualMinutes: input.actualMinutes ?? null,
        pagesCount: built.pagesCount,
      },
      this.scoringContext(settings),
    );
    return b;
  }

  createManual(input: ManualTaskInput): TaskView {
    const t = this.today();
    const date = input.date ?? t;
    if (date > t) throw badRequest('Manual tasks log work already done; the date cannot be in the future');
    const built = this.buildManual(input, this.ledger());
    const id = transaction(this.db, () => {
      const newId = this.tasks.insertManual(
        {
          date,
          track: built.track,
          stream: built.stream,
          type: built.type,
          intensity: 'normal',
          title: input.title.trim(),
          description: input.description?.trim() ?? '',
          plannedMinutes: input.minutes,
          moduleId: built.moduleId,
          sortOrder: 100,
          quranPages: [],
          pagesCount: built.pagesCount,
          offCurriculum: built.offCurriculum,
        },
        this.nowIso(),
      );
      if (input.completed ?? true) this.complete(newId, input.actualMinutes ?? null);
      return newId;
    });
    return this.taskView(this.requireTask(id));
  }

  complete(id: number, actualMinutes: number | null = null): TaskView {
    const t = this.today();
    return transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.status === 'completed') return this.taskView(task);
      if (task.date > t) throw badRequest('Cannot complete a task planned for a future date');
      if (actualMinutes !== null && (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 600)) {
        throw badRequest('actualMinutes must be an integer between 1 and 600');
      }
      const settings = this.settings();
      let quranPages: number[] | undefined;
      if (task.track === 'quran') {
        // Content is kept current by syncQuranTasks (dashboard load and after
        // every Quran change); only guard against an already-memorized page.
        const state = this.quranState();
        if (task.type === 'quran-memorize') {
          const wanted = task.source === 'generated' ? 1 : (task.pagesCount ?? 0);
          const planned = task.quranPages[0];
          const plannedFree = planned !== undefined && state.pages[planned - 1]?.memorizedDate === null;
          quranPages =
            task.source === 'generated' && plannedFree
              ? [planned]
              : nextPages(state, settings.quran.memorizationOrder, wanted);
        } else {
          quranPages = task.quranPages.length > 0 ? task.quranPages : selectReviewPages(state, settings.quran).pages;
        }
      }
      const ctx = this.scoringContext(settings);
      const points = completionPoints({ ...task, actualMinutes }, ctx).points;
      this.tasks.markCompleted(id, {
        completedDate: t,
        completedAt: this.nowIso(),
        actualMinutes,
        points,
        ...(quranPages ? { quranPages } : {}),
      });
      if (task.track === 'quran') this.syncQuranTasks();
      return this.taskView(this.requireTask(id));
    });
  }

  uncomplete(id: number): TaskView {
    return transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.status === 'pending') return this.taskView(task);
      const clearPages = task.track === 'quran' && task.type === 'quran-memorize' && task.source === 'manual';
      this.tasks.markPending(id, clearPages);
      if (task.track === 'quran') this.syncQuranTasks();
      return this.taskView(this.requireTask(id));
    });
  }

  skip(id: number): TaskView {
    return transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.source !== 'generated') throw badRequest('Only generated tasks can be skipped; delete manual tasks instead');
      if (task.status !== 'pending') throw conflict(`Task is already ${task.status}`);
      this.tasks.markSkipped(id);
      if (task.track === 'quran') this.syncQuranTasks();
      return this.taskView(this.requireTask(id));
    });
  }

  deleteManual(id: number): void {
    transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.source !== 'manual') throw badRequest('Only manual tasks can be deleted');
      this.tasks.delete(id);
      if (task.track === 'quran' && task.status === 'completed') this.syncQuranTasks();
    });
  }

  // ------------------------------------------------------------ modules

  completeModule(id: string): void {
    if (!getModule(id)) throw notFound(`Module ${id} not found`);
    transaction(this.db, () => {
      this.modules.markComplete(id, this.nowIso());
      this.regenerate(this.today());
    });
  }

  resetModule(id: string): void {
    if (!getModule(id)) throw notFound(`Module ${id} not found`);
    transaction(this.db, () => {
      this.modules.reset(id, this.nowIso());
      this.regenerate(this.today());
    });
  }

  // ----------------------------------------------------- settings/days

  updateSettings(patch: unknown): { settings: Settings; regenerated: boolean } {
    const current = this.settings();
    const merged = deepMerge(structuredClone(current), patch);
    const parsed = settingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw badRequest(
        'Invalid settings',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    const next = parsed.data;
    const changed = PLANNING_KEYS.some((k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]));
    return transaction(this.db, () => {
      this.settingsRepo.save(next, this.nowIso());
      if (changed) {
        const t = this.today();
        this.regenerate(t, maxDate(weekEnd(t), this.plannedDays.maxPlanned() ?? t));
      }
      return { settings: next, regenerated: changed };
    });
  }

  updateDay(date: IsoDate, body: { fasting: boolean | null; capacityOverride: number | null; note: string | null }): DayView {
    const t = this.today();
    transaction(this.db, () => {
      this.overrides.upsert({ date, ...body });
      if (date >= t) {
        this.assertPlannable(date);
        this.regenerate(date);
      }
    });
    return this.dayView(date);
  }

  // -------------------------------------------------------------- views

  taskView(task: Task, ctx: ScoringContext = this.scoringContext(), t: IsoDate = this.today()): TaskView {
    const status: TaskStatus = task.status === 'pending' && task.date < t ? 'missed' : task.status;
    return {
      ...task,
      status,
      plannedPoints: plannedPoints(task, ctx).points,
      earnedPoints: task.status === 'completed' ? task.points : null,
    };
  }

  /** Earned points per completion date. */
  earnedByDate(): Map<IsoDate, number> {
    const map = new Map<IsoDate, number>();
    for (const task of this.tasks.completed()) {
      if (!task.completedDate) continue;
      map.set(task.completedDate, (map.get(task.completedDate) ?? 0) + (task.points ?? 0));
    }
    return map;
  }

  dayViews(from: IsoDate, to: IsoDate): DayView[] {
    const t = this.today();
    const settings = this.settings();
    const expl = this.baseline(settings);
    const ctx = this.scoringContext(settings);
    const overrides = this.overrides.range(from, to);
    const tasks = this.tasks.byDateRange(from, to);
    const earned = this.earnedByDate();
    return dateRange(from, to).map((d) => {
      const ov = overrides.get(d) ?? null;
      const fasting = fastingInfo(d, settings, ov);
      const capacity = dayCapacity(d, settings, ov);
      const views = tasks.filter((x) => x.date === d).map((x) => this.taskView(x, ctx, t));
      const baseline = baselineFor(expl, capacity);
      const earnedPoints = earned.get(d) ?? 0;
      return {
        date: d,
        dow: dayOfWeek(d),
        dayName: DOW_NAMES[dayOfWeek(d)] ?? '',
        hijri: toHijri(d, settings.hijriOffsetDays),
        fasting,
        capacity,
        override: ov,
        isPast: d < t,
        isToday: d === t,
        tasks: views,
        plannedMinutes: views.filter((x) => x.source === 'generated').reduce((a, x) => a + x.plannedMinutes, 0),
        plannedPoints: views.filter((x) => x.source === 'generated').reduce((a, x) => a + x.plannedPoints, 0),
        earnedPoints,
        baseline,
        counts: dayCounts({ date: d, earned: earnedPoints, baseline, isRestDay: capacity.isRestDay }),
      };
    });
  }

  dayView(date: IsoDate): DayView {
    const v = this.dayViews(date, date)[0];
    if (!v) throw notFound(`Day ${date} not found`);
    return v;
  }

  /** Streak records from the first activity until `asOf`; also refreshes the daily_summary cache. */
  streakRecords(asOf: IsoDate): DayRecord[] {
    const first = this.tasks.firstActivityDate();
    const from = first && first < asOf ? first : asOf;
    const settings = this.settings();
    const expl = this.baseline(settings);
    const overrides = this.overrides.range(from, asOf);
    const earned = this.earnedByDate();
    const records: DayRecord[] = dateRange(from, asOf).map((d) => {
      const cap = dayCapacity(d, settings, overrides.get(d));
      return { date: d, earned: earned.get(d) ?? 0, baseline: baselineFor(expl, cap), isRestDay: cap.isRestDay };
    });
    const ctx = this.scoringContext(settings);
    const plannedByDate = new Map<IsoDate, number>();
    for (const task of this.tasks.byDateRange(from, asOf)) {
      if (task.source !== 'generated') continue;
      plannedByDate.set(task.date, (plannedByDate.get(task.date) ?? 0) + plannedPoints(task, ctx).points);
    }
    this.summary.upsertMany(
      records.map((r) => ({
        date: r.date,
        earnedPoints: r.earned,
        plannedPoints: plannedByDate.get(r.date) ?? 0,
        baseline: r.baseline,
        counts: dayCounts(r),
        isRestDay: r.isRestDay,
        isFasting: dayCapacity(r.date, settings, overrides.get(r.date)).isFasting,
      })),
      this.nowIso(),
    );
    return records;
  }

  totalPoints(): number {
    let sum = 0;
    for (const v of this.earnedByDate().values()) sum += v;
    return sum;
  }
}

export function computeStreakFor(service: LearningService, asOf: IsoDate): ReturnType<typeof computeStreak> {
  return computeStreak(service.streakRecords(asOf), asOf);
}
