import { ChartBar, Fire, Lightning, SealCheck, Trophy } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { addDays, weekStart } from '../../shared/dates.js';
import { errorMessage } from '../client/client';
import { useStats } from '../client/hooks';
import type { StatsResponse } from '../client/types';
import { AnimatedNumber, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from '../components/ui/primitives';
import { cn, formatHours, formatMediumDate, formatMonthShort, formatShortDate } from '../lib/format';
import { metaByKey, trackKey, TRACK_ORDER, type TrackKey } from '../lib/tracks';

type Day = StatsResponse['daily'][number];

function level(d: Day): { cls: string; label: string } {
  if (d.isRestDay) return { cls: 'border border-dashed border-line-strong bg-transparent', label: 'rest day' };
  if (d.points <= 0) return { cls: 'bg-[var(--grid-empty)]', label: 'no points' };
  const ratio = d.baseline > 0 ? d.points / d.baseline : 2;
  if (!d.counts) return ratio < 0.5 ? { cls: 'bg-muted/25', label: 'below goal' } : { cls: 'bg-muted/50', label: 'below goal' };
  if (ratio < 1.5) return { cls: 'bg-accent-fill/55', label: 'goal reached' };
  if (ratio < 2.5) return { cls: 'bg-accent-fill/80', label: 'goal reached' };
  return { cls: 'bg-accent-fill', label: 'goal reached' };
}

function Heatmap({ daily }: { daily: Day[] }) {
  const weeks = useMemo(() => {
    if (daily.length === 0) return [];
    const byDate = new Map(daily.map((d) => [d.date, d]));
    const first = daily[0]?.date as string;
    const last = daily[daily.length - 1]?.date as string;
    const cols: (Day | null)[][] = [];
    for (let s = weekStart(first); s <= last; s = addDays(s, 7)) {
      cols.push(Array.from({ length: 7 }, (_, i) => byDate.get(addDays(s, i)) ?? null));
    }
    return cols;
  }, [daily]);

  return (
    <div className="scrollbar-thin overflow-x-auto pb-2">
      <div className="inline-flex min-w-full flex-col gap-1.5">
        <div className="flex gap-[3px] pl-8 text-[10px] text-muted">
          {weeks.map((w, i) => {
            const firstDay = w.find((d) => d !== null);
            const show = firstDay && Number(firstDay.date.slice(8, 10)) <= 7;
            return (
              <span key={i} className="w-3 shrink-0 overflow-visible whitespace-nowrap lg:w-[14px]">
                {show ? formatMonthShort(firstDay.date) : ''}
              </span>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex w-7 shrink-0 flex-col gap-[3px] text-[10px] text-muted">
            {['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map((l, i) => (
              <span key={i} className="flex h-3 items-center lg:h-[14px]">
                {l}
              </span>
            ))}
          </div>
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              {w.map((d, j) =>
                d ? (
                  <span
                    key={j}
                    data-testid="heat-cell"
                    title={`${formatMediumDate(d.date)}: ${d.points} points${d.isRestDay ? ', rest day' : `, goal ${d.baseline}`}${d.counts ? ', counted' : ''}`}
                    className={cn('size-3 rounded-[3px] lg:size-[14px]', level(d).cls)}
                  />
                ) : (
                  <span key={j} className="size-3 lg:size-[14px]" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HeatLegend() {
  const items = [
    { cls: 'bg-[var(--grid-empty)]', label: 'No points' },
    { cls: 'bg-muted/40', label: 'Below goal' },
    { cls: 'bg-accent-fill/55', label: 'Goal reached' },
    { cls: 'bg-accent-fill', label: '2.5x goal or more' },
    { cls: 'border border-dashed border-line-strong', label: 'Rest day' },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('size-3 rounded-[3px]', i.cls)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function WeeklyBars({ weekly, today }: { weekly: StatsResponse['weekly']; today: string }) {
  const weeks = useMemo(() => {
    const map = new Map(weekly.map((w) => [w.weekStart, w]));
    const end = weekStart(today);
    return Array.from({ length: 12 }, (_, i) => {
      const s = addDays(end, (i - 11) * 7);
      return { weekStart: s, points: map.get(s)?.points ?? 0, minutes: map.get(s)?.minutes ?? 0 };
    });
  }, [weekly, today]);
  const max = Math.max(1, ...weeks.map((w) => w.points));
  return (
    <div className="flex h-56 items-end gap-1.5 sm:gap-3" data-testid="weekly-bars">
      {weeks.map((w, i) => {
        const current = i === weeks.length - 1;
        return (
          <div key={w.weekStart} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn('num text-[10px] sm:text-xs', current ? 'font-semibold text-accent-ink' : 'text-muted')}>{w.points > 0 ? w.points : ''}</span>
            <div className="relative w-full flex-1">
              <motion.div
                className={cn('absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-lg', current ? 'bg-accent-fill' : 'bg-accent-fill/45')}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: w.points / max }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 140, damping: 22 }}
                title={`Week of ${formatShortDate(w.weekStart)}: ${w.points} points, ${formatHours(w.minutes)}`}
              />
            </div>
            <span className="num text-[10px] whitespace-nowrap text-muted">{formatShortDate(w.weekStart).replace(' ', '\u00a0')}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrackTotals({ perTrack }: { perTrack: StatsResponse['perTrack'] }) {
  const rows = useMemo(() => {
    const map = new Map<TrackKey, { points: number; minutes: number; tasks: number }>();
    for (const p of perTrack) {
      const k = trackKey(p.track, p.stream);
      const cur = map.get(k) ?? { points: 0, minutes: 0, tasks: 0 };
      cur.points += p.points;
      cur.minutes += p.minutes;
      cur.tasks += p.tasks;
      map.set(k, cur);
    }
    return TRACK_ORDER.map((k) => ({ key: k, ...(map.get(k) ?? { points: 0, minutes: 0, tasks: 0 }) }));
  }, [perTrack]);
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const m = metaByKey(r.key);
        const I = m.icon;
        return (
          <li key={r.key}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className={cn('inline-flex items-center gap-1.5 font-medium', m.text)}>
                <I size={16} aria-hidden />
                {m.label}
              </span>
              <span className="text-xs text-muted">
                <span className="num text-sm font-semibold text-ink">{r.points}</span> pts, {formatHours(r.minutes)}, {r.tasks} tasks
              </span>
            </div>
            <ProgressBar value={r.points} max={max} color={m.cssVar} height={8} label={`${m.label} points`} />
          </li>
        );
      })}
    </ul>
  );
}

export function StatsPage() {
  const q = useStats();
  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-40" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-52 rounded-2xl" />
      </div>
    );
  }
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const hasData = d.totals.points > 0;
  const tiles = [
    { label: 'Current streak', value: d.streak.current, unit: d.streak.current === 1 ? 'day' : 'days', icon: Fire, accent: d.streak.todayCounts },
    { label: 'Longest streak', value: d.streak.longest, unit: d.streak.longest === 1 ? 'day' : 'days', icon: Trophy, accent: false },
    { label: 'Total points', value: d.totals.points, unit: `level ${d.level.level}`, icon: Lightning, accent: false },
    { label: 'Days counted', value: d.totals.daysCounted, unit: 'last 365 days', icon: SealCheck, accent: false },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Stats" subtitle="A day counts when its points reach that day's goal. Rest days pause the streak without breaking it." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div key={t.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t.label}</span>
              <span className={cn('inline-flex size-8 items-center justify-center rounded-xl', t.accent ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted')}>
                <t.icon size={17} weight={t.accent ? 'fill' : 'regular'} aria-hidden />
              </span>
            </div>
            <AnimatedNumber value={t.value} className="mt-2 block text-3xl font-semibold text-ink" />
            <span className="text-xs text-muted">{t.unit}</span>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Last 365 days</h2>
            <p className="text-sm text-muted">Green days reached their goal. Grey days had some points but fell short.</p>
          </div>
          <HeatLegend />
        </div>
        <Heatmap daily={d.daily} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">Points per week</h2>
          <p className="mb-4 text-sm text-muted">The last 12 weeks, Sunday to Saturday.</p>
          {hasData ? <WeeklyBars weekly={d.weekly} today={d.today} /> : <EmptyState icon={ChartBar} title="No points yet" body="Complete your first task on the Today page and your weeks start filling in here." />}
        </Card>
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">Totals per track</h2>
          <p className="mb-4 text-sm text-muted">Everything completed in the last year.</p>
          <TrackTotals perTrack={d.perTrack} />
        </Card>
      </div>
    </div>
  );
}
