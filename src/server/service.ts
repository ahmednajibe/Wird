/**
 * Application service: orchestrates repositories and the pure engine.
 * Planning lifecycle, task commands, and Quran synchronisation live here.
 */
import { dayCapacity, fastingInfo, toHijri, type DayCapacity } from '../shared/calendar.js';
import { buildCatalog, type Catalog } from '../shared/catalog.js';
import { addDays, dateRange, dayOfWeek, DOW_NAMES, maxDate, today as cairoToday, weekEnd } from '../shared/dates.js';
import {
  planDays,
  replanStream,
  streamKeyOf,
  type KeptMinutes,
  type PlanDayInput,
  type SessionCounters,
  type StreamSlotItem,
} from '../shared/planner.js';
import { buildLedger, creditMinutes, type CreditEvent, type ModuleLedger } from '../shared/progress.js';
import {
  applySession,
  buildSession,
  deriveQuranState,
  nextPages,
  plannedMemorizeMinutes,
  quranReserveMinutes,
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
import { isQuranType } from '../shared/types.js';
import { transaction, type Db } from './db.js';
import { badRequest, conflict, notFound } from './errors.js';
import { DayOverrideRepo, type DaySnapshot, MetaRepo, ModuleStateRepo, SettingsRepo, SummaryRepo } from './repoMisc.js';
import { PlannedDaysRepo, TaskRepo } from './repoTasks.js';
import { OWNER_CATALOG_DATA } from './seed/ownerCatalog.js';

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** How far ahead weeks may be planned and persisted. */
export const MAX_WEEKS_AHEAD = 26;

/** meta key: first Cairo date that is tracked (planned, scored, streaked). */
export const TRACKING_START_KEY = 'tracking_start_date';

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
  /**
   * Optional buffer: the day's Quran reservation minus its Quran session.
   * Never planned as tasks and never scored.
   */
  bufferMinutes: number;
  /** The day is before the tracking start date ("Not started"). */
  beforeStart: boolean;
  baseline: number;
  /** Baseline snapshot used for the day (frozen for past days). */
  baselineSnapshot: DaySnapshot & { frozen: boolean };
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
    readonly catalog: Catalog = buildCatalog(OWNER_CATALOG_DATA),
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
      if (!t.moduleId || isQuranType(t.type)) continue;
      events.push({
        moduleId: t.moduleId,
        minutes: creditMinutes(t.type, effectiveMinutes(t)),
        at: t.completedAt ?? `${t.completedDate ?? t.date}T00:00:00.000Z`,
      });
    }
    return buildLedger(this.catalog, this.modules.all(), events);
  }

  quranState(): QuranState {
    return deriveQuranState(this.tasks.completedQuran());
  }

  scoringContext(settings: Settings = this.settings(), state: QuranState = this.quranState()): ScoringContext {
    return { memorizeSessionMinutes: plannedMemorizeMinutes(state, settings.quran) };
  }

  baseline(settings: Settings = this.settings()): BaselineExplanation {
    return computeBaseline(settings, this.catalog);
  }

  /**
   * First tracked date. Set to today (Cairo) the first time it is needed;
   * never hardcoded. Dates before it are never planned, scored or streaked.
   */
  trackingStartDate(): IsoDate {
    const stored = this.meta.get(TRACKING_START_KEY);
    if (stored) return stored;
    const t = this.today();
    this.meta.set(TRACKING_START_KEY, t);
    return t;
  }

  /** First date that may be planned: max(today, tracking start). */
  planFloor(): IsoDate {
    return maxDate(this.today(), this.trackingStartDate());
  }

  /** Daily Quran reservation R from the real Quran state. */
  quranReserve(settings: Settings = this.settings(), state: QuranState = this.quranState()): number {
    return quranReserveMinutes(state, settings.quran);
  }

  // ----------------------------------------------------------- planning

  private assertPlannable(date: IsoDate): void {
    const limit = addDays(weekEnd(this.today()), MAX_WEEKS_AHEAD * 7);
    if (date > limit) throw badRequest(`Cannot plan more than ${MAX_WEEKS_AHEAD} weeks ahead`);
  }

  /** Plans every not-yet-planned day in [today, end of the week of `date`]. */
  ensureWeek(date: IsoDate): number {
    const t = this.planFloor();
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
    const t = this.planFloor();
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
    const t = this.planFloor();
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

    // Simulate pending generated work that happens before the first target
    // day, and continue each stream's session numbering after it.
    const ledger = this.ledger();
    const sessions: SessionCounters = new Map();
    for (const { track, stream } of this.catalog.studyStreams()) {
      sessions.set(streamKeyOf(track, stream), this.tasks.countCompletedGenerated(track, stream) + 1);
    }
    for (const task of rangeTasks) {
      if (task.date >= first || target.has(task.date)) continue;
      if (task.source !== 'generated' || task.status !== 'pending' || isQuranType(task.type)) continue;
      const key = streamKeyOf(task.track, task.stream);
      sessions.set(key, (sessions.get(key) ?? 1) + 1);
      if (task.moduleId) ledger.apply(task.moduleId, creditMinutes(task.type, task.plannedMinutes));
    }

    // Project Quran sessions from today, assuming completion.
    let qState = this.quranState();
    const reserve = this.quranReserve(settings, qState);
    const quranSessions = new Map<IsoDate, QuranSessionPlan>();
    for (const d of dateRange(t, last)) {
      const dayTasks = tasksByDate.get(d) ?? [];
      const quranTask = dayTasks.find((x) => isQuranType(x.type) && x.source === 'generated');
      const cap = dayCapacity(d, settings, overrides.get(d));
      let active: boolean;
      if (target.has(d)) {
        active = cap.total > 0 && (!quranTask || quranTask.status === 'pending');
      } else {
        active = quranTask ? quranTask.status === 'pending' : !plannedSet.has(d) && cap.total > 0;
      }
      if (!active) continue;
      const session = buildSession(qState, settings);
      quranSessions.set(d, session);
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
        quranReserve: reserve,
        quran: quranSessions.get(d) ?? null,
        kept,
      };
    });

    const plan = planDays(inputs, settings, ledger, sessions);
    const nowIso = this.nowIso();
    let created = 0;
    for (const d of sorted) {
      for (const task of plan.get(d) ?? []) {
        this.tasks.insertPlanned(task, nowIso);
        created++;
      }
      this.plannedDays.mark(d, nowIso, reserve);
    }
    return created;
  }

  /**
   * Re-derives type/content/length of today's and future uncompleted
   * generated Quran tasks from the real Quran state. Study caps do not depend
   * on the Quran session (only on the fixed reservation R), so a changed
   * session is updated in place and the rest of the day is untouched; only
   * when R itself changes (the rolling memorize average moved) are the
   * affected days re-planned.
   */
  syncQuranTasks(): { updated: number; replanned: boolean } {
    const t = this.planFloor();
    const settings = this.settings();
    let state = this.quranState();
    const reserve = this.quranReserve(settings, state);
    const maxPlanned = this.plannedDays.maxPlanned();
    if (!maxPlanned || maxPlanned < t) return { updated: 0, replanned: false };
    return transaction(this.db, () => {
      const stale = [...this.plannedDays.reservesIn(t, maxPlanned)]
        .filter(([, r]) => r !== reserve)
        .map(([d]) => d)
        .sort();
      if (stale.length > 0) {
        this.regenerate(stale[0] as IsoDate, maxPlanned);
        return { updated: 0, replanned: true };
      }
      const pending = this.tasks.pendingGeneratedFrom(t).filter((x) => isQuranType(x.type));
      const byDate = new Map(pending.map((x) => [x.date, x]));
      let updated = 0;
      for (const d of dateRange(t, pending[pending.length - 1]?.date ?? t)) {
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
        this.tasks.updateQuranContent(task.id, {
          type,
          title: session.title,
          description: session.description,
          pages: session.pages,
          minutes: session.minutes,
        });
        updated++;
      }
      return { updated, replanned: false };
    });
  }

  // ------------------------------------------------------- roll-forward

  /**
   * Rolls missed (past pending) and skipped generated study tasks forward:
   * they become 'rolled', then each affected stream's pending queue from
   * today on is re-planned in place (same dates, slots and minutes; content,
   * module and session numbers from real progress). Other streams and Quran
   * are never touched.
   */
  rollForward(): { rolled: number; streams: string[] } {
    const t = this.today();
    const start = this.trackingStartDate();
    return transaction(this.db, () => {
      const candidates = this.tasks.rollCandidates(start, t);
      if (candidates.length === 0) return { rolled: 0, streams: [] };
      const streams = new Map<string, { track: TrackId; stream: StreamId }>();
      for (const c of candidates) {
        this.tasks.markRolled(c.id);
        streams.set(streamKeyOf(c.track, c.stream), { track: c.track, stream: c.stream });
      }
      for (const { track, stream } of streams.values()) this.replanStreamQueue(track, stream);
      return { rolled: candidates.length, streams: [...streams.keys()] };
    });
  }

  /** Re-plans one stream's pending generated tasks from today, keeping every slot. */
  private replanStreamQueue(track: TrackId, stream: StreamId): number {
    const t = this.planFloor();
    const queue = this.tasks.pendingGeneratedFrom(t).filter((x) => x.track === track && x.stream === stream && x.slotKey);
    if (queue.length === 0) return 0;
    const settings = this.settings();
    const last = queue[queue.length - 1]?.date ?? t;
    const overrides = this.overrides.range(t, last);
    const items: StreamSlotItem[] = queue.map((x) => ({
      date: x.date,
      slotKey: x.slotKey as string,
      plannedMinutes: x.plannedMinutes,
      isFasting: dayCapacity(x.date, settings, overrides.get(x.date)).isFasting,
    }));
    const contents = replanStream(items, this.ledger(), this.tasks.countCompletedGenerated(track, stream) + 1);
    let updated = 0;
    queue.forEach((task, i) => {
      const c = contents[i];
      if (!c) return;
      const same =
        task.type === c.type &&
        task.intensity === c.intensity &&
        task.title === c.title &&
        task.description === c.description &&
        task.moduleId === c.moduleId &&
        task.sessionNo === c.sessionNo;
      if (same) return;
      this.tasks.updateStudyContent(task.id, c);
      updated++;
    });
    return updated;
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
    const trackDef = this.catalog.track(track);
    if (!trackDef || trackDef.archived) throw badRequest(`Unknown track '${track}'`);
    let type: TaskType;
    if (trackDef.kind === 'quran') {
      if (input.type === 'memorize') type = 'quran-memorize';
      else if (input.type === 'review') type = 'quran-review';
      else throw badRequest("Quran tasks must have type 'memorize' or 'review'");
    } else {
      if (input.type === 'memorize') throw badRequest("Type 'memorize' is only valid for the quran track");
      type = input.type;
    }
    let stream: StreamId;
    if (trackDef.kind === 'quran') {
      stream = 'main';
    } else {
      stream = input.stream ?? trackDef.streams.find((s) => !s.archived)?.id ?? 'main';
      const streamDef = this.catalog.stream(track, stream);
      if (!streamDef || streamDef.archived) throw badRequest(`Track '${track}' has no stream '${stream}'`);
    }
    if (input.pagesCount != null && type !== 'quran-memorize') {
      throw badRequest('pagesCount is only valid for quran memorize');
    }
    const offCurriculum = trackDef.kind === 'quran' ? false : Boolean(input.offCurriculum);
    const moduleId = trackDef.kind === 'quran' || offCurriculum ? null : (ledger.current(track, stream)?.id ?? null);
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
    const start = this.trackingStartDate();
    if (date < start) throw badRequest(`Tracking started on ${start}; tasks cannot be logged before that date`);
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
      if (task.status === 'rolled') throw badRequest('This session moved forward to the next slot of its stream; complete it there');
      if (task.date > t) throw badRequest('Cannot complete a task planned for a future date');
      if (actualMinutes !== null && (!Number.isInteger(actualMinutes) || actualMinutes < 1 || actualMinutes > 600)) {
        throw badRequest('actualMinutes must be an integer between 1 and 600');
      }
      const settings = this.settings();
      let quranPages: number[] | undefined;
      if (isQuranType(task.type)) {
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
      if (isQuranType(task.type)) this.syncQuranTasks();
      return this.taskView(this.requireTask(id));
    });
  }

  uncomplete(id: number): TaskView {
    return transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.status === 'pending') return this.taskView(task);
      if (task.status === 'rolled') throw badRequest('A session that moved forward cannot be undone');
      const clearPages = task.type === 'quran-memorize' && task.source === 'manual';
      this.tasks.markPending(id, clearPages);
      if (isQuranType(task.type)) this.syncQuranTasks();
      return this.taskView(this.requireTask(id));
    });
  }

  skip(id: number): TaskView {
    return transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.source !== 'generated') throw badRequest('Only generated tasks can be skipped; delete manual tasks instead');
      if (task.status !== 'pending') throw conflict(`Task is already ${task.status}`);
      if (isQuranType(task.type)) {
        this.tasks.markSkipped(id);
        this.syncQuranTasks();
      } else {
        // Skip = move this session to the next slot of the same stream.
        this.tasks.markRolled(id);
        this.replanStreamQueue(task.track, task.stream);
      }
      return this.taskView(this.requireTask(id));
    });
  }

  deleteManual(id: number): void {
    transaction(this.db, () => {
      const task = this.requireTask(id);
      if (task.source !== 'manual') throw badRequest('Only manual tasks can be deleted');
      this.tasks.delete(id);
      if (isQuranType(task.type) && task.status === 'completed') this.syncQuranTasks();
    });
  }

  // ------------------------------------------------------------ modules

  completeModule(id: string): void {
    if (!this.catalog.module(id)) throw notFound(`Module ${id} not found`);
    transaction(this.db, () => {
      this.modules.markComplete(id, this.nowIso());
      this.regenerate(this.today());
    });
  }

  resetModule(id: string): void {
    if (!this.catalog.module(id)) throw notFound(`Module ${id} not found`);
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
      // Freeze past days under the settings that were in effect for them.
      this.freezePastDays();
      this.settingsRepo.save(next, this.nowIso());
      if (changed) {
        const t = this.today();
        this.regenerate(t, maxDate(weekEnd(t), this.plannedDays.maxPlanned() ?? t));
      }
      this.freezePastDays();
      return { settings: next, regenerated: changed };
    });
  }

  updateDay(date: IsoDate, body: { fasting: boolean | null; capacityOverride: number | null; note: string | null }): DayView {
    const t = this.today();
    transaction(this.db, () => {
      this.freezePastDays();
      this.overrides.upsert({ date, ...body });
      if (date >= t) {
        this.assertPlannable(date);
        this.regenerate(date);
      }
      this.freezePastDays();
    });
    return this.dayView(date);
  }

  // -------------------------------------------------------------- views

  taskView(task: Task, ctx: ScoringContext = this.scoringContext(), t: IsoDate = this.today()): TaskView {
    const status: TaskStatus = task.status === 'pending' && task.date < t ? 'missed' : task.status;
    return {
      ...task,
      status,
      plannedPoints: task.status === 'rolled' ? 0 : plannedPoints(task, ctx).points,
      earnedPoints: task.status === 'completed' ? task.points : null,
    };
  }

  /** Earned points per completion date. */
  earnedByDate(): Map<IsoDate, number> {
    const start = this.trackingStartDate();
    const map = new Map<IsoDate, number>();
    for (const task of this.tasks.completed()) {
      if (!task.completedDate || task.completedDate < start) continue;
      map.set(task.completedDate, (map.get(task.completedDate) ?? 0) + (task.points ?? 0));
    }
    return map;
  }

  /**
   * Baseline snapshots per day. Streaks must never be lost retroactively, so:
   * - past days (date < today) use the snapshot stored in daily_summary,
   *   which is written the first time the day is evaluated and never updated
   *   once the day is past;
   * - a past day without a snapshot (never evaluated) is frozen now;
   * - today and future days use the current settings (today's snapshot is
   *   refreshed on every evaluation).
   * Snapshots are persisted only for days from the first activity (and the
   * tracking start) to today. Days before the tracking start get an empty,
   * never-persisted snapshot (baseline 0).
   */
  daySnapshots(from: IsoDate, to: IsoDate): Map<IsoDate, DaySnapshot & { frozen: boolean }> {
    const t = this.today();
    const start = this.trackingStartDate();
    const first = maxDate(this.tasks.firstActivityDate() ?? t, start);
    const settings = this.settings();
    const expl = this.baseline(settings);
    const overrides = this.overrides.range(from, to);
    const stored = this.summary.range(from, to);
    const nowIso = this.nowIso();
    const out = new Map<IsoDate, DaySnapshot & { frozen: boolean }>();
    for (const d of dateRange(from, to)) {
      if (d < start) {
        out.set(d, { baseline: 0, isRestDay: false, isFasting: false, frozen: false });
        continue;
      }
      const row = stored.get(d);
      if (d < t && row) {
        out.set(d, { baseline: row.baseline, isRestDay: row.isRestDay, isFasting: row.isFasting, frozen: true });
        continue;
      }
      const cap = dayCapacity(d, settings, overrides.get(d));
      const snap: DaySnapshot = { baseline: baselineFor(expl, cap), isRestDay: cap.isRestDay, isFasting: cap.isFasting };
      const persist = d >= first && d <= t;
      if (persist && d < t) this.summary.insertSnapshotIfMissing(d, snap, t, nowIso);
      if (persist && d === t) this.summary.upsertSnapshot(d, snap, t, nowIso);
      out.set(d, { ...snap, frozen: persist && d < t });
    }
    return out;
  }

  /** Freezes every past day since the first activity that has no snapshot yet. */
  freezePastDays(): void {
    const t = this.today();
    const activity = this.tasks.firstActivityDate();
    if (!activity) return;
    const first = maxDate(activity, this.trackingStartDate());
    if (first <= t) this.daySnapshots(first, t);
  }

  dayViews(from: IsoDate, to: IsoDate): DayView[] {
    const t = this.today();
    const start = this.trackingStartDate();
    const settings = this.settings();
    const state = this.quranState();
    const ctx = this.scoringContext(settings, state);
    const currentReserve = this.quranReserve(settings, state);
    const overrides = this.overrides.range(from, to);
    const tasks = this.tasks.byDateRange(from, to);
    const reserves = this.plannedDays.reservesIn(from, to);
    const earned = this.earnedByDate();
    const snapshots = this.daySnapshots(from, to);
    return dateRange(from, to).map((d) => {
      const ov = overrides.get(d) ?? null;
      const fasting = fastingInfo(d, settings, ov);
      const capacity = dayCapacity(d, settings, ov);
      const beforeStart = d < start;
      const views = beforeStart ? [] : tasks.filter((x) => x.date === d).map((x) => this.taskView(x, ctx, t));
      const snap = snapshots.get(d) as DaySnapshot & { frozen: boolean };
      const earnedPoints = beforeStart ? 0 : (earned.get(d) ?? 0);
      const scheduled = views.filter((x) => x.source === 'generated' && x.status !== 'rolled');
      let bufferMinutes = 0;
      if (!beforeStart && capacity.total > 0 && reserves.has(d)) {
        const dayReserve = Math.min(reserves.get(d) ?? currentReserve, capacity.total);
        const quranMinutes = views.filter((x) => x.source === 'generated' && isQuranType(x.type)).reduce((a, x) => a + x.plannedMinutes, 0);
        bufferMinutes = Math.max(0, dayReserve - quranMinutes);
      }
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
        plannedMinutes: scheduled.reduce((a, x) => a + x.plannedMinutes, 0),
        plannedPoints: scheduled.reduce((a, x) => a + x.plannedPoints, 0),
        earnedPoints,
        bufferMinutes,
        beforeStart,
        baseline: snap.baseline,
        baselineSnapshot: snap,
        counts: !beforeStart && dayCounts({ date: d, earned: earnedPoints, baseline: snap.baseline, isRestDay: snap.isRestDay }),
      };
    });
  }

  dayView(date: IsoDate): DayView {
    const v = this.dayViews(date, date)[0];
    if (!v) throw notFound(`Day ${date} not found`);
    return v;
  }

  /**
   * Streak records from the first activity until `asOf`, using frozen
   * snapshots for past days. Earned points are always computed from tasks
   * completed on each date. Also refreshes the cached totals.
   */
  streakRecords(asOf: IsoDate): DayRecord[] {
    const start = this.trackingStartDate();
    if (asOf < start) return [];
    const first = this.tasks.firstActivityDate();
    const from = maxDate(first && first < asOf ? first : asOf, start);
    const snapshots = this.daySnapshots(from, asOf);
    const earned = this.earnedByDate();
    const records: DayRecord[] = dateRange(from, asOf).map((d) => {
      const snap = snapshots.get(d) as DaySnapshot;
      return { date: d, earned: earned.get(d) ?? 0, baseline: snap.baseline, isRestDay: snap.isRestDay };
    });
    const ctx = this.scoringContext();
    const plannedByDate = new Map<IsoDate, number>();
    for (const task of this.tasks.byDateRange(from, asOf)) {
      if (task.source !== 'generated' || task.status === 'rolled') continue;
      plannedByDate.set(task.date, (plannedByDate.get(task.date) ?? 0) + plannedPoints(task, ctx).points);
    }
    this.summary.updateTotals(
      records.map((r) => ({
        date: r.date,
        earnedPoints: r.earned,
        plannedPoints: plannedByDate.get(r.date) ?? 0,
        counts: dayCounts(r),
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
