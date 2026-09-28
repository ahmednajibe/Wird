import { Check, Clock, Coffee, Fire, Hourglass, Lightning, ListChecks, Moon, Plus, SealCheck, Trophy } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../client/client';
import { useCatalog, useDashboard, useSettings } from '../client/hooks';
import type { Dashboard, WeekSummaryDay } from '../client/types';
import { useAddTask } from '../components/AddTaskContext';
import { TaskCard, type TaskActions } from '../components/TaskCard';
import { Button } from '../components/ui/Button';
import { AnimatedNumber, Card, Chip, Duration, EmptyState, ErrorState, ProgressBar, Ring, Skeleton, useMediaQuery } from '../components/ui/primitives';
import { cn, dayOfMonth, formatLongDate, greeting, plural } from '../lib/format';
import { useModuleResources } from '../lib/resources';
import { useTaskActions } from '../lib/useTaskActions';

const EID_CODES = new Set(['eid-al-fitr', 'eid-al-adha', 'tashreeq']);

export function FastingBadge({ fasting }: { fasting: { isFasting: boolean; reasons: string[]; codes: string[] } }) {
  if (fasting.isFasting) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="fasting-badge">
        <Chip tone="warn" icon={Moon}>
          Fasting day
        </Chip>
        <span className="text-sm text-muted">{fasting.reasons.join(', ')}</span>
      </span>
    );
  }
  if (fasting.codes.some((c) => EID_CODES.has(c))) {
    const isTashreeq = fasting.codes.includes('tashreeq');
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="fasting-badge">
        <Chip tone="accent">{isTashreeq ? 'Tashreeq: not a fasting day' : 'Eid: not a fasting day'}</Chip>
        <span className="text-sm text-muted">{fasting.reasons.join(', ')}</span>
      </span>
    );
  }
  if (fasting.codes.includes('override-off')) {
    return <Chip>Not fasting (manual override)</Chip>;
  }
  return null;
}

