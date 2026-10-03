import {
  ArrowBendUpRight,
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  Check,
  Coffee,
  Hourglass,
  Info,
  Lightning,
  Lock,
  Moon,
  NotePencil,
  PencilSimple,
  SkipForward,
  WarningCircle,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { QURAN_TRACK_ID } from '../../shared/catalog.js';
import { addDays, today as cairoToday, weekStart } from '../../shared/dates.js';
import { errorMessage } from '../client/client';
import { useCatalog, useDashboard, useRegenerate, useSaveDay, useSettings, useTracks, useWeek } from '../client/hooks';
import type { DayView, TaskView } from '../client/types';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog';
import { Chip, Disclosure, Duration, ErrorState, PageHeader, ProgressBar, Segmented, Skeleton } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { cn, formatMediumDate, formatShortDate } from '../lib/format';
import { streamOrderMap, useTrackMeta } from '../lib/tracks';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StatusIcon({ t }: { t: TaskView }) {
  const trackMeta = useTrackMeta();
  if (t.status === 'completed')
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent" title="Completed">
        <Check size={11} weight="bold" aria-hidden />
      </span>
    );
  if (t.status === 'skipped') return <SkipForward size={16} className="shrink-0 text-muted rtl:-scale-x-100" aria-label="Skipped" />;
  if (t.status === 'rolled') return <ArrowBendUpRight size={16} className="shrink-0 text-subtle rtl:-scale-x-100" aria-label="Moved forward" />;
  if (t.status === 'missed') return <WarningCircle size={16} className="shrink-0 text-warn" aria-label="Missed" />;
  const m = trackMeta(t.track, t.stream);
  return <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: m.cssVar }} aria-label="Pending" />;
}

function NotStartedCard({ day, index }: { day: DayView; index: number }) {
  return (
    <motion.div
      id={day.date}
      data-testid="day-card"
      data-before-start="true"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 380, damping: 32 }}
      className="card flex scroll-mt-20 flex-col border-dashed p-4 opacity-60 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight text-muted">{day.dayName}</h3>
        <Chip>Not started</Chip>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        {formatMediumDate(day.date)}
        <span className="mx-1.5 text-subtle">/</span>
        {day.hijri.label}
      </p>
      <p className="mt-3 text-sm text-muted">Tracking started after this day. Nothing was planned and nothing counts as missed.</p>
    </motion.div>
  );
}

