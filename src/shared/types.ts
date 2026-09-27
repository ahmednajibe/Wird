/**
 * Core domain types shared by the engine, the server and (later) the web UI.
 * All dates are 'YYYY-MM-DD' strings interpreted in the Africa/Cairo timezone.
 */

export type IsoDate = string;

export type TrackId = 'quran' | 'fsd' | 'ai' | 'animation';
export type StreamId = 'main' | 'draw' | 'story';

/** A track/stream pair. Quran, FSD and AI only have the 'main' stream. */
export interface TrackStream {
  track: TrackId;
  stream: StreamId;
}

export const STUDY_TRACK_STREAMS: readonly TrackStream[] = [
  { track: 'ai', stream: 'main' },
  { track: 'fsd', stream: 'main' },
  { track: 'animation', stream: 'draw' },
  { track: 'animation', stream: 'story' },
] as const;

export const TRACK_LABELS: Record<TrackId, string> = {
  quran: 'Quran',
  fsd: 'Full Stack Development',
  ai: 'Artificial Intelligence',
  animation: 'Animation',
};

export const STREAM_LABELS: Record<StreamId, string> = {
  main: 'Main',
  draw: 'Drawing and animation craft',
  story: 'Story, boards and pipeline',
};

export type StudyTaskType = 'learn' | 'build' | 'practice' | 'review';
export type QuranTaskType = 'quran-memorize' | 'quran-review';
export type TaskType = StudyTaskType | QuranTaskType;

export type Intensity = 'deep' | 'normal' | 'light';
export type TaskSource = 'generated' | 'manual';
/**
 * Stored status. 'missed' is derived for past pending tasks. 'rolled' marks a
 * generated study session whose content moved forward to the next slot of
 * its own stream (missed or skipped); it earns no points and is not missed.
 */
export type StoredTaskStatus = 'pending' | 'completed' | 'skipped' | 'rolled';
export type TaskStatus = StoredTaskStatus | 'missed';

export type SlotRole = 'quran' | 'warmup' | 'focus';

export type ModuleKind = 'study' | 'project';

export interface Resource {
  name: string;
  url?: string;
  owned?: boolean;
  paid?: boolean;
  note?: string;
}

export interface Phase {
  id: string;
  title: string;
}

export interface CurriculumModule {
  id: string;
  track: Exclude<TrackId, 'quran'>;
  stream: StreamId;
  phase: Phase;
  title: string;
  resources: Resource[];
  estMinutes: number;
  kind: ModuleKind;
  note?: string;
  estimateUncertain?: boolean;
}

/** A task as the engine sees it (mapped from DB rows by the server). */
export interface Task {
  id: number;
  date: IsoDate;
  track: TrackId;
  stream: StreamId;
  type: TaskType;
  intensity: Intensity;
  title: string;
  description: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  source: TaskSource;
  status: StoredTaskStatus;
  completedDate: IsoDate | null;
  completedAt: string | null;
  moduleId: string | null;
  slotKey: string | null;
  sortOrder: number;
  /** Position in the stream's session queue (generated study tasks only). */
  sessionNo: number | null;
  quranPages: number[];
  pagesCount: number | null;
  offCurriculum: boolean;
  /** Points frozen at completion time (null while not completed). */
  points: number | null;
}

/** A task produced by the planner, before persistence. */
export interface PlannedTask {
  date: IsoDate;
  track: TrackId;
  stream: StreamId;
  type: TaskType;
  intensity: Intensity;
  title: string;
  description: string;
  plannedMinutes: number;
  moduleId: string | null;
  slotKey: string;
  sortOrder: number;
  /** Position in the stream's session queue (null for Quran). */
  sessionNo: number | null;
  quranPages: number[];
}

export interface DayOverride {
  date: IsoDate;
  /** true/false forces fasting on/off; null means automatic rules. */
  fasting: boolean | null;
  capacityOverride: number | null;
  note: string | null;
}

export interface HijriDate {
  year: number;
  month: number;
  day: number;
  monthName: string;
  label: string;
}

export type FastingCode =
  | 'monday'
  | 'thursday'
  | 'white-day'
  | 'ramadan'
  | 'dhul-hijjah-first-nine'
  | 'override-on'
  | 'override-off'
  | 'eid-al-fitr'
  | 'eid-al-adha'
  | 'tashreeq';

export interface FastingInfo {
  isFasting: boolean;
  /** Human readable reasons (why fasting, or why not despite a rule). */
  reasons: string[];
  codes: FastingCode[];
  /** Set when an automatic rule matched but a prohibited day blocked it. */
  blockedBy: string | null;
  overridden: boolean;
}

export interface QuranPageState {
  page: number;
  memorizedDate: IsoDate | null;
  /** Monotonic ordering key of memorization (ISO timestamp or sequence). */
  memorizedSeq: number | null;
  lastReviewed: IsoDate | null;
}

export type QuranSessionType = 'memorize' | 'review';

export interface QuranSessionPlan {
  type: QuranSessionType;
  pages: number[];
  minutes: number;
  title: string;
  description: string;
}
