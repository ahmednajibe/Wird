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
import { formatPages, segmentView } from '../lib/quran';

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

function orderInWords(order: string): string {
  if (order === 'forward') return 'Straight through the mushaf: page 1 (Al-Fatiha) to page 604 (An-Nas).';
  return 'Juz 30 first, starting from the last page (An-Nas) and working back to An-Naba on page 582. Then Juz 29 from Al-Mulk (page 562) forward to page 581. Then from page 1 (Al-Fatiha) forward through the end of Juz 28 (page 561).';
}

function Tooltip({ page, rect, container }: { page: QuranPageView; rect: DOMRect; container: DOMRect }) {
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
        <span className="text-sm font-semibold text-ink">Page {page.page}</span>
        <span className="text-xs text-muted">Juz {page.juz}</span>
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
          <div className="text-muted">Memorized</div>
          <div className="text-ink">{page.memorizedDate ? formatMediumDate(page.memorizedDate) : 'Not yet'}</div>
        </div>
        <div>
          <div className="text-muted">Last reviewed</div>
          <div className="text-ink">{page.lastReviewed ? formatMediumDate(page.lastReviewed) : page.memorized ? 'Never' : '-'}</div>
        </div>
      </div>
    </motion.div>
    </div>
  );
}

function PageGrid({ data }: { data: QuranResponse }) {
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
                <span className="hidden sm:inline">Juz </span>
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
                      aria-label={`Page ${p.page}, ${p.label}${p.memorized ? ', memorized' : ''}`}
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
  const items: { cls: string; label: string }[] = [
    { cls: 'bg-amber', label: `Reviewed in the last ${RECENT_DAYS} days` },
    { cls: 'bg-amber/75', label: 'Memorized' },
    { cls: 'bg-amber/40', label: 'Memorized, never reviewed' },
    { cls: 'bg-[var(--grid-empty)] ring-2 ring-inset ring-amber-ink', label: 'Next page' },
    { cls: 'bg-[var(--grid-empty)] border border-line', label: 'Not started' },
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
  const { lang } = useI18n();
  if (catalog.data && !catalog.data.quranEnabled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Quran" />
        <Card className="p-5 sm:p-6" data-testid="quran-disabled">
          <p className="text-sm text-muted">
            Quran is turned off. You can turn it on in{' '}
            <Link to="/settings" className="text-accent-ink underline underline-offset-2">
              Settings
            </Link>
            .
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
        title="Quran"
        subtitle="Memorize a page one day, review the next. Reviews rotate through everything you know so no page is left behind."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <Card className="flex items-center gap-5 p-5 sm:p-6">
          <Ring value={d.memorized} max={604} size={128} stroke={12} color="var(--amber)" label={`${d.memorized} of 604 pages memorized`}>
            <AnimatedNumber value={d.memorized} className="text-3xl leading-none font-semibold text-ink" data-testid="quran-memorized" />
            <span className="mt-1 text-xs text-muted">of 604</span>
          </Ring>
          <div className="min-w-0">
            <div className="label">Memorized</div>
            <p className="num mt-1 text-2xl font-semibold text-amber-ink">{pct}%</p>
            <p className="mt-1 text-sm text-muted">{604 - d.memorized} pages to go</p>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="label">Next session</div>
            <Chip tone="amber" icon={d.nextSessionType === 'memorize' ? BookOpen : Repeat}>
              {d.nextSessionType === 'memorize' ? 'Memorize' : 'Review'}
            </Chip>
          </div>
          <p className="mt-2 text-lg font-semibold text-ink">{localizeTaskTitle(d.nextSession.title, lang)}</p>
          <p className="text-sm text-muted">About {formatMinutes(d.nextSession.minutes)}</p>
          {d.nextPage !== null && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-xs text-muted">
                Next new page: <span className="num text-ink">{d.nextPage}</span>
              </div>
              <QuranSegments pages={[d.nextPage]} />
            </div>
          )}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="label">Review cycle</div>
          <p className="mt-2 text-lg font-semibold text-ink">
            {rc.cycleLength === 0 ? 'Nothing to review yet' : rc.reviewAll ? 'Every page, every review' : `Full cycle every ${rc.cycleLength} reviews`}
          </p>
          <p className="mt-1 text-sm text-muted">
            Up to <span className="num text-ink">{rc.capPages}</span> pages per review: the <span className="num text-ink">{rc.nearPages}</span> most recent plus the{' '}
            <span className="num text-ink">{rc.farPerSession}</span> longest unreviewed.
          </p>
          {rc.nextReview.pages.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Next review: pages <span className="num text-ink">{formatPages(rc.nextReview.pages)}</span> ({formatMinutes(rc.nextReview.minutes)})
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
            <div className="text-sm font-semibold text-ink">Planned pace</div>
            <p className="mt-0.5 text-sm text-muted">
              <span className="num text-ink">{pr.plannedPagesPerWeek}</span> pages a week. Finish on{' '}
              <span className="text-ink">{pr.plannedCompletionDate ? formatMediumDate(pr.plannedCompletionDate) : 'no date yet'}</span>.
            </p>
          </div>
        </Card>
        <Card className="flex items-start gap-3 p-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber/12 text-amber-ink">
            <TrendUp size={19} aria-hidden />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">Your actual pace</div>
            <p className="mt-0.5 text-sm text-muted">
              {pr.actualPagesPerWeek !== null ? (
                <>
                  <span className="num text-ink">{pr.actualPagesPerWeek}</span> pages a week over {pr.daysOfData} days. At this pace you finish on{' '}
                  <span className="text-ink">{pr.actualCompletionDate ? formatMediumDate(pr.actualCompletionDate) : 'no date yet'}</span>.
                </>
              ) : (
                'Complete a few memorize sessions to see a projection from your real pace.'
              )}
            </p>
          </div>
        </Card>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,660px)_1fr] xl:gap-10">
          <div className="min-w-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold tracking-tight">604 pages</h2>
              <p className="text-sm text-muted">One row per juz. Hover or tap a page for its surahs and dates.</p>
            </div>
            <div className="mb-4 xl:hidden">
              <Legend />
            </div>
            <PageGrid data={d} />
          </div>
          <div className="flex flex-col gap-5 xl:border-s xl:border-line xl:ps-10">
            <div className="hidden xl:block">
              <h3 className="label mb-3">Legend</h3>
              <Legend />
            </div>
            <div>
              <h3 className="label mb-2">Progress</h3>
              <ProgressBar value={d.memorized} max={604} color="var(--amber)" height={8} label="Pages memorized" />
              <p className="mt-1.5 text-xs text-muted">
                <span className="num text-ink">{d.memorized}</span> of <span className="num">604</span> pages,{' '}
                <span className="num">{d.pages.filter((p) => p.memorized && p.lastReviewed === null).length}</span> not reviewed yet
              </p>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <ArrowsClockwise size={19} aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">Memorization order</div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{orderInWords(d.settings.memorizationOrder)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <Info size={19} aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">Quran data</div>
                <p className="mt-0.5 text-sm text-muted">
                  {d.attribution}.{' '}
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