function GoalCard({ d }: { d: Dashboard }) {
  const baseline = d.baseline.value;
  const rest = d.capacity.isRestDay;
  const secured = d.streak.todayCounts;
  const left = Math.max(0, baseline - d.pointsToday);
  const wide = useMediaQuery('(min-width: 640px)');
  const catalog = useCatalog();
  const settings = useSettings();
  const hasWarmup = (settings.data?.weeklyTemplate ?? []).some((day) => day.some((s) => s.role === 'warmup'));
  const enough = catalog.data?.quranEnabled && hasWarmup ? 'The Quran session plus the warm-up is enough.' : 'A light day of your core habits is enough.';
  return (
    <Card className={cn('relative overflow-hidden p-5 sm:p-6', secured && 'border-accent/40')} data-testid="goal-card">
      {secured && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-accent/12 blur-3xl"
        />
      )}
      <div className="relative flex items-center gap-5 sm:gap-6">
        <Ring value={d.pointsToday} max={rest ? 0 : baseline} size={wide ? 148 : 116} stroke={wide ? 13 : 11} label={`${d.pointsToday} of ${baseline} points`}>
          <AnimatedNumber value={d.pointsToday} className="text-[28px] leading-none font-semibold text-ink sm:text-[34px]" data-testid="points-today" />
          <span className="mt-1 text-xs text-muted">{rest ? 'points' : <>of <span className="num">{baseline}</span> pts</>}</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <div className="label">Daily goal</div>
          {rest ? (
            <>
              <p className="mt-1.5 text-lg font-semibold text-ink">Rest day</p>
              <p className="mt-1 text-sm text-muted">No goal today. The streak is paused, not broken.</p>
            </>
          ) : secured ? (
            <>
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1.5 inline-flex items-center gap-1.5 text-lg font-semibold text-accent-ink"
                data-testid="streak-secured"
              >
                <SealCheck size={22} weight="fill" aria-hidden />
                Streak secured
              </motion.p>
              <p className="mt-1 text-sm text-muted">Today counts. Everything else is a bonus.</p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-lg font-semibold text-ink">
                <span className="num">{left}</span> {left === 1 ? 'point' : 'points'} to go
              </p>
              <p className="mt-1 text-sm text-muted">Reach {baseline} points to keep your streak. {enough}</p>
            </>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Lightning size={14} weight="fill" className="text-accent-ink" aria-hidden />
            Planned today <span className="num text-ink">{d.plannedPointsToday}</span> pts
          </div>
        </div>
      </div>
    </Card>
  );
}

function StreakCard({ d }: { d: Dashboard }) {
  const { current, longest, todayCounts } = d.streak;
  const rest = d.capacity.isRestDay;
  const hint = todayCounts
    ? 'Today already counts.'
    : rest
      ? 'Rest day: the streak is paused.'
      : `Today is still open: ${Math.max(0, d.baseline.value - d.pointsToday)} points to keep it going.`;
  return (
    <Card className="flex flex-col p-4 sm:p-6" data-testid="streak-card">
      <div className="flex items-center justify-between">
        <div className="label">Streak</div>
        <span className={cn('inline-flex size-9 items-center justify-center rounded-xl', todayCounts ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>
          <Fire size={20} weight={todayCounts ? 'fill' : 'regular'} aria-hidden />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <AnimatedNumber value={current} className="text-3xl font-semibold text-ink sm:text-4xl" data-testid="streak-current" />
        <span className="text-sm text-muted">{current === 1 ? 'day' : 'days'}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted">
        <Trophy size={14} aria-hidden />
        Longest <span className="num text-ink">{longest}</span> {longest === 1 ? 'day' : 'days'}
      </div>
    </Card>
  );
}

function LevelCard({ d }: { d: Dashboard }) {
  const l = d.level;
  return (
    <Card className="flex flex-col p-4 sm:p-6" data-testid="level-card">
      <div className="flex items-center justify-between">
        <div className="label">Level</div>
        <span className="num inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-accent/12 px-2 text-sm font-semibold text-accent-ink">{l.level}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <AnimatedNumber value={l.totalPoints} className="text-3xl font-semibold text-ink sm:text-4xl" />
        <span className="text-sm text-muted">XP</span>
      </div>
      <div className="mt-auto pt-4">
        <ProgressBar value={l.pointsIntoLevel} max={l.pointsForNextLevel} label="Progress to next level" height={10} />
        <div className="mt-2 flex flex-wrap justify-between gap-x-2 text-xs text-muted">
          <span>
            <span className="num text-ink">{l.pointsIntoLevel}</span> / <span className="num">{l.pointsForNextLevel}</span> XP
          </span>
          <span>
            <span className="num text-ink">{l.pointsToNextLevel}</span> to level {l.level + 1}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function BufferLine({ minutes, className }: { minutes: number; className?: string }) {
  if (minutes <= 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted', className)} data-testid="buffer-line">
      <Hourglass size={15} aria-hidden />
      Buffer: <span className="num text-ink">{minutes}</span> min (optional catch-up or rest)
    </span>
  );
}

function CapacityLine({ d }: { d: Dashboard }) {
  const c = d.capacity;
  const planned = d.tasks.filter((t) => t.source === 'generated' && t.status !== 'rolled').reduce((a, t) => a + t.plannedMinutes, 0);
  const source = c.override ?? c.base;
  const pct = Math.round((1 - c.total / Math.max(1, source)) * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" data-testid="capacity-line">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {c.isRestDay ? <Coffee size={16} aria-hidden /> : <Clock size={16} aria-hidden />}
        {c.isRestDay ? (
          'Rest day, capacity set to 0 min'
        ) : (
          <>
            Capacity <Duration minutes={c.total} className="text-ink" />
            {c.isFasting ? (
              <span>
                (<Duration minutes={source} /> less <span className="num">{pct}</span>% for fasting)
              </span>
            ) : c.override !== null ? (
              <span>
                (custom, usually <Duration minutes={c.base} />)
              </span>
            ) : null}
          </>
        )}
      </span>
      {!c.isRestDay && (
        <span>
          Planned <Duration minutes={planned} className="text-ink" />
        </span>
      )}
      <BufferLine minutes={d.bufferMinutes} />
    </div>
  );
}

function WeekStrip({ days }: { days: WeekSummaryDay[] }) {
  const navigate = useNavigate();
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">This week</h2>
        <span className="text-xs text-muted">Earned vs planned points</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5" data-testid="week-strip">
        {days.map((w, i) => {
          const pct = w.plannedPoints > 0 ? Math.min(1, w.earnedPoints / w.plannedPoints) : 0;
          if (w.beforeStart) {
            return (
              <div
                key={w.date}
                data-testid="week-day-not-started"
                title="Not started: tracking began after this day"
                aria-label={`${w.dayName} ${w.date}: not started`}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line px-1 py-2.5 opacity-55 sm:py-3"
              >
                <span className="text-[11px] font-semibold text-muted uppercase">{w.dayName.slice(0, 3)}</span>
                <span className="num text-base font-semibold text-muted sm:text-lg">{dayOfMonth(w.date)}</span>
                <span className="text-[10px] leading-tight text-subtle">Not started</span>
              </div>
            );
          }
          return (
            <motion.button
              key={w.date}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 30 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/plan?week=${days[0]?.date ?? ''}#${w.date}`)}
              aria-label={`${w.dayName} ${w.date}: ${w.earnedPoints} of ${w.plannedPoints} points${w.counts ? ', counted' : ''}${w.fasting ? ', fasting' : ''}`}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 transition-colors sm:py-3',
                w.isToday ? 'border-accent/50 bg-accent/8' : 'border-line bg-surface-2/50 hover:bg-surface-2',
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase', w.isToday ? 'text-accent-ink' : 'text-muted')}>{w.dayName.slice(0, 3)}</span>
              <span className="num text-base font-semibold text-ink sm:text-lg">{dayOfMonth(w.date)}</span>
              <span className="relative h-1.5 w-full max-w-12 overflow-hidden rounded-full bg-surface-3">
                <motion.span
                  className="absolute inset-0 origin-left rounded-full bg-accent-fill"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </span>
              <span className="flex h-4 items-center gap-1">
                {w.counts ? (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-accent text-on-accent" title="Counted toward the streak">
                    <Check size={10} weight="bold" aria-hidden />
                  </span>
                ) : w.isRestDay ? (
                  <Coffee size={13} className="text-muted" aria-hidden />
                ) : null}
                {w.fasting && <Moon size={13} weight="fill" className="text-warn" aria-hidden />}
              </span>
            </motion.button>
          );
        })}
      </div>
    </Card>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading today">
      <div>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-8 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <Skeleton className="h-[196px] rounded-2xl" />
        <Skeleton className="h-[196px] rounded-2xl" />
        <Skeleton className="h-[196px] rounded-2xl" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function TodayPage() {
  const q = useDashboard();
  const catalog = useCatalog();
  const { open } = useAddTask();
  const { complete, undo, skip, remove } = useTaskActions();
  const resourcesFor = useModuleResources();

  if (q.isPending) return <TodaySkeleton />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data;

  const actions: TaskActions = {
    onComplete: (task, actualMinutes, anchor) => complete.mutate({ task, actualMinutes, anchor }),
    onUndo: (task) => undo.mutate(task),
    onSkip: (task) => skip.mutate(task),
    onDelete: (task) => remove.mutate(task),
  };
  const doneCount = d.tasks.filter((t) => t.status === 'completed').length;
  const countable = d.tasks.filter((t) => t.status !== 'rolled').length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">
            {formatLongDate(d.date)}
            <span className="mx-2 text-subtle" aria-hidden>
              /
            </span>
            <span>{d.hijri.label}</span>
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink md:text-[30px]">{greeting(new Date(), catalog.data?.timezone)}. Ready for today?</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <FastingBadge fasting={d.fasting} />
            <CapacityLine d={d} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr_1fr]">
        <GoalCard d={d} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:contents">
          <StreakCard d={d} />
          <LevelCard d={d} />
        </div>
      </div>

      {catalog.data && !catalog.data.hasPlan && (
        <Card className="p-5 sm:p-6" data-testid="no-plan-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">No study plan yet</h2>
              <p className="mt-0.5 text-sm text-muted">Import a plan to get study tracks and a weekly schedule. Quran tasks still show below if enabled.</p>
            </div>
            <Link to="/import" className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">
              Import a plan
            </Link>
          </div>
        </Card>
      )}

      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="tasks-heading" className="text-lg font-semibold tracking-tight">
              Today&apos;s tasks
            </h2>
            <p className="text-sm text-muted">
              {d.tasks.length === 0 ? 'Nothing planned yet.' : `${doneCount} of ${plural(countable, 'task')} done`}
            </p>
          </div>
          <div className="hidden md:block">
            <Button variant="secondary" size="sm" icon={Plus} onClick={open}>
              Log extra work
            </Button>
          </div>
        </div>
        {d.tasks.length === 0 ? (
          <Card>
            <EmptyState
              icon={ListChecks}
              title={d.capacity.isRestDay ? 'Rest day' : 'No tasks for today'}
              body={d.capacity.isRestDay ? 'Nothing is planned. Enjoy the break, or log anything you do anyway.' : 'Log study or Quran work you did, and the points are added automatically.'}
              action={
                <Button variant="primary" icon={Plus} onClick={open}>
                  Add a task
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="task-list">
            {d.tasks.map((t, i) => (
              <motion.li
                key={t.id}
                layout="position"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.045, type: 'spring', stiffness: 380, damping: 32 }}
              >
                <TaskCard task={t} resources={resourcesFor(t.moduleId)} actions={actions} />
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <WeekStrip days={d.weekSummary} />
    </div>
  );
}
