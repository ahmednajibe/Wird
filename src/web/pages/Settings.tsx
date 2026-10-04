import { BookOpen, CalendarBlank, CheckCircle, Clock, Download, FileArrowUp, FloppyDisk, Moon, Palette, SlidersHorizontal } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toHijri } from '../../shared/calendar.js';
import { buildCatalog } from '../../shared/catalog.js';
import { addDays, today as cairoToday } from '../../shared/dates.js';
import { settingsSchema } from '../../shared/settings.js';
import { computeBaseline, type BaselineExplanation } from '../../shared/streak.js';
import { api, ApiError, errorMessage } from '../client/client';
import { useCatalog, useSaveSettings, useSettings } from '../client/hooks';
import type { CatalogResponse, Settings } from '../client/types';
import { BaselineList } from '../components/BaselineList';
import { Button } from '../components/ui/Button';
import { Card, Disclosure, ErrorState, InfoHint, PageHeader, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { useI18n, type Lang, type StringKey } from '../i18n';
import { dayName, hijriLabel } from '../i18n/engineText';
import { cn, formatLongDate, formatMediumDate, formatMinutes } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';

/** Fixed Sunday-start week used to render weekday names (dow index -> date). */
const DOW_EPOCH = '2024-01-07';
/** IANA ids shown as examples under the timezone field (kept as code so the bdi parts own the direction). */
const TZ_EXAMPLES = ['Africa/Cairo', 'Europe/Berlin'] as const;
type Errors = Record<string, string>;

/** Error paths whose fields live inside the Advanced disclosure. */
const inAdvanced = (path: string) => path.startsWith('baseline.') || path === 'quran.minutesPerReviewPage' || path === 'quran.reviewCapMinutes';

function Section({ icon: I, title, description, aside, children }: { icon: typeof Clock; title: string; description?: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className={cn(aside ? 'flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8' : 'mb-5')}>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <I size={19} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
  error,
  step = 1,
  hint,
  info,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  error?: string | undefined;
  step?: number;
  hint?: ReactNode;
  info?: ReactNode;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((cur) => {
      const n = cur.trim() === '' ? Number.NaN : Number(cur);
      if (Number.isNaN(value) || n === value) return cur;
      return String(value);
    });
  }, [value]);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1">
        <label htmlFor={id} className="whitespace-nowrap text-sm font-medium text-ink" title={label}>
          {label}
        </label>
        {info}
      </div>
      <div className="relative">
        <input
          id={id}
          data-testid={`field-${id}`}
          type="number"
          step={step}
          inputMode="decimal"
          className={cn('field num', suffix && 'pe-14', error && 'border-danger')}
          value={text}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === '' ? Number.NaN : Number(e.target.value);
            onChange(n);
          }}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted">{suffix}</span>}
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

function friendly(message: string, t: Translate): string {
  if (/expected number, received NaN|Invalid input: expected number/i.test(message)) return t('settings.errNumber');
  if (/expected int|integer/i.test(message)) return t('settings.errInt');
  const big = message.match(/<=\s*([\d.]+)/);
  if (big) return t('settings.errMax', { max: big[1] ?? '' });
  const small = message.match(/>=\s*([-\d.]+)/);
  if (small) return t('settings.errMin', { min: small[1] ?? '' });
  return message;
}

/** Warm-up context for the baseline paragraph, same shape Plan.tsx passes. */
function warmupCtx(s: Settings, catalog: CatalogResponse): string | null | false {
  const slot = s.weeklyTemplate.flat().find((x) => x.role === 'warmup');
  if (!slot) return false;
  return catalog.data.tracks.find((t) => t.id === slot.track)?.streams.find((st) => st.id === slot.stream)?.warmupTitle ?? null;
}

function editable(s: Settings) {
  return {
    capacityByDow: s.capacityByDow,
    fastingReductionPct: s.fastingReductionPct,
    fastingRules: s.fastingRules,
    hijriOffsetDays: s.hijriOffsetDays,
    quran: s.quran,
    baseline: s.baseline,
    timezone: s.timezone,
  };
}

