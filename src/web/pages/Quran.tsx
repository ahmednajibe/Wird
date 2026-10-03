import { ArrowsClockwise, BookOpen, CalendarBlank, Info, Repeat, TrendUp } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { diffDays } from '../../shared/dates.js';
import { errorMessage } from '../client/client';
import { useCatalog, useQuran } from '../client/hooks';
import type { QuranPageView, QuranResponse } from '../client/types';
import { QuranSegments, SegmentRow } from '../components/QuranSegments';
import { AnimatedNumber, Card, Chip, ErrorState, PageHeader, ProgressBar, Ring, Skeleton } from '../components/ui/primitives';
import { useI18n } from '../i18n';
import { localizeTaskTitle } from '../i18n/engineText';
import { cn, formatMediumDate, formatMinutes } from '../lib/format';
import { formatPages, pageSegments, segmentView } from '../lib/quran';

const RECENT_DAYS = 7;

type CellState = 'empty' | 'fresh' | 'memorized' | 'recent' | 'next';

function cellState(p: QuranPageView, today: string, next: number | null): CellState {
  if (!p.memorized) return p.page === next ? 'next' : 'empty';
  if (p.lastReviewed === null) return 'fresh';
  return diffDays(p.lastReviewed, today) <= RECENT_DAYS ? 'recent' : 'memorized';
}

const CELL_CLASS: Record<CellState, string> = {
  empty: 'bg-[var(--grid-empty)] hover:bg-surface-3',
  fresh: 'bg-amber/40',
  memorized: 'bg-amber/75',
  recent: 'bg-amber shadow-[0_0_8px_-1px_var(--amber)]',
  next: 'bg-[var(--grid-empty)] ring-2 ring-inset ring-amber-ink',
};

function orderInWords(order: string, t: (key: 'quran.orderForward' | 'quran.orderJuz') => string): string {
  return order === 'forward' ? t('quran.orderForward') : t('quran.orderJuz');
}

