/**
 * Day and week planner. Pure: takes capacities, Quran sessions and a module
 * ledger (which is mutated to simulate consumption across days).
 */
import { DEFAULT_WARMUP_DESCRIPTION, WARMUP_DESCRIPTIONS } from './curriculum.js';
import { dayOfWeek } from './dates.js';
import { creditMinutes, ModuleLedger } from './progress.js';
import { reviewMinutesFor } from './quran.js';
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
import { TRACK_LABELS } from './types.js';

export interface PlanSlot {
  track: Exclude<TrackId, 'quran'>;
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
  /** Projected Quran session (null when the day already has a kept Quran task). */
  quran: QuranSessionPlan | null;
  /** Completed or skipped generated tasks already on this day. */
  kept: KeptMinutes[];
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

function isDrawSlot(slot: PlanSlot): boolean {
  return slot.track === 'animation' && slot.stream === 'draw';
}

function drillsFor(module: CurriculumModule | null): string {
  return (module && WARMUP_DESCRIPTIONS[module.id]) ?? DEFAULT_WARMUP_DESCRIPTION;
}

function shapeTask(
  slot: PlanSlot,
  chunk: number,
  part: { index: number; count: number },
  module: CurriculumModule | null,
  isFasting: boolean,
  ledger: ModuleLedger,
): TaskShape {
  const partSuffix = part.count > 1 ? ` (part ${part.index}/${part.count})` : '';

  // Drawing is a motor skill: it is always practised, never "reviewed".
  if (isDrawSlot(slot) && isFasting) {
    return {
      type: 'practice',
      intensity: 'light',
      title: `Light drawing practice: ${module ? module.title : 'open practice'}${partSuffix}`,
      description: `Fasting day: short, relaxed drills. ${drillsFor(module)}${module ? ` Counts toward: ${module.title}.` : ''}`,
    };
  }
  if (slot.role === 'warmup') {
    return {
      type: 'practice',
      intensity: 'normal',
      title: `Drawing warm-up (${chunk} min)`,
      description: `${drillsFor(module)}${module ? ` Counts toward: ${module.title}.` : ''}`,
    };
  }
  if (!module) {
    return {
      type: 'practice',
      intensity: isFasting ? 'light' : 'normal',
      title: `Open practice${isFasting ? ' (light)' : ''}: ${TRACK_LABELS[slot.track]}${partSuffix}`,
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
      title: `Consolidate: ${module.title}${partSuffix}`,
      description: `Fasting day: re-read your notes and redo one small exercise. ${phase}${remainingLine}`,
    };
  }
  if (isFasting) {
    return {
      type,
      intensity: 'light',
      title: `Light study: ${module.title}${partSuffix}`,
      description: `Fasting day: relaxed pace. Watch or read and take notes; skip heavy exercises. ${phase}${resourceLine(module)}${remainingLine}${finishing}${note}`,
    };
  }
  const warmupHint = isDrawSlot(slot) ? ` Start with 10 minutes of warm-up: ${drillsFor(module)}` : '';
  return {
    type,
    intensity: 'deep',
    title: `${type === 'build' ? 'Build' : 'Deep study'}: ${module.title}${partSuffix}`,
    description: `${phase}${resourceLine(module)}${remainingLine}${finishing}${note}${warmupHint}`,
  };
}

/**
 * Plans one day. Mutates `ledger` to simulate the consumption of the planned
 * study minutes, so later days point at later modules.
 */
export function planDay(input: PlanDayInput, settings: Settings, ledger: ModuleLedger): PlannedTask[] {
  if (input.totalMinutes <= 0) return [];
  const tasks: PlannedTask[] = [];
  const keptByKey = new Map<string, number>();
  for (const k of input.kept) keptByKey.set(k.slotKey, (keptByKey.get(k.slotKey) ?? 0) + k.minutes);

  let quranMinutes = 0;
  const keptQuran = keptByKey.get(QURAN_SLOT_KEY);
  if (keptQuran !== undefined) {
    quranMinutes = keptQuran;
    keptByKey.delete(QURAN_SLOT_KEY);
  } else if (input.quran) {
    quranMinutes = input.quran.minutes;
    tasks.push({
      date: input.date,
      track: 'quran',
      stream: 'main',
      type: input.quran.type === 'memorize' ? 'quran-memorize' : 'quran-review',
      intensity: 'normal',
      title: input.quran.title,
      description: input.quran.description,
      plannedMinutes: input.quran.minutes,
      moduleId: null,
      slotKey: QURAN_SLOT_KEY,
      sortOrder: 0,
      quranPages: [...input.quran.pages],
    });
  }

  const remaining = Math.max(0, input.totalMinutes - quranMinutes);
  const template = settings.weeklyTemplate[dayOfWeek(input.date)] ?? [];
  const slots = distributeSlots(remaining, template, input.isFasting, settings.planner);

  // Subtract minutes already covered by kept (completed/skipped) tasks.
  for (const slot of slots) {
    const kept = keptByKey.get(slot.slotKey);
    if (kept === undefined) continue;
    const used = Math.min(kept, slot.minutes);
    slot.minutes -= used;
    if (kept - used > 0) keptByKey.set(slot.slotKey, kept - used);
    else keptByKey.delete(slot.slotKey);
  }
  let unmatched = [...keptByKey.values()].reduce((a, b) => a + b, 0);
  for (let i = slots.length - 1; i >= 0 && unmatched > 0; i--) {
    const slot = slots[i] as PlanSlot;
    const used = Math.min(unmatched, slot.minutes);
    slot.minutes -= used;
    unmatched -= used;
  }
  const hadKept = input.kept.some((k) => k.slotKey !== QURAN_SLOT_KEY);

  let order = 1;
  for (const slot of slots) {
    if (slot.minutes <= 0) continue;
    if (hadKept && slot.minutes < settings.planner.minSlotMinutes) continue;
    const chunks = splitMinutes(slot.minutes, settings.planner.maxTaskMinutes, settings.planner.roundToMinutes);
    chunks.forEach((chunk, idx) => {
      const module = ledger.current(slot.track, slot.stream);
      const shape = shapeTask(slot, chunk, { index: idx + 1, count: chunks.length }, module, input.isFasting, ledger);
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
        quranPages: [],
      });
      if (module) ledger.apply(module.id, creditMinutes(shape.type, chunk));
    });
  }
  return tasks;
}