function DayCard({ day, onEdit, index }: { day: DayView; onEdit: (d: DayView) => void; index: number }) {
  const trackMeta = useTrackMeta();
  const cap = day.capacity;
  const done = day.tasks.filter((t) => t.status === 'completed').length;
  const countable = day.tasks.filter((t) => t.status !== 'rolled').length;
  if (day.beforeStart) return <NotStartedCard day={day} index={index} />;
  return (
    <motion.div
      id={day.date}
      data-testid="day-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 380, damping: 32 }}
      className={cn('card flex scroll-mt-20 flex-col p-4 sm:p-5', day.isToday && 'border-accent/45 ring-1 ring-accent/25')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-ink">{day.dayName}</h3>
            {day.isToday && <Chip tone="accent">Today</Chip>}
            {day.counts && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-on-accent" title="Counted toward the streak">
                <Check size={11} weight="bold" aria-label="Counted" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {formatMediumDate(day.date)}
            <span className="mx-1.5 text-subtle">/</span>
            {day.hijri.label}
          </p>
        </div>
        {day.isPast ? (
          <span className="inline-flex size-8 items-center justify-center text-subtle" title="Past days are locked">
            <Lock size={16} aria-label="Past day, locked" />
          </span>
        ) : (
          <IconButton icon={PencilSimple} size="sm" label={`Edit ${day.dayName}`} onClick={() => onEdit(day)} data-testid="day-edit" />
        )}
      </div>

      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        {day.fasting.isFasting && (
          <Chip tone="warn" icon={Moon} title={day.fasting.reasons.join(', ')}>
            Fasting
          </Chip>
        )}
        {day.fasting.isFasting && <span className="text-xs text-muted">{day.fasting.reasons.join(', ')}</span>}
        {!day.fasting.isFasting && day.fasting.blockedBy && <Chip tone="accent">{day.fasting.reasons[0] ?? day.fasting.blockedBy}</Chip>}
        {cap.isRestDay && (
          <Chip icon={Coffee}>Rest day</Chip>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            Planned <span className="num text-ink">{day.plannedMinutes}</span> of <span className="num">{cap.total}</span> min
          </span>
          {cap.override !== null && !cap.isRestDay && <span>Custom capacity</span>}
        </div>
        <ProgressBar value={day.plannedMinutes} max={Math.max(cap.total, 1)} height={6} color="var(--muted)" label="Planned minutes vs capacity" />
        {day.bufferMinutes > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted" data-testid="day-buffer">
            <Hourglass size={13} aria-hidden />
            Buffer: <span className="num text-ink">{day.bufferMinutes}</span> min (optional catch-up or rest)
          </p>
        )}
      </div>

      {day.override?.note && (
        <p className="mt-3 flex items-start gap-1.5 rounded-[10px] bg-surface-2 px-2.5 py-2 text-xs text-muted">
          <NotePencil size={14} className="mt-px shrink-0" aria-hidden />
          {day.override.note}
        </p>
      )}

      <ul className="mt-3 flex flex-1 flex-col divide-y divide-line">
        {day.tasks.length === 0 && <li className="py-3 text-sm text-muted">{cap.isRestDay ? 'Nothing planned. Rest well.' : 'No tasks planned.'}</li>}
        {day.tasks.map((t) => {
          const m = trackMeta(t.track, t.stream);
          return (
            <li key={t.id} className="flex items-center gap-2.5 py-2.5">
              <StatusIcon t={t} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-sm font-medium text-ink',
                    (t.status === 'completed' || t.status === 'skipped') && 'text-muted line-through decoration-1',
                    t.status === 'rolled' && 'text-subtle',
                  )}
                  title={t.title}
                >
                  {t.title}
                </p>
                <p className="text-xs">
                  <span className={m.text}>{m.short}</span>
                  <span className="text-muted">
                    {' '}
                    <span className="num">{t.actualMinutes ?? t.plannedMinutes}</span> min
                  </span>
                  {t.status === 'rolled' && <span className="text-subtle"> / Moved forward</span>}
                </p>
              </div>
              {t.status !== 'rolled' && (
                <span className={cn('num shrink-0 text-xs font-semibold', t.status === 'completed' ? 'text-accent-ink' : 'text-muted')}>
                  {t.status === 'completed' ? `+${t.earnedPoints ?? 0}` : t.plannedPoints}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span>
          {done}/{countable} done
        </span>
        <span className="inline-flex items-center gap-1">
          <Lightning size={13} weight="fill" className="text-accent-ink" aria-hidden />
          <span className="num text-ink">{day.earnedPoints}</span> / <span className="num">{day.plannedPoints}</span> points
          {!cap.isRestDay && (
            <span className="ms-1">
              (goal <span className="num">{day.baseline}</span>)
            </span>
          )}
        </span>
      </div>
    </motion.div>
  );
}

type FastingChoice = 'auto' | 'on' | 'off';
type CapacityChoice = 'default' | 'custom' | 'rest';

function OverrideDialog({ day, onClose }: { day: DayView | null; onClose: () => void }) {
  const save = useSaveDay();
  const { toast } = useToast();
  const [fasting, setFasting] = useState<FastingChoice>('auto');
  const [capMode, setCapMode] = useState<CapacityChoice>('default');
  const [capValue, setCapValue] = useState('120');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!day) return;
    const ov = day.override;
    setFasting(ov?.fasting === true ? 'on' : ov?.fasting === false ? 'off' : 'auto');
    const c = ov?.capacityOverride ?? null;
    setCapMode(c === null ? 'default' : c === 0 ? 'rest' : 'custom');
    setCapValue(String(c && c > 0 ? c : day.capacity.base));
    setNote(ov?.note ?? '');
    setError(null);
  }, [day]);

  const capNum = Number(capValue);
  const capValid = capMode !== 'custom' || (Number.isInteger(capNum) && capNum >= 1 && capNum <= 960);

  const submit = async () => {
    if (!day) return;
    if (!capValid) {
      setError('Capacity must be a whole number from 1 to 960 minutes.');
      return;
    }
    try {
      await save.mutateAsync({
        date: day.date,
        body: {
          fasting: fasting === 'auto' ? null : fasting === 'on',
          capacityOverride: capMode === 'default' ? null : capMode === 'rest' ? 0 : capNum,
          note: note.trim() ? note.trim() : null,
        },
      });
      toast({ title: `${day.dayName} updated`, body: 'The plan for that day was rebuilt.' });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open={day !== null}
      onClose={onClose}
      title={day ? `Adjust ${day.dayName}, ${formatShortDate(day.date)}` : ''}
      description="Changes rebuild that day's pending generated tasks. Completed and manual tasks are kept."
      labelledBy="override-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={save.isPending} data-testid="override-save">
            Save day
          </Button>
        </>
      }
    >
      {day && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="label mb-2">Fasting</div>
            <Segmented<FastingChoice>
              label="Fasting"
              value={fasting}
              onChange={setFasting}
              options={[
                { value: 'auto', label: 'Automatic' },
                { value: 'on', label: 'Fasting' },
                { value: 'off', label: 'Not fasting' },
              ]}
            />
            <p className="mt-2 text-xs text-muted">
              Automatic rules say: {day.fasting.overridden ? 'see below' : day.fasting.isFasting ? `fasting (${day.fasting.reasons.join(', ')})` : 'not a fasting day'}.
            </p>
          </div>
          <div>
            <div className="label mb-2">Capacity</div>
            <Segmented<CapacityChoice>
              label="Capacity"
              value={capMode}
              onChange={setCapMode}
              options={[
                { value: 'default', label: `Default (${day.capacity.base} min)` },
                { value: 'custom', label: 'Custom' },
                { value: 'rest', label: 'Rest day' },
              ]}
            />
            {capMode === 'custom' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  className="field num max-w-32"
                  min={1}
                  max={960}
                  value={capValue}
                  onChange={(e) => setCapValue(e.target.value)}
                  aria-label="Custom capacity in minutes"
                  aria-invalid={!capValid}
                />
                <span className="text-sm text-muted">minutes before any fasting reduction</span>
              </div>
            )}
            {capMode === 'rest' && <p className="mt-2 text-xs text-muted">A rest day has no goal. It neither breaks nor extends the streak.</p>}
          </div>
          <div>
            <label htmlFor="day-note" className="label mb-2 block">
              Note
            </label>
            <textarea id="day-note" className="field min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Travel, family visit, exam..." />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

function WhyPanel() {
  const settings = useSettings();
  const tracks = useTracks();
  const dash = useDashboard();
  const catalog = useCatalog();
  const meta = useTrackMeta();
  if (settings.isPending || tracks.isPending || dash.isPending) return <Skeleton className="h-72 rounded-2xl" />;
  if (settings.isError || tracks.isError || dash.isError) {
    return <ErrorState message="Could not load the plan explanation." onRetry={() => void Promise.all([settings.refetch(), tracks.refetch(), dash.refetch()])} />;
  }
  const s = settings.data;
  const expl = dash.data.baseline.explanation;
  const order = streamOrderMap(catalog.data);
  const weekly = [...tracks.data.normalWeekMinutes].sort(
    (a, b) => (order.get(`${a.track}.${a.stream}`) ?? order.get(a.track) ?? 999) - (order.get(`${b.track}.${b.stream}`) ?? order.get(b.track) ?? 999),
  );
  const nw = tracks.data.normalWeek;
  const rows = weekly.map((w) => (w.track === QURAN_TRACK_ID ? { ...w, plannedMinutes: nw.quranReserveMinutes } : w));
  const totalWeekly = nw.capacity;
  return (
    <Disclosure title="How this plan is calculated" subtitle="The numbers behind every day card." icon={Info} defaultOpen={false} data-testid="why-panel">
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="label mb-3">Capacity per weekday</h3>
          <ul className="flex flex-col gap-2">
            {s.capacityByDow.map((c, i) => {
              const per = expl.perDay.find((p) => p.dow === i);
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-9 text-muted">{DOW_SHORT[i]}</span>
                  <div className="flex-1">
                    <ProgressBar value={c} max={Math.max(...s.capacityByDow, 1)} height={6} color="var(--muted)" animateOnMount={false} />
                  </div>
                  <span className="w-16 text-end text-ink">
                    <span className="num">{c}</span> min
                  </span>
                  {per?.isFasting && <Moon size={13} weight="fill" className="text-warn" aria-label="Usually fasting" />}
                  {!per?.isFasting && <span className="w-[13px]" />}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Fasting days get <span className="num text-ink">{s.fastingReductionPct}%</span> less time. Mondays and Thursdays are fasting in a normal week, so they show{' '}
            <span className="num text-ink">{Math.round((s.capacityByDow[1] ?? 0) * (1 - s.fastingReductionPct / 100))}</span> min.
          </p>
        </div>
        <div>
          <h3 className="label mb-3">Normal week, minutes per track</h3>
          <ul className="flex flex-col gap-2.5">
            {rows.map((w) => {
              const m = meta(w.track, w.stream);
              return (
                <li key={`${w.track}-${w.stream}`} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span className={m.text}>{w.track === QURAN_TRACK_ID ? `${m.label} (reserved)` : m.label}</span>
                    <span className="text-ink">
                      <span className="num">{w.plannedMinutes}</span> min
                      <span className="ms-1 text-muted">{totalWeekly > 0 ? Math.round((w.plannedMinutes / totalWeekly) * 100) : 0}%</span>
                    </span>
                  </div>
                  <ProgressBar value={w.plannedMinutes} max={Math.max(...rows.map((x) => x.plannedMinutes), 1)} height={6} color={m.cssVar} animateOnMount={false} />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Total <Duration minutes={totalWeekly} className="text-ink" /> a week. Every day reserves <span className="num text-ink">{expl.quranReserveMinutes}</span> min for Quran
            (the memorize session); study tracks share the rest, so their time never depends on the day&apos;s Quran session. Reviews are capped at{' '}
            <span className="num text-ink">{expl.effectiveReviewCapMinutes}</span> min, and the unused part of the reservation (
            <span className="num text-ink">{nw.bufferMinutes}</span> min in a normal week) is an optional buffer, never planned or scored. A missed or skipped
            session moves to the next slot of its own track.
          </p>
        </div>
        <div>
          <h3 className="label mb-3">Daily goal (baseline)</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">{expl.normal}</div>
              <div className="text-[11px] text-muted">normal</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">{expl.fasting}</div>
              <div className="text-[11px] text-muted">fasting</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">0</div>
              <div className="text-[11px] text-muted">rest day</div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted" data-testid="baseline-text">
            {expl.text}
          </p>
        </div>
      </div>
    </Disclosure>
  );
}

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const catalog = useCatalog();
  const t = cairoToday(new Date(), catalog.data?.timezone);
  const thisWeek = weekStart(t);
  const paramWeek = params.get('week');
  const start = paramWeek && /^\d{4}-\d{2}-\d{2}$/.test(paramWeek) ? weekStart(paramWeek) : thisWeek;
  const week = useWeek(start);
  const regen = useRegenerate();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<DayView | null>(null);

  const go = (s: string) => setParams(s === thisWeek ? {} : { week: s });
  const isPastWeek = addDays(start, 6) < t;
  const regenFrom = start > t ? start : t;

  useEffect(() => {
    if (!week.data || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [week.data, location.hash]);

  const doRegen = async () => {
    try {
      const r = await regen.mutateAsync(regenFrom);
      toast({ title: 'Plan regenerated', body: `${r.created} tasks planned from ${formatShortDate(r.from)} to ${formatShortDate(r.to)}.` });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not regenerate', body: errorMessage(err) });
    }
    setConfirm(false);
  };

  const totals = week.data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plan"
        subtitle="Weeks start on Sunday. Adjust a day for travel, rest or fasting and the plan rebuilds around it."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <IconButton icon={CaretLeft} size="sm" label="Previous week" onClick={() => go(addDays(start, -7))} data-testid="week-prev" rtlFlipIcon />
              <span className="min-w-[150px] px-1 text-center text-sm font-medium text-ink">
                {formatShortDate(start)} to {formatShortDate(addDays(start, 6))}
              </span>
              <IconButton icon={CaretRight} size="sm" label="Next week" onClick={() => go(addDays(start, 7))} data-testid="week-next" rtlFlipIcon />
            </div>
            {start !== thisWeek && (
              <Button variant="ghost" size="md" onClick={() => go(thisWeek)}>
                This week
              </Button>
            )}
            {!isPastWeek && (
              <Button variant="secondary" icon={ArrowClockwise} onClick={() => setConfirm(true)} data-testid="regenerate">
                {start > t ? 'Regenerate this week' : 'Regenerate from today'}
              </Button>
            )}
          </>
        }
      />

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Planned time', value: <Duration minutes={totals.plannedMinutes} /> },
            { label: 'Capacity', value: <Duration minutes={totals.capacity} /> },
            { label: 'Planned points', value: <span className="num">{totals.plannedPoints}</span> },
            { label: 'Earned points', value: <span className="num">{totals.earnedPoints}</span>, accent: true },
          ].map((x) => (
            <div key={x.label} className="card px-4 py-3">
              <div className="text-xs text-muted">{x.label}</div>
              <div className={cn('mt-0.5 text-lg font-semibold', x.accent ? 'text-accent-ink' : 'text-ink')}>{x.value}</div>
            </div>
          ))}
        </div>
      )}

      {week.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : week.isError ? (
        <ErrorState message={errorMessage(week.error)} onRetry={() => void week.refetch()} />
      ) : (
        <div className={cn('grid gap-4 md:grid-cols-2 xl:grid-cols-3', week.isPlaceholderData && 'opacity-60')}>
          {week.data.days.map((d, i) => (
            <DayCard key={d.date} day={d} index={i} onEdit={setEditing} />
          ))}
        </div>
      )}

      <WhyPanel />

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void doRegen()}
        loading={regen.isPending}
        title={start > t ? 'Regenerate this week?' : 'Regenerate from today?'}
        confirmLabel="Regenerate"
        body={
          <>
            Pending generated tasks from <strong className="text-ink">{formatShortDate(regenFrom)}</strong> to{' '}
            <strong className="text-ink">{formatShortDate(addDays(start, 6))}</strong> are planned again from your real progress. Completed, skipped, moved forward and
            manual tasks are kept.
          </>
        }
      />
      <OverrideDialog day={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

