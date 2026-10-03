import { Check, Clock, Coffee, Fire, Hourglass, ListChecks, Moon, Plus, SealCheck } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../client/client';
import { useCatalog, useDashboard, useSettings } from '../client/hooks';
import type { Dashboard, WeekSummaryDay } from '../client/types';
import { useAddTask } from '../components/AddTaskContext';
import { TaskCard, type TaskActions } from '../components/TaskCard';
import { Button } from '../components/ui/Button';
import { AnimatedNumber, Card, Chip, Duration, EmptyState, ErrorState, InfoHint, ProgressBar, Ring, Skeleton, useMediaQuery } from '../components/ui/primitives';
import { useI18n } from '../i18n';
import { cn, dayOfMonth, formatLongDate, greeting } from '../lib/format';
import { useModuleResources } from '../lib/resources';
import { useTaskActions } from '../lib/useTaskActions';

const EID_CODES = new Set(['eid-al-fitr', 'eid-al-adha', 'tashreeq']);

export function FastingBadge({ fasting }: { fasting: { isFasting: boolean; reasons: string[]; codes: string[] } }) {
  const { t } = useI18n();
  if (fasting.isFasting) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="fasting-badge">
        <Chip tone="warn" icon={Moon}>
          {t('fasting.day')}
        </Chip>
        <span className="text-sm text-muted">{fasting.reasons.join(', ')}</span>
      </span>
    );
  }
  if (fasting.codes.some((c) => EID_CODES.has(c))) {
    const isTashreeq = fasting.codes.includes('tashreeq');
    return (
      <span className="inline-flex flex-wrap items-center gap-2" data-testid="fasting-badge">
        <Chip tone="accent">{isTashreeq ? t('fasting.tashreeq') : t('fasting.eid')}</Chip>
        <span className="text-sm text-muted">{fasting.reasons.join(', ')}</span>
      </span>
    );
  }
  if (fasting.codes.includes('override-off')) {
    return <Chip>{t('fasting.overrideOff')}</Chip>;
  }
  return null;
}

