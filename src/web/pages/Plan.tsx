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
import { BaselineList } from '../components/BaselineList';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog';
import { Chip, Disclosure, Duration, ErrorState, PageHeader, ProgressBar, Segmented, Skeleton } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { useI18n } from '../i18n';
import { dayName, dayNameShort, fastingReasons, hijriLabel, localizeTaskTitle, taskTitleParts, type BaselineContext } from '../i18n/engineText';
import { cn, formatMediumDate, formatMinutes, formatShortDate } from '../lib/format';
import { streamOrderMap, useTrackMeta } from '../lib/tracks';

/** Fixed Sunday-start week used to render weekday names (dow index -> date). */
const DOW_EPOCH = '2024-01-07';

function StatusIcon({ t }: { t: TaskView }) {
  const trackMeta = useTrackMeta();
  const { t: tr } = useI18n();
  if (t.status === 'completed')
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent" title={tr('task.statusCompleted')}>
        <Check size={11} weight="bold" aria-hidden />
      </span>
    );
  if (t.status === 'skipped') return <SkipForward size={16} className="shrink-0 text-muted rtl:-scale-x-100" aria-label={tr('task.skipped')} />;
  if (t.status === 'rolled') return <ArrowBendUpRight size={16} className="shrink-0 text-subtle rtl:-scale-x-100" aria-label={tr('task.moved')} />;
  if (t.status === 'missed') return <WarningCircle size={16} className="shrink-0 text-warn" aria-label={tr('task.missed')} />;
  const m = trackMeta(t.track, t.stream);
  return <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: m.cssVar }} aria-label={tr('task.statusPending')} />;
}

function NotStartedCard({ day, index }: { day: DayView; index: number }) {
  const { t, lang } = useI18n();
  return (
    <motion.div
      id={day.date}
      data-testid="day-card"
      data-before-start="true"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 380, damping: 32 }}
      className="card flex min-w-0 scroll-mt-20 flex-col border-dashed p-4 opacity-60 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight text-muted">{dayName(day.date, lang)}</h3>
        <Chip>{t('week.notStarted')}</Chip>
      </div>
      <p className="mt-0.5 text-sm text-muted">
        <bdi>{formatMediumDate(day.date)}</bdi>
        <span className="mx-1.5 text-subtle">/</span>
        <bdi>{hijriLabel(day.hijri, lang)}</bdi>
      </p>
      <p className="mt-3 text-sm text-muted">{t('plan.beforeStartBody')}</p>
    </motion.div>
  );
}

