/**
 * Response shapes of the local API (mirrors src/server/views.ts and service.ts),
 * built on the shared domain types.
 */
import type { DayCapacity } from '../../shared/calendar.js';
import type { StreamWeekly } from '../../shared/planner.js';
import type { ModuleProgress } from '../../shared/progress.js';
import type { StreamProjection } from '../../shared/projections.js';
import type { QuranProjection, QuranSettings } from '../../shared/quran.js';
import type { PageSegment, SurahInfo } from '../../shared/quranData.js';
import type { Settings } from '../../shared/settings.js';
import type { BaselineExplanation, LevelInfo, StreakResult } from '../../shared/streak.js';
import type {
  CurriculumModule,
  DayOverride,
  FastingCode,
  FastingInfo,
  HijriDate,
  IsoDate,
  QuranSessionPlan,
  QuranSessionType,
  StreamId,
  Task,
  TaskStatus,
  TrackId,
} from '../../shared/types.js';

export type {
  Settings,
  IsoDate,
  TrackId,
  StreamId,
  BaselineExplanation,
  LevelInfo,
  StreakResult,
  PageSegment,
  SurahInfo,
  TaskStatus,
  FastingCode,
  HijriDate,
  DayOverride,
  QuranSessionType,
  DayCapacity,
  StreamWeekly,
  StreamProjection,
};
export type { TaskType, Intensity } from '../../shared/types.js';

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
  baselineSnapshot: { baseline: number; isRestDay: boolean; isFasting: boolean; frozen: boolean };
  counts: boolean;
}

export interface WeekSummaryDay {
  date: IsoDate;
  dayName: string;
  plannedPoints: number;
  earnedPoints: number;
  baseline: number;
  counts: boolean;
  fasting: boolean;
  isRestDay: boolean;
  baselineFrozen: boolean;
  capacity: number;
  isPast: boolean;
  isToday: boolean;
}

export interface QuranSummary {
  memorized: number;
  remaining: number;
  nextPage: number | null;
  nextPageSurahs: string | null;
  nextPageContents: string | null;
  nextPageJuz: number | null;
  nextSessionType: QuranSessionType;
  lastCompletedSessionType: QuranSessionType | null;
  plannedMemorizeMinutes: number;
  reviewCycleLength: number;
}

export interface Dashboard {
  date: IsoDate;
  today: IsoDate;
  dayName: string;
  hijri: HijriDate;
  fasting: { isFasting: boolean; reasons: string[]; codes: FastingCode[] };
  capacity: DayCapacity;
  override: DayOverride | null;
  tasks: TaskView[];
  pointsToday: number;
  plannedPointsToday: number;
  baseline: { value: number; normal: number; fasting: number; explanation: BaselineExplanation };
  streak: StreakResult;
  level: LevelInfo;
  weekSummary: WeekSummaryDay[];
  quranSummary: QuranSummary;
}

export interface WeekResponse {
  start: IsoDate;
  end: IsoDate;
  totals: { plannedMinutes: number; capacity: number; plannedPoints: number; earnedPoints: number };
  days: DayView[];
}

export interface TrackModule extends CurriculumModule {
  progress: ModuleProgress;
  isCurrent: boolean;
}

export interface ResourceView {
  name: string;
  url: string | null;
  owned: boolean;
  paid: boolean;
  access: 'owned' | 'free' | 'paid';
  note: string | null;
}

export interface TrackStreamGroup {
  track: TrackId;
  stream: StreamId;
  trackLabel: string;
  streamLabel: string;
  currentModuleId: string | null;
  currentModuleTitle: string | null;
  phases: { id: string; title: string; modules: TrackModule[] }[];
  projection: StreamProjection | null;
  unscheduledResources: { name: string; url?: string; owned?: boolean; paid?: boolean; note?: string }[];
}

export interface TracksResponse {
  today: IsoDate;
  normalWeekMinutes: StreamWeekly[];
  streams: TrackStreamGroup[];
  quran: QuranSummary & { weeklyPlannedMinutes: number };
  totals: { modules: number; completedModules: number };
}

export interface QuranPageView {
  page: number;
  memorized: boolean;
  memorizedDate: IsoDate | null;
  lastReviewed: IsoDate | null;
  juz: number;
  surahs: number[];
  segments: PageSegment[];
  label: string;
}

export interface QuranResponse {
  today: IsoDate;
  attribution: string;
  settings: QuranSettings;
  pages: QuranPageView[];
  memorized: number;
  nextPage: number | null;
  nextSessionType: QuranSessionType;
  nextSession: QuranSessionPlan;
  lastCompletedSessionType: QuranSessionType | null;
  plannedMemorizeMinutes: number;
  reviewCycle: {
    capPages: number;
    nearPages: number;
    farPerSession: number;
    cycleLength: number;
    reviewAll: boolean;
    nextReview: { pages: number[]; near: number[]; far: number[]; minutes: number };
  };
  projection: QuranProjection;
  order: number[];
  surahs: SurahInfo[];
  juz: { number: number; startPage: number; endPage: number; start: { surah: number; ayah: number } }[];
}

export interface StatsResponse {
  today: IsoDate;
  daily: { date: IsoDate; points: number; baseline: number; counts: boolean; isRestDay: boolean }[];
  weekly: { weekStart: IsoDate; points: number; minutes: number; tasks: number }[];
  perTrack: { track: TrackId; stream: StreamId; points: number; minutes: number; tasks: number }[];
  totals: { points: number; daysCounted: number };
  streak: StreakResult;
  level: LevelInfo;
}

export interface ResourceModuleRef {
  id: string;
  title: string;
  phaseId: string;
  phaseTitle: string;
  estimateUncertain: boolean;
  completed: boolean;
}

export interface ResourcesResponse {
  streams: {
    track: TrackId;
    stream: StreamId;
    trackLabel: string;
    streamLabel: string;
    counts: { owned: number; free: number; paid: number };
    resources: (ResourceView & { modules: ResourceModuleRef[] })[];
    unscheduled: ResourceView[];
  }[];
  modules: {
    id: string;
    track: TrackId;
    stream: StreamId;
    title: string;
    phaseId: string;
    phaseTitle: string;
    estimateUncertain: boolean;
    resources: ResourceView[];
  }[];
  unscheduled: (ResourceView & { track: TrackId; stream: StreamId })[];
}

export type ManualTaskType = 'learn' | 'practice' | 'build' | 'review' | 'memorize';

export interface ManualTaskInput {
  track: TrackId;
  stream?: StreamId;
  title: string;
  minutes: number;
  type: ManualTaskType;
  pagesCount?: number | null;
  offCurriculum?: boolean;
  completed?: boolean;
  description?: string;
}

export interface ScorePreview {
  points: number;
  formula: string;
  minutes: number;
  benefit: number;
  priority: number;
}

export interface SettingsSaveResponse {
  settings: Settings;
  regenerated: boolean;
}

export interface DayOverrideInput {
  fasting: boolean | null;
  capacityOverride: number | null;
  note: string | null;
}
