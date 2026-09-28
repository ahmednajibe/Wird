/**
 * Deterministic, automatic points. The owner never enters points.
 *   points = round(minutes * benefit(type) * priority)
 */
import { isQuranType } from './types.js';
import type { TaskSource, TaskType, TrackId } from './types.js';

export const BENEFIT: Record<TaskType, number> = {
  learn: 1.2,
  build: 1.3,
  practice: 1.1,
  review: 0.9,
  'quran-memorize': 1.5,
  'quran-review': 1.3,
};

export const PRIORITY = {
  quran: 1.25,
  plan: 1.0,
  manualCurriculum: 1.0,
  manualOffCurriculum: 0.85,
} as const;

export const MIN_POINT_MINUTES = 5;
export const MAX_POINT_MINUTES = 180;

export interface ScorableTask {
  track: TrackId;
  type: TaskType;
  source: TaskSource;
  offCurriculum: boolean;
  plannedMinutes: number;
  actualMinutes?: number | null;
  /** Manual Quran memorize: extra pages logged. */
  pagesCount?: number | null;
}

export interface ScoringContext {
  /** Minutes of one planned memorize session (points per extra page). */
  memorizeSessionMinutes: number;
}

export function priorityOf(task: Pick<ScorableTask, 'track' | 'type' | 'source' | 'offCurriculum'>): number {
  if (isQuranType(task.type)) return PRIORITY.quran;
  if (task.source === 'generated') return PRIORITY.plan;
  return task.offCurriculum ? PRIORITY.manualOffCurriculum : PRIORITY.manualCurriculum;
}

export function clampPointMinutes(minutes: number): number {
  return Math.min(MAX_POINT_MINUTES, Math.max(MIN_POINT_MINUTES, minutes));
}

/** Minutes used for points of a completed task. */
export function effectiveMinutes(task: Pick<ScorableTask, 'plannedMinutes' | 'actualMinutes'>): number {
  if (task.actualMinutes === null || task.actualMinutes === undefined) return task.plannedMinutes;
  return Math.max(MIN_POINT_MINUTES, Math.min(task.actualMinutes, task.plannedMinutes * 2));
}

export function rawPoints(minutes: number, type: TaskType, priority: number): number {
  return Math.round(clampPointMinutes(minutes) * BENEFIT[type] * priority);
}

/** Points for one Quran memorize session of the given length. */
export function memorizeSessionPoints(ctx: ScoringContext): number {
  return rawPoints(ctx.memorizeSessionMinutes, 'quran-memorize', PRIORITY.quran);
}

export interface PointsBreakdown {
  points: number;
  minutes: number;
  benefit: number;
  priority: number;
  formula: string;
}

function breakdown(task: ScorableTask, minutes: number, ctx: ScoringContext): PointsBreakdown {
  const priority = priorityOf(task);
  const benefit = BENEFIT[task.type];
  if (task.type === 'quran-memorize' && task.pagesCount && task.pagesCount > 0) {
    const perPage = memorizeSessionPoints(ctx);
    return {
      points: perPage * task.pagesCount,
      minutes,
      benefit,
      priority,
      formula: `${task.pagesCount} page(s) x ${perPage} points (one memorize session of ${ctx.memorizeSessionMinutes} min)`,
    };
  }
  const m = clampPointMinutes(minutes);
  const points = Math.round(m * benefit * priority);
  return { points, minutes: m, benefit, priority, formula: `round(${m} min x ${benefit} x ${priority}) = ${points}` };
}

/** Points the task would earn if completed as planned. */
export function plannedPoints(task: ScorableTask, ctx: ScoringContext): PointsBreakdown {
  return breakdown(task, task.plannedMinutes, ctx);
}

/** Points earned by completing the task (uses actual minutes when given). */
export function completionPoints(task: ScorableTask, ctx: ScoringContext): PointsBreakdown {
  return breakdown(task, effectiveMinutes(task), ctx);
}