function PlanSection({ catalog }: { catalog: CatalogResponse }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const pack = await api.planPack();
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plan.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ tone: 'error', title: t('settings.errDownload'), body: errorMessage(err) });
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Section icon={FileArrowUp} title={t('settings.plan')} description={t('settings.planDesc')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-ink" dir="auto">
            {catalog.planName ?? t('settings.noPlan')}
          </p>
          {catalog.importedAt && <p className="text-xs text-muted">{t('settings.imported', { date: formatMediumDate(catalog.importedAt.slice(0, 10)) })}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import">
            <Button variant="secondary" size="sm" icon={FileArrowUp}>
              {t('settings.importUpdate')}
            </Button>
          </Link>
          <Button variant="ghost" size="sm" icon={Download} onClick={() => void download()} loading={downloading}>
            {t('settings.download')}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SettingsForm({ initial, catalog }: { initial: Settings; catalog: CatalogResponse }) {
  const [draft, setDraft] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [savedExpl, setSavedExpl] = useState<{ expl: BaselineExplanation; quranEnabled: boolean; warmup: string | null | false } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const save = useSaveSettings();
  const { toast } = useToast();
  const { pref, setPref } = useTheme();
  const { lang, setLang, t, tRich } = useI18n();
  const today = cairoToday(new Date(), catalog.timezone);
  const engineCatalog = useMemo(() => buildCatalog(catalog.data), [catalog.data]);
  // The preview follows the draft zone when it is a valid IANA name; a
  // half-typed or invalid id must never throw during render.
  const previewToday = useMemo(() => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone });
      return cairoToday(new Date(), draft.timezone);
    } catch {
      return today;
    }
  }, [draft.timezone, today]);

  useEffect(() => setDraft(initial), [initial]);

  const dirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(initial));
  const parsed = useMemo(() => settingsSchema.safeParse(draft), [draft]);
  const preview = parsed.success ? computeBaseline(parsed.data, engineCatalog) : null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setQuran = <K extends keyof Settings['quran']>(k: K, v: Settings['quran'][K]) => setDraft((d) => ({ ...d, quran: { ...d.quran, [k]: v } }));
  const setBaseline = <K extends keyof Settings['baseline']>(k: K, v: number) => setDraft((d) => ({ ...d, baseline: { ...d.baseline, [k]: v } }));
  const setRule = (k: keyof Settings['fastingRules'], v: boolean) => setDraft((d) => ({ ...d, fastingRules: { ...d.fastingRules, [k]: v } }));

  const submit = async () => {
    setSavedExpl(null);
    if (!parsed.success) {
      const e: Errors = {};
      for (const i of parsed.error.issues) e[i.path.join('.')] = friendly(i.message, t);
      setErrors(e);
      if (Object.keys(e).some(inAdvanced)) setAdvancedOpen(true);
      toast({ tone: 'error', title: t('settings.errCheck') });
      return;
    }
    setErrors({});
    try {
      const res = await save.mutateAsync(editable(parsed.data));
      setSavedExpl({ expl: computeBaseline(res.settings, engineCatalog), quranEnabled: res.settings.quran.enabled, warmup: warmupCtx(res.settings, catalog) });
      toast({ title: t('settings.saved'), body: res.regenerated ? t('settings.savedRegen') : t('settings.savedNoChange') });
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const e: Errors = {};
        for (const d of err.details) e[d.path] = friendly(d.message, t);
        setErrors(e);
        if (Object.keys(e).some(inAdvanced)) setAdvancedOpen(true);
      }
      toast({ tone: 'error', title: t('settings.errSave'), body: errorMessage(err) });
    }
  };

  const err = (path: string) => errors[path];

  return (
    <div className="flex flex-col gap-5">
      <PlanSection catalog={catalog} />

      <Section icon={Clock} title={t('settings.capacity')} description={t('settings.capacityDesc')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {draft.capacityByDow.map((c, i) => (
            <NumberField
              key={i}
              id={`cap-${i}`}
              label={dayName(addDays(DOW_EPOCH, i), lang)}
              value={c}
              suffix={t('unit.min')}
              error={err(`capacityByDow.${i}`)}
              onChange={(n) => set('capacityByDow', draft.capacityByDow.map((x, j) => (j === i ? n : x)))}
            />
          ))}
        </div>
      </Section>

      <Section icon={Moon} title={t('settings.fasting')} description={t('settings.fastingDesc')}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                id="fasting-pct"
                label={t('settings.fastingReduction')}
                value={draft.fastingReductionPct}
                suffix={t('unit.pct')}
                error={err('fastingReductionPct')}
                hint={tRich('settings.fastingHint', {
                  base: <span className="whitespace-nowrap">{formatMinutes(120)}</span>,
                  result: <span className="whitespace-nowrap">{formatMinutes(Math.round(120 * (1 - (Number.isFinite(draft.fastingReductionPct) ? draft.fastingReductionPct : 0) / 100)))}</span>,
                })}
                onChange={(n) => set('fastingReductionPct', n)}
              />
            </div>
            <p className="order-last text-xs text-muted">{t('settings.eidNote')}</p>
          </div>
          <div className="divide-y divide-line rounded-[10px] border border-line px-3">
            <Switch checked={draft.fastingRules.monday} onChange={(v) => setRule('monday', v)} label={t('settings.mon')} />
            <Switch checked={draft.fastingRules.thursday} onChange={(v) => setRule('thursday', v)} label={t('settings.thu')} />
            <Switch checked={draft.fastingRules.whiteDays} onChange={(v) => setRule('whiteDays', v)} label={t('settings.whiteDays')} description={t('settings.whiteDaysDesc')} />
            <Switch checked={draft.fastingRules.ramadan} onChange={(v) => setRule('ramadan', v)} label={t('settings.ramadan')} />
            <Switch checked={draft.fastingRules.dhulHijjahFirstNine} onChange={(v) => setRule('dhulHijjahFirstNine', v)} label={t('settings.dhulHijjah')} />
          </div>
        </div>
      </Section>

      <Section icon={BookOpen} title={t('nav.quran')} description={t('settings.quranDesc')}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col gap-4">
            <div className="rounded-[10px] border border-line px-3">
              <Switch
                checked={draft.quran.enabled}
                onChange={(v) => setQuran('enabled', v)}
                label={
                  <span className="inline-flex items-center gap-1">
                    {t('settings.quranSessions')}
                    <InfoHint label={t('settings.quranSessions')}>{t('settings.quranSessionsHint')}</InfoHint>
                  </span>
                }
                description={t('settings.quranSessionsDesc')}
                id="quran-enabled"
              />
            </div>
            <div className={cn(!draft.quran.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.quran.enabled}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  id="q-mem"
                  label={t('settings.memorizeSession')}
                  value={draft.quran.memorizeMinutes}
                  suffix={t('unit.min')}
                  error={err('quran.memorizeMinutes')}
                  info={<InfoHint label={t('settings.memorizeSession')}>{t('settings.memorizeHint')}</InfoHint>}
                  onChange={(n) => setQuran('memorizeMinutes', n)}
                />
              </div>
            </div>
          </div>
          <div className={cn(!draft.quran.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.quran.enabled}>
            <div className="mb-1.5 text-sm font-medium text-ink">{t('quran.order')}</div>
            <Segmented<Settings['quran']['memorizationOrder']>
              label={t('quran.order')}
              value={draft.quran.memorizationOrder}
              onChange={(v) => setQuran('memorizationOrder', v)}
              options={[
                { value: 'juz30-29-then-forward', label: t('settings.orderJuz') },
                { value: 'forward', label: t('settings.orderFwd') },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section icon={CalendarBlank} title={t('settings.hijri')} description={t('settings.hijriDesc')}>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <div>
            <label htmlFor="timezone" className="mb-1.5 block text-sm font-medium text-ink">
              {t('settings.timezone')}
            </label>
            <p className="text-sm text-muted">{t('settings.timezoneDesc')}</p>
            <input
              id="timezone"
              data-testid="field-timezone"
              dir="ltr"
              className={cn('field mt-2 max-w-xs', err('timezone') && 'border-danger')}
              value={draft.timezone}
              placeholder="Africa/Cairo"
              aria-invalid={Boolean(err('timezone'))}
              aria-describedby={err('timezone') ? 'timezone-err' : undefined}
              onChange={(e) => set('timezone', e.target.value)}
            />
            {err('timezone') ? (
              <p id="timezone-err" className="mt-1 text-xs text-danger">
                {err('timezone')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">
                {tRich('settings.tzHint', {
                  tz1: (
                    <bdi dir="ltr" className="whitespace-nowrap">
                      {TZ_EXAMPLES[0]}
                    </bdi>
                  ),
                  tz2: (
                    <bdi dir="ltr" className="whitespace-nowrap">
                      {TZ_EXAMPLES[1]}
                    </bdi>
                  ),
                })}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-1.5 text-sm font-medium text-ink">{t('settings.hijriOffset')}</div>
              <Segmented<number>
                label={t('settings.hijriOffset')}
                value={draft.hijriOffsetDays}
                onChange={(v) => set('hijriOffsetDays', v)}
                options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: <bdi dir="ltr" className="num">{v > 0 ? `+${v}` : v}</bdi> }))}
              />
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <div className="text-xs text-muted">{t('settings.hijriToday')}</div>
              <div className="mt-1 text-lg font-semibold text-ink" data-testid="hijri-preview">
                {hijriLabel(toHijri(previewToday, draft.hijriOffsetDays), lang)}
              </div>
              <div className="text-sm text-muted" data-testid="calendar-preview-date">
                {formatLongDate(previewToday)}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        icon={Palette}
        title={t('settings.appearance')}
        description={t('settings.appearanceDesc')}
        aside={
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
            <div>
              <div className="label mb-2">{t('settings.theme')}</div>
              <Segmented<ThemePref>
                label={t('settings.theme')}
                value={pref}
                onChange={setPref}
                options={[
                  { value: 'system', label: t('theme.system') },
                  { value: 'dark', label: t('theme.dark') },
                  { value: 'light', label: t('theme.light') },
                ]}
              />
            </div>
            <div>
              <div className="label mb-2">{t('settings.language')}</div>
              <Segmented<Lang>
                label={t('settings.language')}
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'en', label: 'English', testId: 'lang-en' },
                  { value: 'ar', label: 'العربية', testId: 'lang-ar' },
                ]}
              />
            </div>
          </div>
        }
      />

      <Disclosure
        title={t('settings.advanced')}
        subtitle={t('settings.advancedDesc')}
        icon={SlidersHorizontal}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        data-testid="settings-advanced"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="label">{t('settings.dailyGoal')}</h3>
            <p className="mt-1.5 text-sm text-muted">{t('settings.dailyGoalDesc')}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField id="b-factor" label={t('settings.baselineFactor')} step={0.01} value={draft.baseline.factor} error={err('baseline.factor')} hint={t('settings.range02')} onChange={(n) => setBaseline('factor', n)} />
              <NumberField
                id="b-fasting"
                label={t('settings.fastingFactor')}
                step={0.05}
                value={draft.baseline.fastingFactor}
                error={err('baseline.fastingFactor')}
                hint={t('settings.range01')}
                info={<InfoHint label={t('settings.fastingFactor')}>{t('settings.fastingFactorHint')}</InfoHint>}
                onChange={(n) => setBaseline('fastingFactor', n)}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="truncate text-xs text-muted" title={t('settings.normalGoal')}>
                  {t('settings.normalGoal')}
                </div>
                <div className="num text-2xl font-semibold text-ink" data-testid="preview-normal">
                  {preview ? preview.normal : '-'}
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="truncate text-xs text-muted" title={t('settings.fastingGoal')}>
                  {t('settings.fastingGoal')}
                </div>
                <div className="num text-2xl font-semibold text-ink">{preview ? preview.fasting : '-'}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{t('settings.pastKeep')}</p>
          </div>

          <div className={cn(!draft.quran.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.quran.enabled}>
            <h3 className="label">{t('settings.quranReview')}</h3>
            <p className="mt-1.5 text-sm text-muted">{t('settings.quranReviewDesc')}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <NumberField id="q-page" label={t('settings.reviewPerPage')} value={draft.quran.minutesPerReviewPage} suffix={t('unit.min')} error={err('quran.minutesPerReviewPage')} onChange={(n) => setQuran('minutesPerReviewPage', n)} />
              <NumberField id="q-cap" label={t('settings.reviewCap')} value={draft.quran.reviewCapMinutes} suffix={t('unit.min')} error={err('quran.reviewCapMinutes')} onChange={(n) => setQuran('reviewCapMinutes', n)} />
            </div>
          </div>
        </div>
      </Disclosure>

      <AnimatePresence>
        {savedExpl && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card flex items-start gap-3 border-accent/30 p-5" data-testid="saved-explanation">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            <div>
              <p className="font-semibold text-ink">{t('settings.savedTitle')}</p>
              <BaselineList className="mt-1" expl={savedExpl.expl} ctx={{ quranEnabled: savedExpl.quranEnabled, warmup: savedExpl.warmup }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {dirty || save.isPending ? (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 flex items-center justify-end gap-2 rounded-full border border-line-strong bg-surface/95 p-2 ps-5 shadow-pop backdrop-blur-md md:bottom-4"
          >
            <span className="me-auto text-sm text-muted">{t('settings.unsaved')}</span>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(initial);
                setErrors({});
              }}
            >
              {t('settings.discard')}
            </Button>
            <Button variant="primary" icon={FloppyDisk} onClick={() => void submit()} loading={save.isPending} data-testid="settings-save">
              {t('settings.save')}
            </Button>
          </motion.div>
        ) : (
          <motion.p key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 px-1 text-sm text-muted">
            <CheckCircle size={16} className="text-accent-ink" aria-hidden /> {t('settings.allSaved')}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsPage() {
  const q = useSettings();
  const catalog = useCatalog();
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      {q.isPending || catalog.isPending ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : catalog.isError ? (
        <ErrorState message={errorMessage(catalog.error)} onRetry={() => void catalog.refetch()} />
      ) : (
        <SettingsForm initial={q.data} catalog={catalog.data} />
      )}
    </div>
  );
}