function Tooltip({ page, rect, container }: { page: QuranPageView; rect: DOMRect; container: DOMRect }) {
  const { t } = useI18n();
  const segs = page.segments.map(segmentView);
  const left = Math.min(Math.max(rect.left - container.left + rect.width / 2, 130), container.width - 130);
  const above = rect.top - container.top > 190;
  return (
    <div
      className="pointer-events-none absolute z-30 w-[260px]"
      style={{ left, top: above ? rect.top - container.top - 8 : rect.bottom - container.top + 8, transform: `translate(-50%, ${above ? '-100%' : '0'})` }}
    >
    <motion.div
      role="tooltip"
      initial={{ opacity: 0, y: above ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="rounded-2xl border border-line-strong bg-surface p-3.5 shadow-pop"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{t('quran.page', { page: page.page })}</span>
        <span className="text-xs text-muted">{t('quran.juz', { juz: page.juz })}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {segs.map((s) => (
          <li key={`${s.surah}-${s.fromAyah}`} className="text-sm">
            <SegmentRow seg={s} />
          </li>
        ))}
      </ul>
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5 text-xs">
        <div>
          <div className="text-muted">{t('quran.memorized')}</div>
          <div className="text-ink">{page.memorizedDate ? formatMediumDate(page.memorizedDate) : t('quran.notYet')}</div>
        </div>
        <div>
          <div className="text-muted">{t('quran.lastReviewed')}</div>
          <div className="text-ink">{page.lastReviewed ? formatMediumDate(page.lastReviewed) : page.memorized ? t('quran.never') : '-'}</div>
        </div>
      </div>
    </motion.div>
    </div>
  );
}

function PageGrid({ data }: { data: QuranResponse }) {
  const { t, lang } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ page: QuranPageView; rect: DOMRect } | null>(null);
  const byPage = useMemo(() => new Map(data.pages.map((p) => [p.page, p])), [data.pages]);
  const show = (p: QuranPageView, el: HTMLElement) => setHover({ page: p, rect: el.getBoundingClientRect() });
  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex flex-col gap-1 sm:gap-1.5" data-testid="quran-grid">
        {data.juz.map((j) => {
          const pages: QuranPageView[] = [];
          for (let p = j.startPage; p <= j.endPage; p++) {
            const v = byPage.get(p);
            if (v) pages.push(v);
          }
          const memorized = pages.filter((p) => p.memorized).length;
          return (
            <div key={j.number} className="grid grid-cols-[34px_1fr_28px] items-center gap-2 sm:grid-cols-[52px_1fr_44px] sm:gap-3">
              <span className="num text-[11px] text-muted sm:text-xs">
                <span className="hidden sm:inline">{t('quran.juzShort')}</span>
                {j.number}
              </span>
              <div className="grid gap-[3px] sm:gap-1" style={{ gridTemplateColumns: 'repeat(23, minmax(0, 1fr))' }}>
                {pages.map((p) => {
                  const st = cellState(p, data.today, data.nextPage);
                  return (
                    <button
                      key={p.page}
                      type="button"
                      data-testid="quran-cell"
                      data-state={st}
                      aria-label={t('quran.cellAria', {
                        page: p.page,
                        label: lang === 'ar' ? pageSegments(p.page).map((s) => `${s.nameAr} ${s.ayahs}`).join('، ') : p.label,
                        suffix: p.memorized ? t('quran.cellMemorized') : '',
                      })}
                      onMouseEnter={(e) => show(p, e.currentTarget)}
                      onFocus={(e) => show(p, e.currentTarget)}
                      onBlur={() => setHover(null)}
                      onClick={(e) => show(p, e.currentTarget)}
                      className={cn('relative aspect-square rounded-[3px] transition-colors sm:rounded-[5px]', CELL_CLASS[st])}
                    >
                      {st === 'next' && <span aria-hidden className="pulse-ring absolute -inset-[3px] rounded-[6px] border-2 border-amber-ink" />}
                    </button>
                  );
                })}
              </div>
              <span className="num text-end text-[11px] text-muted sm:text-xs">
                {memorized > 0 ? `${memorized}/${pages.length}` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <AnimatePresence>
        {hover && wrap.current && <Tooltip key={hover.page.page} page={hover.page} rect={hover.rect} container={wrap.current.getBoundingClientRect()} />}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  const { t, tn } = useI18n();
  const items: { cls: string; label: string }[] = [
    { cls: 'bg-amber', label: tn('quran.legendRecent', RECENT_DAYS) },
    { cls: 'bg-amber/75', label: t('quran.memorized') },
    { cls: 'bg-amber/40', label: t('quran.legendFresh') },
    { cls: 'bg-[var(--grid-empty)] ring-2 ring-inset ring-amber-ink', label: t('quran.legendNext') },
    { cls: 'bg-[var(--grid-empty)] border border-line', label: t('week.notStarted') },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted xl:flex-col">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-2">
          <span className={cn('size-3.5 shrink-0 rounded-[3px]', i.cls)} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function QuranPage() {
  const q = useQuran();
  const catalog = useCatalog();
  const { t, tn, tRich, tnRich, lang } = useI18n();
  if (catalog.data && !catalog.data.quranEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('nav.quran')} />
        <Card className="p-5 sm:p-6" data-testid="quran-disabled">
          <p className="text-sm text-muted">
            {tRich('quran.disabled', {
              link: (
                <Link to="/settings" className="text-accent-ink underline underline-offset-2">
                  {t('nav.settings')}
                </Link>
              ),
            })}
          </p>
        </Card>
      </div>
    );
  }
  if (q.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    );
  }
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const pct = Math.round((d.memorized / 604) * 1000) / 10;
  const pr = d.projection;
  const rc = d.reviewCycle;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.quran')}
        subtitle={t('quran.subtitle')}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <Card className="flex items-center gap-5 p-5 sm:p-6">
          <Ring value={d.memorized} max={604} size={128} stroke={12} color="var(--amber)" label={t('quran.ringAria', { n: d.memorized, total: 604 })}>
            <AnimatedNumber value={d.memorized} className="text-3xl leading-none font-semibold text-ink" data-testid="quran-memorized" />
            <span className="mt-1 text-xs text-muted">{t('quran.ofTotal', { total: 604 })}</span>
          </Ring>
          <div className="min-w-0">
            <div className="label">{t('quran.memorized')}</div>
            <p className="num mt-1 text-2xl font-semibold text-amber-ink">{pct}%</p>
            <p className="mt-1 text-sm text-muted">{tn('quran.pagesToGo', 604 - d.memorized)}</p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="label">{t('quran.nextSession')}</div>
            <Chip tone="amber" icon={d.nextSessionType === 'memorize' ? BookOpen : Repeat}>
              {d.nextSessionType === 'memorize' ? t('type.quran-memorize') : t('type.quran-review')}
            </Chip>
          </div>
          <p className="mt-2 text-lg font-semibold text-ink">{localizeTaskTitle(d.nextSession.title, lang)}</p>
          <p className="text-sm text-muted">{t('quran.aboutMin', { min: formatMinutes(d.nextSession.minutes) })}</p>
          {d.nextPage !== null && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-xs text-muted">
                {tRich('quran.nextNew', { page: <bdi className="num text-ink">{d.nextPage}</bdi> })}
              </div>
              <QuranSegments pages={[d.nextPage]} />
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="label">{t('quran.reviewCycle')}</div>
          <p className="mt-2 text-lg font-semibold text-ink">
            {rc.cycleLength === 0 ? t('quran.nothingToReview') : rc.reviewAll ? t('quran.everyPage') : tn('quran.fullCycle', rc.cycleLength)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {tRich('quran.reviewSplit', {
              cap: <bdi className="num text-ink">{rc.capPages}</bdi>,
              near: <bdi className="num text-ink">{rc.nearPages}</bdi>,
              far: <bdi className="num text-ink">{rc.farPerSession}</bdi>,
            })}
          </p>
          {rc.nextReview.pages.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {tRich('quran.nextReview', {
                pages: <bdi className="num text-ink">{formatPages(rc.nextReview.pages)}</bdi>,
                min: formatMinutes(rc.nextReview.minutes),
              })}
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="flex items-start gap-3 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber/12 text-amber-ink">
            <CalendarBlank size={19} aria-hidden />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{t('quran.plannedPace')}</div>
            <p className="mt-0.5 text-sm text-muted">
              {tRich('quran.plannedPaceBody', {
                pages: <bdi className="num text-ink">{pr.plannedPagesPerWeek}</bdi>,
                date: <bdi className="text-ink">{pr.plannedCompletionDate ? formatMediumDate(pr.plannedCompletionDate) : t('quran.noDate')}</bdi>,
              })}
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber/12 text-amber-ink">
            <TrendUp size={19} aria-hidden />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">{t('quran.actualPace')}</div>
            <p className="mt-0.5 text-sm text-muted">
              {pr.actualPagesPerWeek !== null
                ? tnRich('quran.actualPaceBody', pr.daysOfData, {
                    pages: <bdi className="num text-ink">{pr.actualPagesPerWeek}</bdi>,
                    date: <bdi className="text-ink">{pr.actualCompletionDate ? formatMediumDate(pr.actualCompletionDate) : t('quran.noDate')}</bdi>,
                  })
                : t('quran.noPace')}
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,660px)_1fr] xl:gap-10">
          <div className="min-w-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">{tn('quran.totalPages', 604)}</h2>
              <p className="text-sm text-muted">{t('quran.gridHint')}</p>
            </div>
            <div className="mb-4 xl:hidden">
              <Legend />
            </div>
            <PageGrid data={d} />
          </div>
          <div className="flex flex-col gap-5 xl:border-s xl:border-line xl:ps-10">
            <div className="hidden xl:block">
              <h3 className="label mb-3">{t('quran.legend')}</h3>
              <Legend />
            </div>
            <div>
              <h3 className="label mb-2">{t('quran.progress')}</h3>
              <ProgressBar value={d.memorized} max={604} color="var(--amber)" height={8} label={t('quran.pagesMemorized')} />
              <p className="mt-1.5 text-xs text-muted">
                {tRich('quran.progressLine', {
                  memorized: <bdi className="num text-ink">{d.memorized}</bdi>,
                  total: <bdi className="num">604</bdi>,
                  fresh: <bdi className="num">{d.pages.filter((p) => p.memorized && p.lastReviewed === null).length}</bdi>,
                })}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <ArrowsClockwise size={19} aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{t('quran.order')}</div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{orderInWords(d.settings.memorizationOrder, t)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <Info size={19} aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">{t('quran.dataTitle')}</div>
                <p className="mt-0.5 text-sm text-muted">
                  <bdi dir="ltr">{d.attribution}.</bdi>{' '}
                  <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="text-accent-ink underline underline-offset-2">
                    tanzil.net
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