function DayCard({ day, onEdit, index }: { day: DayView; onEdit: (d: DayView) => void; index: number }) {
  const trackMeta = useTrackMeta();
  const { t, tRich, lang } = useI18n();
  const reasons = fastingReasons(day.fasting, day.hijri, lang).join(lang === 'ar' ? '، ' : ', ');
  const cap = day.capacity;
  const done = day.tasks.filter((t) => t.status === 'completed').length;
  const countable = day.tasks.filter((t) => t.status !== 'rolled').length;
  const movedLabel = t('task.moved');
  if (day.beforeStart) return <NotStartedCard day={day} index={index} />;
  return (
    <motion.div
      id={day.date}
      data-testid="day-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 380, damping: 32 }}
      className={cn('card flex min-w-0 scroll-mt-20 flex-col p-4 sm:p-5', day.isToday && 'border-accent/45 ring-1 ring-accent/25')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-ink">{dayName(day.date, lang)}</h3>
            {day.isToday && <Chip tone="accent">{t('nav.today')}</Chip>}
            {day.counts && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent text-on-accent" title={t('week.countedTitle')}>
                <Check size={11} weight="bold" aria-label={t('week.counted')} />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            <bdi>{formatMediumDate(day.date)}</bdi>
            <span className="mx-1.5 text-subtle">/</span>
            <bdi>{hijriLabel(day.hijri, lang)}</bdi>
          </p>
        </div>
        {day.isPast ? (
          <span className="inline-flex size-8 items-center justify-center text-subtle" title={t('plan.pastLocked')}>
            <Lock size={16} aria-label={t('plan.pastLockedAria')} />
          </span>
        ) : (
          <IconButton icon={PencilSimple} size="sm" label={t('plan.editDay', { day: dayName(day.date, lang) })} onClick={() => onEdit(day)} data-testid="day-edit" />
        )}
      </div>

      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        {day.fasting.isFasting && (
          <Chip tone="warn" icon={Moon} title={reasons}>
            {t('plan.fastOn')}
          </Chip>
        )}
        {day.fasting.isFasting && <span className="text-xs text-muted">{reasons}</span>}
        {!day.fasting.isFasting && day.fasting.blockedBy && <Chip tone="accent">{fastingReasons(day.fasting, day.hijri, lang)[0] ?? day.fasting.blockedBy}</Chip>}
        {cap.isRestDay && (
          <Chip icon={Coffee}>{t('today.restDay')}</Chip>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            {tRich('plan.plannedLine', {
              planned: <Duration minutes={day.plannedMinutes} className="text-ink" />,
              total: <Duration minutes={cap.total} />,
            })}
          </span>
          {cap.override !== null && !cap.isRestDay && <span>{t('plan.customCap')}</span>}
        </div>
        <ProgressBar value={day.plannedMinutes} max={Math.max(cap.total, 1)} height={6} color="var(--muted)" label={t('plan.plannedAria')} />
        {day.bufferMinutes > 0 && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted" data-testid="day-buffer">
            <Hourglass size={13} aria-hidden />
            {tRich('buffer.line', { min: <span className="num text-ink">{day.bufferMinutes}</span> })}
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
        {day.tasks.length === 0 && <li className="py-3 text-sm text-muted">{cap.isRestDay ? t('plan.restEmpty') : t('plan.noTasks')}</li>}
        {day.tasks.map((t) => {
          const m = trackMeta(t.track, t.stream);
          const generated = t.source === 'generated';
          const title = generated ? localizeTaskTitle(t.title, lang) : t.title;
          const parts = generated ? taskTitleParts(t.title, lang) : { prefix: '', subject: t.title, suffix: '' };
          return (
            <li key={t.id} className="flex items-center gap-2.5 py-2.5">
              <StatusIcon t={t} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'flex min-w-0 gap-x-1 text-sm font-medium text-ink',
                    (t.status === 'completed' || t.status === 'skipped') && 'text-muted line-through decoration-1',
                    t.status === 'rolled' && 'text-subtle',
                  )}
                  title={title}
                >
                  {parts.prefix !== '' && <span className="shrink-0 whitespace-nowrap">{parts.prefix}</span>}
                  <span className="min-w-0 truncate" dir="auto">
                    {parts.subject}
                  </span>
                  {parts.suffix !== '' && <span className="shrink-0 whitespace-nowrap">{parts.suffix.trimStart()}</span>}
                </p>
                <p className="text-xs">
                  <span className={m.text} dir="auto">
                    {m.short}
                  </span>
                  <span className="text-muted">
                    {' '}
                    <Duration minutes={t.actualMinutes ?? t.plannedMinutes} />
                  </span>
                  {t.status === 'rolled' && <span className="text-subtle"> / {movedLabel}</span>}
                </p>
              </div>
              {t.status !== 'rolled' && (
                <span className={cn('num shrink-0 text-xs font-semibold', t.status === 'completed' ? 'text-accent-ink' : 'text-muted')}>
                  {t.status === 'completed' ? <bdi dir="ltr">+{t.earnedPoints ?? 0}</bdi> : t.plannedPoints}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-muted">
        <span>
          {tRich('plan.doneCount', { done: <bdi className="num">{done}</bdi>, countable: <bdi className="num">{countable}</bdi> })}
        </span>
        <span className="inline-flex items-center gap-1">
          <Lightning size={13} weight="fill" className="text-accent-ink" aria-hidden />
          {tRich('plan.pointsLine', {
            earned: <bdi className="num text-ink">{day.earnedPoints}</bdi>,
            planned: <bdi className="num">{day.plannedPoints}</bdi>,
          })}
          {!cap.isRestDay && <span className="ms-1">{tRich('plan.goalInline', { goal: <bdi className="num">{day.baseline}</bdi> })}</span>}
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
  const { t, lang } = useI18n();
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
      setError(t('plan.errCap'));
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
      toast({ title: t('plan.dayUpdated', { day: dayName(day.date, lang) }), body: t('plan.dayUpdatedBody') });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const autoRule = day
    ? day.fasting.overridden
      ? t('plan.autoSeeBelow')
      : day.fasting.isFasting
        ? t('plan.autoFasting', { reasons: fastingReasons(day.fasting, day.hijri, lang).join(lang === 'ar' ? '، ' : ', ') })
        : t('plan.autoNotFasting')
    : '';

  return (
    <Dialog
      open={day !== null}
      onClose={onClose}
      title={day ? t('plan.adjustTitle', { day: dayName(day.date, lang), date: formatShortDate(day.date) }) : ''}
      description={t('plan.adjustDesc')}
      labelledBy="override-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void submit()} loading={save.isPending} data-testid="override-save">
            {t('plan.saveDay')}
          </Button>
        </>
      }
    >
      {day && (
        <div className="flex flex-col gap-5">
          <div>
            <div className="label mb-2">{t('plan.fasting')}</div>
            <Segmented<FastingChoice>
              label={t('plan.fasting')}
              value={fasting}
              onChange={setFasting}
              options={[
                { value: 'auto', label: t('plan.fastAuto') },
                { value: 'on', label: t('plan.fastOn') },
                { value: 'off', label: t('plan.fastOff') },
              ]}
            />
            <p className="mt-2 text-xs text-muted">{t('plan.autoRules', { what: autoRule })}</p>
          </div>
          <div>
            <div className="label mb-2">{t('plan.capacity')}</div>
            <Segmented<CapacityChoice>
              label={t('plan.capacity')}
              value={capMode}
              onChange={setCapMode}
              options={[
                { value: 'default', label: t('plan.capDefault', { min: formatMinutes(day.capacity.base) }) },
                { value: 'custom', label: t('plan.capCustom') },
                { value: 'rest', label: t('today.restDay') },
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
                  aria-label={t('plan.capCustomAria')}
                  aria-invalid={!capValid}
                />
                <span className="text-sm text-muted">{t('plan.capCustomHint')}</span>
              </div>
            )}
            {capMode === 'rest' && <p className="mt-2 text-xs text-muted">{t('plan.restExpl')}</p>}
          </div>
          <div>
            <label htmlFor="day-note" className="label mb-2 block">
              {t('plan.note')}
            </label>
            <textarea id="day-note" className="field min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('plan.notePh')} />
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
  const { t, tRich, lang } = useI18n();
  if (settings.isPending || tracks.isPending || dash.isPending) return <Skeleton className="h-72 rounded-2xl" />;
  if (settings.isError || tracks.isError || dash.isError) {
    return <ErrorState message={t('plan.whyError')} onRetry={() => void Promise.all([settings.refetch(), tracks.refetch(), dash.refetch()])} />;
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
  // The habits clause of the baseline text needs the template and catalog.
  const warmupSlot = s.weeklyTemplate.flat().find((slot) => slot.role === 'warmup');
  const warmup = warmupSlot
    ? (catalog.data?.data.tracks.find((t) => t.id === warmupSlot.track)?.streams.find((st) => st.id === warmupSlot.stream)?.warmupTitle ?? null)
    : false;
  const baselineCtx: BaselineContext = { quranEnabled: catalog.data?.quranEnabled ?? true, warmup };
  return (
    <Disclosure title={t('plan.whyTitle')} subtitle={t('plan.whySub')} icon={Info} defaultOpen={false} data-testid="why-panel">
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <h3 className="label mb-3">{t('plan.capPerWeekday')}</h3>
          <ul className="flex flex-col gap-2">
            {s.capacityByDow.map((c, i) => {
              const per = expl.perDay.find((p) => p.dow === i);
              return (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-9 text-muted">{dayNameShort(addDays(DOW_EPOCH, i), lang)}</span>
                  <div className="flex-1">
                    <ProgressBar value={c} max={Math.max(...s.capacityByDow, 1)} height={6} color="var(--muted)" animateOnMount={false} />
                  </div>
                  <span className="w-16 text-end text-ink">
                    <Duration minutes={c} />
                  </span>
                  {per?.isFasting && <Moon size={13} weight="fill" className="text-warn" aria-label={t('plan.usuallyFasting')} />}
                  {!per?.isFasting && <span className="w-[13px]" />}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {tRich('plan.fastingLess', { pct: <bdi dir="ltr" className="num text-ink">{s.fastingReductionPct}%</bdi> })}{' '}
            {tRich('plan.monThuNote', { min: <Duration minutes={Math.round((s.capacityByDow[1] ?? 0) * (1 - s.fastingReductionPct / 100))} className="text-ink" /> })}
          </p>
        </div>
        <div>
          <h3 className="label mb-3">{t('plan.weekPerTrack')}</h3>
          <ul className="flex flex-col gap-2.5">
            {rows.map((w) => {
              const m = meta(w.track, w.stream);
              return (
                <li key={`${w.track}-${w.stream}`} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span className={m.text}>{w.track === QURAN_TRACK_ID ? tRich('plan.reserved', { label: <bdi>{m.label}</bdi> }) : <bdi dir="auto">{m.label}</bdi>}</span>
                    <span className="inline-flex items-baseline gap-1.5 text-ink">
                      <Duration minutes={w.plannedMinutes} />
                      <bdi dir="ltr" className="text-muted">
                        {totalWeekly > 0 ? Math.round((w.plannedMinutes / totalWeekly) * 100) : 0}%
                      </bdi>
                    </span>
                  </div>
                  <ProgressBar value={w.plannedMinutes} max={Math.max(...rows.map((x) => x.plannedMinutes), 1)} height={6} color={m.cssVar} animateOnMount={false} />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted">
            {tRich('plan.weekExpl', {
              total: <Duration minutes={totalWeekly} className="text-ink" />,
              reserve: <Duration minutes={expl.quranReserveMinutes} className="text-ink" />,
              cap: <Duration minutes={expl.effectiveReviewCapMinutes} className="text-ink" />,
              buffer: <Duration minutes={nw.bufferMinutes} className="text-ink" />,
            })}
          </p>
        </div>
        <div>
          <h3 className="label mb-3">{t('plan.dailyGoal')}</h3>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">{expl.normal}</div>
              <div className="text-[11px] text-muted">{t('plan.goalNormal')}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">{expl.fasting}</div>
              <div className="text-[11px] text-muted">{t('plan.goalFasting')}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3 text-center">
              <div className="num text-xl font-semibold text-ink">0</div>
              <div className="text-[11px] text-muted">{t('plan.goalRest')}</div>
            </div>
          </div>
          <BaselineList className="mt-3" expl={expl} ctx={baselineCtx} />
        </div>
      </div>
    </Disclosure>
  );
}

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const catalog = useCatalog();
  const { t, tRich, tn } = useI18n();
  const today = cairoToday(new Date(), catalog.data?.timezone);
  const thisWeek = weekStart(today);
  const paramWeek = params.get('week');
  const start = paramWeek && /^\d{4}-\d{2}-\d{2}$/.test(paramWeek) ? weekStart(paramWeek) : thisWeek;
  const week = useWeek(start);
  const regen = useRegenerate();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<DayView | null>(null);

  const go = (s: string) => setParams(s === thisWeek ? {} : { week: s });
  const isPastWeek = addDays(start, 6) < today;
  const regenFrom = start > today ? start : today;

  useEffect(() => {
    if (!week.data || !location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [week.data, location.hash]);

  const doRegen = async () => {
    try {
      const r = await regen.mutateAsync(regenFrom);
      toast({ title: t('plan.regenDone'), body: tn('plan.regenDoneBody', r.created, { from: formatShortDate(r.from), to: formatShortDate(r.to) }) });
    } catch (err) {
      toast({ tone: 'error', title: t('plan.regenError'), body: errorMessage(err) });
    }
    setConfirm(false);
  };

  const totals = week.data?.totals;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.plan')}
        subtitle={t('plan.subtitle')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
              <IconButton icon={CaretLeft} size="sm" label={t('plan.prevWeek')} onClick={() => go(addDays(start, -7))} data-testid="week-prev" rtlFlipIcon />
              <span className="min-w-[150px] px-1 text-center text-sm font-medium text-ink">
                {tRich('plan.weekRange', { from: <bdi>{formatShortDate(start)}</bdi>, to: <bdi>{formatShortDate(addDays(start, 6))}</bdi> })}
              </span>
              <IconButton icon={CaretRight} size="sm" label={t('plan.nextWeek')} onClick={() => go(addDays(start, 7))} data-testid="week-next" rtlFlipIcon />
            </div>
            {start !== thisWeek && (
              <Button variant="ghost" size="md" onClick={() => go(thisWeek)}>
                {t('week.title')}
              </Button>
            )}
            {!isPastWeek && (
              <Button variant="secondary" icon={ArrowClockwise} onClick={() => setConfirm(true)} data-testid="regenerate">
                {start > today ? t('plan.regenWeek') : t('plan.regenToday')}
              </Button>
            )}
          </>
        }
      />

      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t('plan.tilePlannedTime'), value: <Duration minutes={totals.plannedMinutes} /> },
            { label: t('plan.capacity'), value: <Duration minutes={totals.capacity} /> },
            { label: t('plan.tilePlannedPoints'), value: <span className="num">{totals.plannedPoints}</span> },
            { label: t('plan.tileEarnedPoints'), value: <span className="num">{totals.earnedPoints}</span>, accent: true },
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
        <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3', week.isPlaceholderData && 'opacity-60')}>
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
        title={start > today ? t('plan.regenConfirmWeek') : t('plan.regenConfirmToday')}
        confirmLabel={t('plan.regen')}
        body={tRich('plan.regenBody', {
          from: <strong className="text-ink"><bdi>{formatShortDate(regenFrom)}</bdi></strong>,
          to: <strong className="text-ink"><bdi>{formatShortDate(addDays(start, 6))}</bdi></strong>,
        })}
      />
      <OverrideDialog day={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

