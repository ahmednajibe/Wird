/**
 * Task commands with optimistic updates of the Today dashboard, confetti and
 * the one-time "Streak secured" celebration.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { completionPoints } from '../../shared/scoring.js';
import { levelFor } from '../../shared/streak.js';
import { isQuranType } from '../../shared/types.js';
import { api, errorMessage } from '../client/client';
import { qk } from '../client/hooks';
import type { Dashboard, TaskView } from '../client/types';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../i18n';
import { burstFrom, celebrate } from './confetti';

const SECURED_KEY = 'lt-secured-';

function alreadyCelebrated(date: string): boolean {
  try {
    return localStorage.getItem(SECURED_KEY + date) === '1';
  } catch {
    return false;
  }
}

function markCelebrated(date: string): void {
  try {
    localStorage.setItem(SECURED_KEY + date, '1');
  } catch {
    /* ignore */
  }
}

/** Applies a points delta for today's dashboard (points, level, streak, week strip). */
function withPoints(d: Dashboard, delta: number): Dashboard {
  const points = Math.max(0, d.pointsToday + delta);
  const restDay = d.capacity.isRestDay;
  const nowCounts = !restDay && points >= d.baseline.value;
  const wasCounts = d.streak.todayCounts;
  const current = d.streak.current + (nowCounts && !wasCounts ? 1 : !nowCounts && wasCounts ? -1 : 0);
  return {
    ...d,
    pointsToday: points,
    level: levelFor(Math.max(0, d.level.totalPoints + delta)),
    streak: { current: Math.max(0, current), longest: Math.max(d.streak.longest, current), todayCounts: nowCounts },
    weekSummary: d.weekSummary.map((w) => (w.date === d.date ? { ...w, earnedPoints: points, counts: nowCounts } : w)),
  };
}

function patchTask(d: Dashboard, id: number, patch: Partial<TaskView>): Dashboard {
  return { ...d, tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function useTaskActions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t, tn } = useI18n();

  const snapshot = async () => {
    await qc.cancelQueries({ queryKey: qk.dashboard });
    return qc.getQueryData<Dashboard>(qk.dashboard);
  };
  const restore = (prev: Dashboard | undefined) => {
    if (prev) qc.setQueryData(qk.dashboard, prev);
  };
  const settle = () => qc.invalidateQueries();

  const complete = useMutation({
    mutationFn: ({ task, actualMinutes }: { task: TaskView; actualMinutes: number | null; anchor?: Element | null }) =>
      api.complete(task.id, actualMinutes),
    onMutate: async ({ task, actualMinutes, anchor }) => {
      const prev = await snapshot();
      if (!prev) return { prev };
      const points = completionPoints(
        { ...task, actualMinutes },
        { memorizeSessionMinutes: prev.quranSummary.plannedMemorizeMinutes },
      ).points;
      let next = patchTask(prev, task.id, { status: 'completed', earnedPoints: points, actualMinutes, points });
      next = withPoints(next, points);
      qc.setQueryData(qk.dashboard, next);
      burstFrom(anchor ?? null);
      const crossed = !prev.streak.todayCounts && next.streak.todayCounts;
      if (crossed && !alreadyCelebrated(prev.date)) {
        markCelebrated(prev.date);
        window.setTimeout(() => {
          celebrate();
          toast({
            tone: 'celebrate',
            title: t('toast.streakSecured'),
            body: t('toast.streakSecuredBody', {
              points: next.pointsToday,
              goal: prev.baseline.value,
              streak: tn('common.dayCount', next.streak.current),
            }),
          });
        }, 350);
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      restore(ctx?.prev);
      toast({ tone: 'error', title: t('toast.errComplete'), body: errorMessage(err) });
    },
    onSettled: settle,
  });

  const undo = useMutation({
    mutationFn: (task: TaskView) => api.uncomplete(task.id),
    onMutate: async (task) => {
      const prev = await snapshot();
      if (!prev) return { prev };
      let next = patchTask(prev, task.id, { status: 'pending', earnedPoints: null, actualMinutes: null, points: null });
      if (task.status === 'completed' && task.completedDate === prev.date) next = withPoints(next, -(task.earnedPoints ?? 0));
      qc.setQueryData(qk.dashboard, next);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      restore(ctx?.prev);
      toast({ tone: 'error', title: t('toast.errUndo'), body: errorMessage(err) });
    },
    onSettled: settle,
  });

  const skip = useMutation({
    mutationFn: (task: TaskView) => api.skip(task.id),
    onMutate: async (task) => {
      const prev = await snapshot();
      // Quran skip marks the session skipped; a study session moves forward in its own track.
      if (prev) qc.setQueryData(qk.dashboard, patchTask(prev, task.id, isQuranType(task.type) ? { status: 'skipped' } : { status: 'rolled', plannedPoints: 0 }));
      return { prev };
    },
    onError: (err, _v, ctx) => {
      restore(ctx?.prev);
      toast({ tone: 'error', title: t('toast.errSkip'), body: errorMessage(err) });
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (task: TaskView) => api.deleteTask(task.id),
    onMutate: async (task) => {
      const prev = await snapshot();
      if (prev) {
        let next: Dashboard = { ...prev, tasks: prev.tasks.filter((t) => t.id !== task.id) };
        if (task.status === 'completed' && task.completedDate === prev.date) next = withPoints(next, -(task.earnedPoints ?? 0));
        qc.setQueryData(qk.dashboard, next);
      }
      return { prev };
    },
    onSuccess: () => toast({ tone: 'info', title: t('toast.deleted') }),
    onError: (err, _v, ctx) => {
      restore(ctx?.prev);
      toast({ tone: 'error', title: t('toast.errDelete'), body: errorMessage(err) });
    },
    onSettled: settle,
  });

  return { complete, undo, skip, remove };
}

export { alreadyCelebrated, markCelebrated };