function HeroCard({ d }: { d: Dashboard }) {
  const { t, tn, tRich, tnRich } = useI18n();
  const baseline = d.baseline.value;
  const rest = d.capacity.isRestDay;
  const secured = d.streak.todayCounts;
  const left = Math.max(0, baseline - d.pointsToday);
  const wide = useMediaQuery('(min-width: 640px)');
  const catalog = useCatalog();
  const settings = useSettings();
  const hasWarmup = (settings.data?.weeklyTemplate ?? []).some((day) => day.some((s) => s.role === 'warmup'));
  const enough = catalog.data?.quranEnabled && hasWarmup ? t('hero.enoughQuran') : t('hero.enoughCore');
  const { current, longest } = d.streak;
  const l = d.level;
  const goalHint = (
    <InfoHint label={rest ? t('hint.restDays') : t('hint.dailyGoal')}>
      {rest ? t('hero.goalHintRest') : t('hero.goalHint')}
    </InfoHint>
  );
  // Glued to the preceding word via the {hint} template slot so the icon never wraps alone.
  const hintSpan = <span className="whitespace-nowrap">{' '}{goalHint}</span>;
  return (
    <Card className={cn('relative overflow-hidden p-5 sm:p-6', secured && 'border-accent/40')} data-testid="goal-card">
      {secured && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="pointer-events-none absolute -top-24 -end-24 size-64 rounded-full bg-accent/12 blur-3xl"
        />
      )}
      <div className="relative grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 sm:gap-x-6">
        <div className="sm:row-span-2">
          <Ring value={d.pointsToday} max={rest ? 0 : baseline} size={wide ? 148 : 116} stroke={wide ? 13 : 11} label={t('hero.ringLabel', { points: d.pointsToday, goal: baseline })}>
            <AnimatedNumber value={d.pointsToday} className="text-[28px] leading-none font-semibold text-ink sm:text-[34px]" data-testid="points-today" />
            <span className="mt-1 text-xs text-muted">
              {rest ? t('hero.pointsLabel') : tRich('hero.ringGoal', { goal: <span className="num">{baseline}</span> })}
            </span>
          </Ring>
        </div>
        <div className="min-w-0">
          {rest ? (
            <>
              <p className="inline-flex items-center gap-1 text-lg font-semibold text-ink">
                {tRich('hero.restTitle', { word: <span className="whitespace-nowrap">{t('hero.restWord')} {goalHint}</span> })}
              </p>
              <p className="mt-1 text-sm text-muted">{t('hero.restBody')}</p>
            </>
          ) : secured ? (
            <>
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 text-lg font-semibold text-accent-ink"
                data-testid="streak-secured"
              >
                <SealCheck size={22} weight="fill" aria-hidden />
                {tRich('hero.securedTitle', { word: <span className="whitespace-nowrap">{t('hero.securedWord')} {goalHint}</span> })}
              </motion.p>
              <p className="mt-1 text-sm text-muted">{t('hero.securedBody')}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-ink">
                {tnRich('hero.toGo', left, { count: <span className="num">{left}</span>, hint: hintSpan })}
              </p>
              <p className="mt-1 text-sm text-muted">
                {tn('hero.reach', baseline)} {enough}
              </p>
            </>
          )}
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-2 border-t border-line pt-3.5 sm:col-span-1 sm:col-start-2">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm" data-testid="streak-card">
            <Fire size={16} weight={secured ? 'fill' : 'regular'} className={secured ? 'text-accent-ink' : 'text-muted'} aria-hidden />
            <span className="text-ink">
              {tnRich('common.streakDays', current, {
                count: <AnimatedNumber value={current} className="font-semibold" data-testid="streak-current" />,
              })}
            </span>
            <span className="whitespace-nowrap text-muted">
              {tRich('hero.longest', {
                n: <span className="num">{longest}</span>,
                hint: <span className="whitespace-nowrap">{' '}<InfoHint label={t('hint.streak')}>{t('hero.streakHint')}</InfoHint></span>,
              })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm" data-testid="level-card">
            <span className="text-ink">{tRich('hero.level', { n: <span className="num font-semibold">{l.level}</span> })}</span>
            <span className="w-24 shrink-0 sm:w-28">
              <ProgressBar value={l.pointsIntoLevel} max={l.pointsForNextLevel} label={t('hero.levelProgress')} height={5} />
            </span>
            <span className="whitespace-nowrap text-muted">
              {tnRich('hero.toLevel', l.pointsToNextLevel, {
                count: <span className="num">{l.pointsToNextLevel}</span>,
                level: l.level + 1,
                hint: <span className="whitespace-nowrap">{' '}<InfoHint label={t('hint.levels')}>{t('hero.levelHint')}</InfoHint></span>,
              })}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function BufferLine({ minutes, className }: { minutes: number; className?: string }) {
  const { tRich } = useI18n();
  if (minutes <= 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted', className)} data-testid="buffer-line">
      <Hourglass size={15} aria-hidden />
      {tRich('buffer.line', { min: <span className="num text-ink">{minutes}</span> })}
    </span>
  );
}

function CapacityLine({ d }: { d: Dashboard }) {
  const { t, tRich } = useI18n();
  const c = d.capacity;
  const planned = d.tasks.filter((t) => t.source === 'generated' && t.status !== 'rolled').reduce((a, t) => a + t.plannedMinutes, 0);
  const source = c.override ?? c.base;
  const pct = Math.round((1 - c.total / Math.max(1, source)) * 100);
  const hint = <InfoHint label={t('hint.capacity')}>{t('capacity.hint')}</InfoHint>;
  const note = c.isFasting
    ? tRich('capacity.fastingNote', { source: <Duration minutes={source} />, pct: <span className="num">{pct}</span> })
    : c.override !== null
      ? tRich('capacity.customNote', { base: <Duration minutes={c.base} /> })
      : null;
  // The trailing word plus the hint icon stay on one line; the note wraps freely.
  const hintSpan = <span className="whitespace-nowrap">{' '}{hint}</span>;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted" data-testid="capacity-line">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {c.isRestDay ? <Coffee size={16} aria-hidden /> : <Clock size={16} aria-hidden />}
        {c.isRestDay ? (
          <span>{tRich('capacity.rest', { hint: hintSpan })}</span>
        ) : (
          <span>
            {tRich('capacity.line', {
              planned: <Duration minutes={planned} className="text-ink" />,
              total: <Duration minutes={c.total} className="text-ink" />,
              note: note ? <> {note}</> : '',
              hint: hintSpan,
            })}
          </span>
        )}
      </span>
      <BufferLine minutes={d.bufferMinutes} />
    </div>
  );
}

function WeekStrip({ days }: { days: WeekSummaryDay[] }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">{t('week.title')}</h2>
        <span className="text-xs text-muted">{t('week.sub')}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5" data-testid="week-strip">
        {days.map((w, i) => {
          const pct = w.plannedPoints > 0 ? Math.min(1, w.earnedPoints / w.plannedPoints) : 0;
          if (w.beforeStart) {
            return (
              <div
                key={w.date}
                data-testid="week-day-not-started"
                title={t('week.notStartedTitle')}
                aria-label={t('week.dayNotStartedAria', { day: w.dayName, date: w.date })}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-line px-1 py-2.5 opacity-55 sm:py-3"
              >
                <span className="text-[11px] font-semibold text-muted uppercase">{w.dayName.slice(0, 3)}</span>
                <span className="num text-base font-semibold text-muted sm:text-lg">{dayOfMonth(w.date)}</span>
                <span className="text-[10px] leading-tight text-subtle">{t('week.notStarted')}</span>
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
              aria-label={
                t('week.dayAria', { day: w.dayName, date: w.date, earned: w.earnedPoints, planned: w.plannedPoints }) +
                (w.counts ? t('week.countedSuffix') : '') +
                (w.fasting ? t('week.fastingSuffix') : '')
              }
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 transition-colors sm:py-3',
                w.isToday ? 'border-accent/50 bg-accent/8' : 'border-line bg-surface-2/50 hover:bg-surface-2',
              )}
            >
              <span className={cn('text-[11px] font-semibold uppercase', w.isToday ? 'text-accent-ink' : 'text-muted')}>{w.dayName.slice(0, 3)}</span>
              <span className="num text-base font-semibold text-ink sm:text-lg">{dayOfMonth(w.date)}</span>
              <span className="relative h-1.5 w-full max-w-12 overflow-hidden rounded-full bg-surface-3">
                <motion.span
                  className="absolute inset-0 origin-left rounded-full bg-accent-fill rtl:origin-right"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: pct }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                />
              </span>
              <span className="flex h-4 items-center gap-1">
                {w.counts ? (
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-accent text-on-accent" title={t('week.countedTitle')}>
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

const INTRO_KEY = 'wird-intro-dismissed';
const INTRO_STEP_KEYS = ['intro.step1', 'intro.step2', 'intro.step3'] as const;

function IntroCard() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* storage unavailable: hide for this session only */
    }
    setDismissed(true);
  };
  return (
    <Card className="p-5 sm:p-6" data-testid="intro-card">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{t('intro.title')}</h2>
        <Button variant="secondary" size="sm" onClick={dismiss} data-testid="intro-dismiss">
          {t('intro.dismiss')}
        </Button>
      </div>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {INTRO_STEP_KEYS.map((k, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="num inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed text-muted">{t(k)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function TodaySkeleton() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={t('skeleton.loading')}>
      <div>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-8 w-72" />
      </div>
      <Skeleton className="h-[196px] rounded-2xl" />
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
  const { t, tn, tRich } = useI18n();
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
  const isOpen = (t: Dashboard['tasks'][number]) => t.status === 'pending' || t.status === 'missed';
  const openTasks = d.tasks.filter(isOpen);
  const doneTasks = d.tasks.filter((t) => !isOpen(t));

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
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink md:text-[30px]">{t('today.greeting', { greeting: greeting(new Date(), catalog.data?.timezone) })}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <FastingBadge fasting={d.fasting} />
            <CapacityLine d={d} />
          </div>
        </div>
      </header>

      <HeroCard d={d} />

      {catalog.data && !catalog.data.hasPlan && (
        <Card className="p-5 sm:p-6" data-testid="no-plan-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-ink">{t('today.noPlanTitle')}</h2>
              <p className="mt-0.5 text-sm text-muted">{t('today.noPlanBody')}</p>
            </div>
            <Link to="/import" className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent">
              {t('route.import')}
            </Link>
          </div>
        </Card>
      )}

      {d.tasks.length > 0 && <IntroCard />}

      <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="tasks-heading" className="text-lg font-semibold tracking-tight">
              {t('today.tasks')}
            </h2>
            <p className="text-sm text-muted">
              {d.tasks.length === 0 ? t('today.nothingPlanned') : tn('today.doneCount', countable, { done: doneCount })}
            </p>
          </div>
        </div>
        {d.tasks.length === 0 ? (
          <Card>
            <EmptyState
              icon={ListChecks}
              title={d.capacity.isRestDay ? t('today.restDay') : t('today.noTasks')}
              body={d.capacity.isRestDay ? t('today.restEmptyBody') : t('today.emptyBody')}
              action={
                <Button variant="primary" icon={Plus} onClick={open}>
                  {t('today.addTask')}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {openTasks.length > 0 ? (
              <ul className="flex flex-col gap-3" data-testid="task-list">
                {openTasks.map((t, i) => (
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
            ) : (
              <Card className="flex items-center gap-3 p-4">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent-ink">
                  <Check size={16} weight="bold" aria-hidden />
                </span>
                <p className="text-sm text-muted">{t('today.allDone')}</p>
              </Card>
            )}
            {doneTasks.length > 0 && (
              <>
                <h3 className="mt-2 flex items-baseline gap-2 text-sm font-semibold text-muted">
                  {tRich('today.doneMoved', { count: <span className="num text-xs font-normal text-subtle">{doneTasks.length}</span> })}
                </h3>
                <ul className="flex flex-col gap-2">
                  {doneTasks.map((t, i) => (
                    <motion.li
                      key={t.id}
                      layout="position"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i + openTasks.length, 8) * 0.045, type: 'spring', stiffness: 380, damping: 32 }}
                    >
                      <TaskCard task={t} resources={resourcesFor(t.moduleId)} actions={actions} />
                    </motion.li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <WeekStrip days={d.weekSummary} />
    </div>
  );
}
