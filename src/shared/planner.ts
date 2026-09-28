/**
 * Day and week planner. Pure: takes capacities, Quran sessions and a module
 * ledger (which is mutated to simulate consumption across days).
 */
import { QURAN_TRACK_ID, streamKey, type Catalog, type StreamDef } from './catalog.js';
import { dayOfWeek } from './dates.js';
import { creditMinutes, ModuleLedger } from './progress.js';
import { effectiveReviewCapMinutes, quranReserveMinutes, reviewMinutesFor } from './quran.js';
import type { Settings, TemplateSlot } from './settings.js';
import type {
  CurriculumModule,
  Intensity,
  IsoDate,
  PlannedTask,
  QuranSessionPlan,
  SlotRole,
  StreamId,
  TaskType,
  TrackId,
} from './types.js';
import { isQuranType } from './types.js';

export interface PlanSlot {
  track: TrackId;
  stream: StreamId;
  role: Exclude<SlotRole, 'quran'>;
  minutes: number;
  slotKey: string;
}

export interface KeptMinutes {
  slotKey: string;
  minutes: number;
}

export interface PlanDayInput {
  date: IsoDate;
  isFasting: boolean;
  /** Total minutes for the day after override and fasting reduction. */
  totalMinutes: number;
  /**
   * Daily Quran reservation R (the planned memorize session length). Study
   * slots are distributed from `totalMinutes - min(R, totalMinutes)`, so their
   * caps never depend on the day's actual Quran session.
   */
  quranReserve: number;
  /** Projected Quran session (null when the day already has a kept Quran task). */
  quran: QuranSessionPlan | null;
  /** Completed, skipped or rolled generated tasks already on this day. */
  kept: KeptMinutes[];
}

/** Next session number per `track/stream` (mutated while planning). */
export type SessionCounters = Map<string, number>;

export function streamKeyOf(track: TrackId, stream: StreamId): string {
  return streamKey(track, stream);
}

function takeSession(counters: SessionCounters, track: TrackId, stream: StreamId): number {
  const key = streamKeyOf(track, stream);
  const n = counters.get(key) ?? 1;
  counters.set(key, n + 1);
  return n;
}

/** Parses 'track/stream/role' (null for the Quran slot or malformed keys). */
export function parseSlotKey(slotKey: string): Pick<PlanSlot, 'track' | 'stream' | 'role'> | null {
  const [track, stream, role] = slotKey.split('/');
  if (!track || !stream || !role) return null;
  if (role !== 'warmup' && role !== 'focus') return null;
  return { track, stream, role };
}

export const QURAN_SLOT_KEY = 'quran';