/** Plans consecutive days in order, simulating consumption across them. */
export function planDays(
  inputs: readonly PlanDayInput[],
  settings: Settings,
  ledger: ModuleLedger,
): Map<IsoDate, PlannedTask[]> {
  const out = new Map<IsoDate, PlannedTask[]>();
  for (const input of [...inputs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    out.set(input.date, planDay(input, settings, ledger));
  }
  return out;
}

// ----------------------------------------------------------- normal week

/** A fixed Sunday used for the hypothetical normal week (2000-01-02 is a Sunday). */
export const NORMAL_WEEK_START = '2000-01-02';

export interface NormalWeekDay {
  date: IsoDate;
  dow: number;
  isFasting: boolean;
  capacity: number;
  tasks: PlannedTask[];
}

/**
 * The hypothetical normal week: only Monday and Thursday fasting, the current
 * capacity/template settings, a fresh curriculum, and a representative Quran
 * state alternating memorize (memorizeMinutes) / review (near pages only, 15
 * min with defaults), starting with memorize on Sunday.
 */
export function normalWeekPlan(settings: Settings, ledger: ModuleLedger = new ModuleLedger()): NormalWeekDay[] {
  const q = settings.quran;
  const reviewMinutes = reviewMinutesFor(q.nearPages, q);
  const days: NormalWeekDay[] = [];
  for (let dow = 0; dow < 7; dow++) {
    const date = `2000-01-${String(2 + dow).padStart(2, '0')}`;
    const isFasting = dow === 1 || dow === 4;
    const base = settings.capacityByDow[dow] ?? 0;
    const capacity = isFasting ? Math.round(base * (1 - settings.fastingReductionPct / 100)) : base;
    const memorize = dow % 2 === 0;
    const quran: QuranSessionPlan = memorize
      ? { type: 'memorize', pages: [604 - dow / 2], minutes: q.memorizeMinutes, title: 'Memorize page', description: '' }
      : { type: 'review', pages: [], minutes: reviewMinutes, title: 'Review', description: '' };
    const tasks = planDay({ date, isFasting, totalMinutes: capacity, quran, kept: [] }, settings, ledger);
    days.push({ date, dow, isFasting, capacity, tasks });
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
