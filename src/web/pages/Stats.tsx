import { ChartBar, Fire, Lightning, SealCheck, Trophy } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { QURAN_TRACK_ID } from '../../shared/catalog.js';
import { addDays, weekStart } from '../../shared/dates.js';
import { errorMessage } from '../client/client';
import { useCatalog, useStats } from '../client/hooks';
import type { CatalogResponse, StatsResponse } from '../client/types';
import { AnimatedNumber, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from '../components/ui/primitives';
import { useI18n } from '../i18n';
import { dayNameShort } from '../i18n/engineText';
import { cn, formatHours, formatMediumDate, formatMonthShort, formatShortDate } from '../lib/format';
import { metaFor, streamOrderMap } from '../lib/tracks';

/** Fixed Sunday-start week used to render weekday names (dow index -> date). */
const DOW_EPOCH = '2024-01-07';

type Day = StatsResponse['daily'][number];

function level(d: Day): string {
  if (d.beforeStart) return 'bg-transparent border border-line opacity-40';
  if (d.isRestDay) return 'border border-dashed border-line-strong bg-transparent';
  if (d.points <= 0) return 'bg-[var(--grid-empty)]';
  const ratio = d.baseline > 0 ? d.points / d.baseline : 2;
  if (!d.counts) return ratio < 0.5 ? 'bg-muted/25' : 'bg-muted/50';
  if (ratio < 1.5) return 'bg-accent-fill/55';
  if (ratio < 2.5) return 'bg-accent-fill/80';
  return 'bg-accent-fill';
}

function Heatmap({ daily }: { daily: Day[] }) {
  const { t, tn, lang } = useI18n();
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

  // The year grid opens on the newest week: inline-end is right in LTR, left in RTL.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    el.querySelector<HTMLElement>('[data-heatmap-newest]')?.scrollIntoView({ inline: 'end', block: 'nearest' });
  }, [weeks, lang]);

  // Month label per column, skipped when the previous label is less than
  // 3 columns back so a partial first month cannot collide with the next.
  const monthLabels = useMemo(() => {
    let last = -3;
    return weeks.map((w, i) => {
      const firstDay = w.find((d) => d !== null);
      if (firstDay && Number(firstDay.date.slice(8, 10)) <= 7 && i - last >= 3) {
        last = i;
        return formatMonthShort(firstDay.date);
      }
      return '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, lang]);

  return (
    <div ref={scroller} className="scrollbar-thin overflow-x-auto pb-2">
      <div className="inline-flex min-w-full flex-col gap-1.5">
        <div className="flex gap-[3px] ps-8 text-3xs text-muted">
          {monthLabels.map((label, i) => (
            <span key={i} className="w-3 shrink-0 overflow-visible whitespace-nowrap lg:w-[14px]">
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex w-7 shrink-0 flex-col gap-[3px] text-3xs text-muted">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span key={i} className="flex h-3 items-center lg:h-[14px]">
                {i % 2 === 0 ? dayNameShort(addDays(DOW_EPOCH, i), lang) : ''}
              </span>
            ))}
          </div>
          {weeks.map((w, i) => (
            <div key={i} data-heatmap-newest={i === weeks.length - 1 ? true : undefined} className="flex flex-col gap-[3px]">
              {w.map((d, j) =>
                d ? (
                  <span
                    key={j}
                    data-testid="heat-cell"
                    data-before-start={d.beforeStart ? 'true' : undefined}
                    title={
                      d.beforeStart
                        ? t('stats.heatNotStarted', { date: formatMediumDate(d.date) })
                        : t('stats.heatTitle', {
                            date: formatMediumDate(d.date),
                            points: tn('common.points', d.points),
                            rest: d.isRestDay ? t('stats.restSuffix') : '',
                            goal: d.isRestDay ? '' : t('stats.goalSuffix', { goal: d.baseline }),
                            counted: d.counts ? t('week.countedSuffix') : '',
                          })
                    }
                    className={cn('size-3 rounded-[3px] lg:size-[14px]', level(d))}
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
  const { t } = useI18n();
  const items = [
    { cls: 'bg-[var(--grid-empty)]', label: t('stats.noPoints') },
    { cls: 'bg-muted/40', label: t('stats.belowGoal') },
    { cls: 'bg-accent-fill/55', label: t('stats.goalReached') },
    { cls: 'bg-accent-fill', label: t('stats.goalMore') },
    { cls: 'border border-dashed border-line-strong', label: t('today.restDay') },
    { cls: 'border border-line opacity-40', label: t('week.notStarted') },
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
  const { t, tn, lang } = useI18n();
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
            <span className={cn('num text-3xs sm:text-xs', current ? 'font-semibold text-accent-ink' : 'text-muted')}>{w.points > 0 ? w.points : ''}</span>
            <div className="relative w-full flex-1">
              <motion.div
                className={cn('absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-lg', current ? 'bg-accent-fill' : 'bg-accent-fill/45')}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: w.points / max }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 140, damping: 22 }}
                title={t('stats.weekOf', { date: formatShortDate(w.weekStart), points: tn('common.points', w.points), minutes: formatHours(w.minutes) })}
              />
            </div>
            {/* Sparse every-third date labels: twelve nowrap labels cannot fit
                the columns below xl (Arabic labels are wider, so they stay
                sparse at every width). */}
            <span className={cn('num text-3xs whitespace-nowrap text-muted', (weeks.length - 1 - i) % 3 !== 0 && (lang === 'ar' ? 'hidden' : 'hidden xl:block'))}>
              {formatShortDate(w.weekStart).replace(' ', '\u00a0')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TrackTotals({ perTrack, catalog }: { perTrack: StatsResponse['perTrack']; catalog: CatalogResponse | undefined }) {
  const { t, tn, tRich, tnRich } = useI18n();
  const rows = useMemo(() => {
    const map = new Map<string, { track: string; stream: string; points: number; minutes: number; tasks: number }>();
    for (const p of perTrack) {
      const k = `${p.track}.${p.stream}`;
      const cur = map.get(k) ?? { track: p.track, stream: p.stream, points: 0, minutes: 0, tasks: 0 };
      cur.points += p.points;
      cur.minutes += p.minutes;
      cur.tasks += p.tasks;
      map.set(k, cur);
    }
    // Quran first when enabled or when history has Quran rows, then catalog order.
    const order = streamOrderMap(catalog, (catalog?.quranEnabled ?? false) || perTrack.some((p) => p.track === QURAN_TRACK_ID));
    return [...map.values()].sort((a, b) => (order.get(`${a.track}.${a.stream}`) ?? order.get(a.track) ?? 999) - (order.get(`${b.track}.${b.stream}`) ?? order.get(b.track) ?? 999));
  }, [perTrack, catalog]);
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const m = metaFor(catalog, r.track, r.stream, t('nav.quran'));
        const I = m.icon;
        return (
          <li key={`${r.track}.${r.stream}`}>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className={cn('inline-flex items-center gap-1.5 font-medium', m.text)}>
                <I size={16} aria-hidden />
                {m.label}
              </span>
              <span className="text-xs text-muted">
                {tRich('stats.trackLine', {
                  points: tnRich('common.points', r.points, { count: <bdi className="num text-sm font-semibold text-ink">{r.points}</bdi> }),
                  minutes: <bdi>{formatHours(r.minutes)}</bdi>,
                  tasks: tn('stats.tasks', r.tasks),
                })}
              </span>
            </div>
            <ProgressBar value={r.points} max={max} color={m.cssVar} height={8} label={t('stats.trackPointsAria', { label: m.label })} />
          </li>
        );
      })}
    </ul>
  );
}

export function StatsPage() {
  const q = useStats();
  const catalog = useCatalog();
  const { t, tn, tRich } = useI18n();
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
    { label: t('stats.currentStreak'), value: d.streak.current, unit: tn('common.days', d.streak.current), icon: Fire, accent: d.streak.todayCounts },
    { label: t('stats.longestStreak'), value: d.streak.longest, unit: tn('common.days', d.streak.longest), icon: Trophy, accent: false },
    { label: t('stats.totalPoints'), value: d.totals.points, unit: t('stats.levelUnit', { level: d.level.level }), icon: Lightning, accent: false },
    { label: t('stats.daysCounted'), value: d.totals.daysCounted, unit: t('stats.last365'), icon: SealCheck, accent: false },
  ];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.stats')} subtitle={t('stats.subtitle')} />
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
            <h2 className="text-lg font-semibold tracking-tight">{t('stats.year')}</h2>
            <p className="text-sm text-muted">
              {tRich('stats.heatCaption', { date: <bdi>{formatMediumDate(d.trackingStartDate)}</bdi> })}
            </p>
          </div>
          <HeatLegend />
        </div>
        <Heatmap daily={d.daily} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="min-w-0 p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t('stats.weekPoints')}</h2>
          <p className="mb-4 text-sm text-muted">{t('stats.weekPointsSub')}</p>
          {hasData ? <WeeklyBars weekly={d.weekly} today={d.today} /> : <EmptyState icon={ChartBar} title={t('stats.noPointsTitle')} body={t('stats.noPointsBody')} />}
        </Card>
        <Card className="min-w-0 p-4 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">{t('stats.trackTotals')}</h2>
          <p className="mb-4 text-sm text-muted">{t('stats.trackTotalsSub')}</p>
          <TrackTotals perTrack={d.perTrack} catalog={catalog.data} />
        </Card>
      </div>
    </div>
  );
}