export function slotKeyOf(track: TrackId, stream: StreamId, role: SlotRole): string {
  return role === 'quran' ? QURAN_SLOT_KEY : `${track}/${stream}/${role}`;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Distributes `remaining` minutes over the day's template.
 * - fixed slots take their minutes (fasting minutes on fasting days) first;
 * - share slots take round(share * minutes left after fixed slots);
 * - the final rest slot (or the last slot) absorbs the remainder so the day's
 *   total always equals its capacity exactly.
 * Slot minutes are multiples of `roundToMinutes` except for that last slot,
 * which can only be off-grid when the capacity itself is (e.g. 72 - 40 = 32).
 * Slots shorter than `minSlotMinutes` are merged into the previous slot (or
 * the next one when there is no previous slot).
 */
export function distributeSlots(
  remaining: number,
  template: readonly TemplateSlot[],
  isFasting: boolean,
  planner: Settings['planner'],
): PlanSlot[] {
  if (remaining <= 0 || template.length === 0) return [];
  const step = planner.roundToMinutes;
  const mins = new Array<number>(template.length).fill(0);
  let left = remaining;

  template.forEach((slot, i) => {
    if (slot.kind !== 'fixed') return;
    const want = isFasting ? (slot.fastingMinutes ?? slot.minutes ?? 0) : (slot.minutes ?? 0);
    const m = Math.min(roundTo(want, step), left);
    mins[i] = m;
    left -= m;
  });
  const afterFixed = left;
  template.forEach((slot, i) => {
    if (slot.kind !== 'share') return;
    const m = Math.min(roundTo(afterFixed * (slot.share ?? 0), step), left);
    mins[i] = m;
    left -= m;
  });
  let restIdx = -1;
  template.forEach((slot, i) => {
    if (slot.kind === 'rest') restIdx = i;
  });
  const sinkIdx = restIdx >= 0 ? restIdx : template.length - 1;
  mins[sinkIdx] = (mins[sinkIdx] ?? 0) + left;

  const slots: PlanSlot[] = [];
  template.forEach((slot, i) => {
    const m = mins[i] ?? 0;
    if (m <= 0) return;
    slots.push({
      track: slot.track,
      stream: slot.stream,
      role: slot.role,
      minutes: m,
      slotKey: slotKeyOf(slot.track, slot.stream, slot.role),
    });
  });

  return mergeShortSlots(slots, planner.minSlotMinutes);
}

export function mergeShortSlots(slots: PlanSlot[], minSlot: number): PlanSlot[] {
  const out = slots.map((s) => ({ ...s }));
  let i = 0;
  while (i < out.length) {
    const s = out[i] as PlanSlot;
    if (s.minutes >= minSlot || out.length === 1) {
      i++;
      continue;
    }
    const prev = out[i - 1];
    const next = out[i + 1];
    if (prev) {
      prev.minutes += s.minutes;
      out.splice(i, 1);
    } else if (next) {
      next.minutes += s.minutes;
      out.splice(i, 1);
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Splits minutes into near-equal chunks of at most `max`, each a multiple of
 * `step` except possibly the last one (which absorbs an off-grid remainder).
 */
export function splitMinutes(minutes: number, max: number, step: number): number[] {
  if (minutes <= 0) return [];
  if (minutes <= max) return [minutes];
  const n = Math.ceil(minutes / max);
  const base = Math.floor(minutes / n / step) * step;
  const chunks = new Array<number>(n).fill(base);
  let left = minutes - base * n;
  for (let i = 0; i < n && left >= step; i++) {
    chunks[i] = (chunks[i] as number) + step;
    left -= step;
  }
  chunks[n - 1] = (chunks[n - 1] as number) + left;
  return chunks;
}

function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh === 0) return `${mm} min`;
  return mm === 0 ? `${hh} h` : `${hh} h ${mm} min`;
}

function resourceLine(m: CurriculumModule): string {
  if (m.resources.length === 0) return '';
  const list = m.resources
    .map((r) => {
      const flags = [r.owned ? 'owned' : null, r.paid ? 'paid' : null, r.note ?? null].filter(Boolean).join(', ');
      return `${r.name}${r.url ? ` <${r.url}>` : ''}${flags ? ` [${flags}]` : ''}`;
    })
    .join('; ');
  return ` Resources: ${list}.`;
}

interface TaskShape {
  type: TaskType;
  intensity: Intensity;
  title: string;
  description: string;
}

/**
 * On fasting days a non-drawing module is only consolidated (review, 50%
 * credit) once at least this many minutes have been credited to it;
 * otherwise it is studied at a relaxed pace (learn, 100% credit).
 */
export const CONSOLIDATE_MIN_CREDIT = 60;

function isDrawSlot(catalog: Catalog, slot: Pick<PlanSlot, 'track' | 'stream'>): boolean {
  return catalog.stream(slot.track, slot.stream)?.style === 'practice';
}

function drillsFor(module: CurriculumModule | null, streamDef: StreamDef | undefined): string {
  return module?.warmupDrills ?? streamDef?.defaultDrills ?? 'Short warm-up drills.';
}

function shapeTask(
  slot: Pick<PlanSlot, 'track' | 'stream' | 'role'>,
  chunk: number,
  sessionNo: number,
  module: CurriculumModule | null,
  isFasting: boolean,
  ledger: ModuleLedger,
): TaskShape {
  const sessionSuffix = ` (session ${sessionNo})`;
  const catalog = ledger.catalog;
  const streamDef = catalog.stream(slot.track, slot.stream);

  // Drawing is a motor skill: it is always practised, never "reviewed".
  if (isDrawSlot(catalog, slot) && isFasting) {
    return {
      type: 'practice',
      intensity: 'light',
      title: `${streamDef?.lightTitle ?? 'Light practice'}: ${module ? module.title : 'open practice'}${sessionSuffix}`,
      description: `Fasting day: short, relaxed drills. ${drillsFor(module, streamDef)}${module ? ` Counts toward: ${module.title}.` : ''}`,
    };
  }
  if (slot.role === 'warmup') {
    return {
      type: 'practice',
      intensity: 'normal',
      title: `${streamDef?.warmupTitle ?? 'Warm-up'}, ${chunk} min${sessionSuffix}`,
      description: `${drillsFor(module, streamDef)}${module ? ` Counts toward: ${module.title}.` : ''}`,
    };
  }
  if (!module) {
    return {
      type: 'practice',
      intensity: isFasting ? 'light' : 'normal',
      title: `Open practice${isFasting ? ' (light)' : ''}: ${catalog.track(slot.track)?.label ?? slot.track}${sessionSuffix}`,
      description: 'All scheduled modules in this stream are complete. Consolidate, polish portfolio pieces, or pick a new resource.',
    };
  }

  const remaining = ledger.remainingOf(module.id);
  const consolidate = isFasting && ledger.creditedOf(module.id) >= CONSOLIDATE_MIN_CREDIT;
  const type: TaskType = consolidate ? 'review' : isFasting ? 'learn' : module.kind === 'project' ? 'build' : 'learn';
  const credit = creditMinutes(type, chunk);
  const next = ledger.nextAfter(module.id);
  const finishing = credit >= remaining && next ? ` Expected to finish this module in this session, then start: ${next.title}.` : '';
  const phase = `${module.phase.id} ${module.phase.title}.`;
  const remainingLine = ` Remaining before this session: about ${formatDuration(remaining)}.`;
  const note = module.note ? ` Note: ${module.note}` : '';

  if (consolidate) {
    return {
      type,
      intensity: 'light',
      title: `Consolidate: ${module.title}${sessionSuffix}`,
      description: `Fasting day: re-read your notes and redo one small exercise. ${phase}${remainingLine}`,
    };
  }
  if (isFasting) {
    return {
      type,
      intensity: 'light',
      title: `Light study: ${module.title}${sessionSuffix}`,
      description: `Fasting day: relaxed pace. Watch or read and take notes; skip heavy exercises. ${phase}${resourceLine(module)}${remainingLine}${finishing}${note}`,
    };
  }
  const warmupHint = isDrawSlot(catalog, slot) ? ` Start with 10 minutes of warm-up: ${drillsFor(module, streamDef)}` : '';
  return {
    type,
    intensity: 'deep',
    title: `${type === 'build' ? 'Build' : 'Deep study'}: ${module.title}${sessionSuffix}`,
    description: `${phase}${resourceLine(module)}${remainingLine}${finishing}${note}${warmupHint}`,
  };
}

/**
 * Plans one day. Mutates `ledger` to simulate the consumption of the planned
 * study minutes, so later days point at later modules, and `sessions` to
 * number each stream's session queue.
 *
 * Caps are fixed per day: the Quran reservation R comes off the top and the
 * study slots share the rest, whatever the day's Quran session actually is.
 * Kept (completed, skipped or rolled) tasks only reduce their own slot.
 */
export function planDay(
  input: PlanDayInput,
  settings: Settings,
  ledger: ModuleLedger,
  sessions: SessionCounters = new Map(),
): PlannedTask[] {
  if (input.totalMinutes <= 0) return [];
  const tasks: PlannedTask[] = [];
  const keptByKey = new Map<string, number>();
  for (const k of input.kept) keptByKey.set(k.slotKey, (keptByKey.get(k.slotKey) ?? 0) + k.minutes);

  if (!keptByKey.has(QURAN_SLOT_KEY) && input.quran) {
    tasks.push({
      date: input.date,
      track: QURAN_TRACK_ID,
      stream: 'main',
      type: input.quran.type === 'memorize' ? 'quran-memorize' : 'quran-review',
      intensity: 'normal',
      title: input.quran.title,
      description: input.quran.description,
      plannedMinutes: input.quran.minutes,
      moduleId: null,
      slotKey: QURAN_SLOT_KEY,
      sortOrder: 0,
      sessionNo: null,
      quranPages: [...input.quran.pages],
    });
  }

  const reserve = Math.min(Math.max(0, input.quranReserve), input.totalMinutes);
  const template = settings.weeklyTemplate[dayOfWeek(input.date)] ?? [];
  const slots = distributeSlots(input.totalMinutes - reserve, template, input.isFasting, settings.planner);

  // Kept tasks only cover minutes of their own slot; nothing leaks across slots.
  for (const slot of slots) {
    const kept = keptByKey.get(slot.slotKey);
    if (kept === undefined) continue;
    slot.minutes -= Math.min(kept, slot.minutes);
  }
  const hadKept = input.kept.some((k) => k.slotKey !== QURAN_SLOT_KEY);

  let order = 1;
  for (const slot of slots) {
    if (slot.minutes <= 0) continue;
    if (hadKept && slot.minutes < settings.planner.minSlotMinutes) continue;
    const chunks = splitMinutes(slot.minutes, settings.planner.maxTaskMinutes, settings.planner.roundToMinutes);
    for (const chunk of chunks) {
      const module = ledger.current(slot.track, slot.stream);
      const sessionNo = takeSession(sessions, slot.track, slot.stream);
      const shape = shapeTask(slot, chunk, sessionNo, module, input.isFasting, ledger);
      tasks.push({
        date: input.date,
        track: slot.track,
        stream: slot.stream,
        type: shape.type,
        intensity: shape.intensity,
        title: shape.title,
        description: shape.description,
        plannedMinutes: chunk,
        moduleId: module?.id ?? null,
        slotKey: slot.slotKey,
        sortOrder: order++,
        sessionNo,
        quranPages: [],
      });
      if (module) ledger.apply(module.id, creditMinutes(shape.type, chunk));
    }
  }
  return tasks;
}

/** Plans consecutive days in order, simulating consumption across them. */
export function planDays(
  inputs: readonly PlanDayInput[],
  settings: Settings,
  ledger: ModuleLedger,
  sessions: SessionCounters = new Map(),
): Map<IsoDate, PlannedTask[]> {
  const out = new Map<IsoDate, PlannedTask[]>();
  for (const input of [...inputs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    out.set(input.date, planDay(input, settings, ledger, sessions));
  }
  return out;
}

// ------------------------------------------------------- roll-forward

/** A stream session whose slot (date, slotKey, minutes) is fixed. */
export interface StreamSlotItem {
  date: IsoDate;
  slotKey: string;
  plannedMinutes: number;
  isFasting: boolean;
}

export interface StreamTaskContent {
  type: TaskType;
  intensity: Intensity;
  title: string;
  description: string;
  moduleId: string | null;
  sessionNo: number;
}

/**
 * Re-plans the content of one stream's queue in order while keeping every
 * slot (date, slotKey, minutes) exactly. Used for roll-forward: the head of
 * the queue gets the next session from the stream's real progress (`ledger`,
 * mutated like in planDay), numbered from `firstSessionNo`.
 */
export function replanStream(items: readonly StreamSlotItem[], ledger: ModuleLedger, firstSessionNo: number): StreamTaskContent[] {
  let sessionNo = firstSessionNo;
  return items.map((item) => {
    const slot = parseSlotKey(item.slotKey);
    if (!slot || ledger.catalog.kindOf(slot.track) !== 'study') throw new Error(`Not a study slot: ${item.slotKey}`);
    const module = ledger.current(slot.track, slot.stream);
    const shape = shapeTask(slot, item.plannedMinutes, sessionNo, module, item.isFasting, ledger);
    if (module) ledger.apply(module.id, creditMinutes(shape.type, item.plannedMinutes));
    return { ...shape, moduleId: module?.id ?? null, sessionNo: sessionNo++ };
  });
}

// ----------------------------------------------------------- normal week

/** A fixed Sunday used for the hypothetical normal week (2000-01-02 is a Sunday). */
export const NORMAL_WEEK_START = '2000-01-02';

export interface NormalWeekDay {
  date: IsoDate;
  dow: number;
  isFasting: boolean;
  capacity: number;
  /** Quran reservation of the day: min(R, capacity). */
  quranReserve: number;
  /** Unplanned part of the reservation (reservation minus the Quran session). */
  bufferMinutes: number;
  tasks: PlannedTask[];
}

/**
 * The hypothetical normal week: only Monday and Thursday fasting, the current
 * capacity/template settings, a fresh curriculum, and a representative Quran
 * state alternating memorize (memorizeMinutes = R) / review (near pages only,
 * 15 min with defaults, never more than R), starting with memorize on Sunday.
 * Every day reserves R for Quran; the study slots share the rest.
 */
export function normalWeekPlan(settings: Settings, ledger: ModuleLedger): NormalWeekDay[] {
  const q = settings.quran;
  const reserve = quranReserveMinutes(null, q);
  const reviewMinutes = reviewMinutesFor(q.nearPages, q, effectiveReviewCapMinutes(q, reserve));
  const sessions: SessionCounters = new Map();
  const days: NormalWeekDay[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const date = `2000-01-${String(2 + dow).padStart(2, '0')}`;
    const isFasting = dow === 1 || dow === 4;
    const base = settings.capacityByDow[dow] ?? 0;
    const capacity = isFasting ? Math.round(base * (1 - settings.fastingReductionPct / 100)) : base;
    const memorize = dow % 2 === 0;
    const quran: QuranSessionPlan = memorize
      ? { type: 'memorize', pages: [604 - dow / 2], minutes: reserve, title: 'Memorize page', description: '' }
      : { type: 'review', pages: [], minutes: reviewMinutes, title: 'Review', description: '' };
    const tasks = planDay({ date, isFasting, totalMinutes: capacity, quranReserve: reserve, quran, kept: [] }, settings, ledger, sessions);
    const dayReserve = capacity > 0 ? Math.min(reserve, capacity) : 0;
    const quranMinutes = tasks.filter((t) => isQuranType(t.type)).reduce((a, t) => a + t.plannedMinutes, 0);
    days.push({ date, dow, isFasting, capacity, quranReserve: dayReserve, bufferMinutes: Math.max(0, dayReserve - quranMinutes), tasks });
  }
  return days;
}

export interface StreamWeekly {
  track: TrackId;
  stream: StreamId;
  plannedMinutes: number;
  creditedMinutes: number;
}

export function weeklyMinutesByStream(week: readonly NormalWeekDay[]): StreamWeekly[] {
  const map = new Map<string, StreamWeekly>();
  for (const d of week) {
    for (const t of d.tasks) {
      const key = `${t.track}/${t.stream}`;
      const cur = map.get(key) ?? { track: t.track, stream: t.stream, plannedMinutes: 0, creditedMinutes: 0 };
      cur.plannedMinutes += t.plannedMinutes;
      cur.creditedMinutes += creditMinutes(t.type, t.plannedMinutes);
      map.set(key, cur);
    }
  }
  return [...map.values()];
}
