import { BookOpen, CalendarBlank, CheckCircle, Clock, Download, FileArrowUp, FloppyDisk, Moon, Palette, SlidersHorizontal } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toHijri } from '../../shared/calendar.js';
import { buildCatalog } from '../../shared/catalog.js';
import { today as cairoToday } from '../../shared/dates.js';
import { settingsSchema } from '../../shared/settings.js';
import { computeBaseline } from '../../shared/streak.js';
import { api, ApiError, errorMessage } from '../client/client';
import { useCatalog, useSaveSettings, useSettings } from '../client/hooks';
import type { CatalogResponse, Settings } from '../client/types';
import { Button } from '../components/ui/Button';
import { Card, Disclosure, ErrorState, PageHeader, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { useI18n, type Lang } from '../i18n';
import { hijriLabel } from '../i18n/engineText';
import { cn, formatLongDate, formatMediumDate } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Errors = Record<string, string>;

/** Error paths whose fields live inside the Advanced disclosure. */
const inAdvanced = (path: string) => path.startsWith('baseline.') || path.startsWith('timezone') || path === 'quran.minutesPerReviewPage' || path === 'quran.reviewCapMinutes';

function Section({ icon: I, title, description, children }: { icon: typeof Clock; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <I size={19} aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
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
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  error?: string | undefined;
  step?: number;
  hint?: string;
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
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          data-testid={`field-${id}`}
          type="number"
          step={step}
          inputMode="decimal"
          className={cn('field num pe-14', error && 'border-danger')}
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

function friendly(message: string): string {
  if (/expected number, received NaN|Invalid input: expected number/i.test(message)) return 'Enter a number.';
  if (/expected int|integer/i.test(message)) return 'Use a whole number.';
  const big = message.match(/<=\s*([\d.]+)/);
  if (big) return `Must be at most ${big[1]}.`;
  const small = message.match(/>=\s*([-\d.]+)/);
  if (small) return `Must be at least ${small[1]}.`;
  return message;
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
      toast({ tone: 'error', title: 'Could not download the plan', body: errorMessage(err) });
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Section icon={FileArrowUp} title="Your plan" description="The tracks, modules and settings this install runs on.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium text-ink">{catalog.planName ?? 'No plan imported yet'}</p>
          {catalog.importedAt && <p className="text-xs text-muted">Imported {formatMediumDate(catalog.importedAt.slice(0, 10))}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/import">
            <Button variant="secondary" size="sm" icon={FileArrowUp}>
              Import or update plan
            </Button>
          </Link>
          <Button variant="ghost" size="sm" icon={Download} onClick={() => void download()} loading={downloading}>
            Download current plan
          </Button>
        </div>
      </div>
    </Section>
  );
}

function SettingsForm({ initial, catalog }: { initial: Settings; catalog: CatalogResponse }) {
  const [draft, setDraft] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [savedText, setSavedText] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const save = useSaveSettings();
  const { toast } = useToast();
  const { pref, setPref } = useTheme();
  const { lang, setLang, t } = useI18n();
  const today = cairoToday(new Date(), catalog.timezone);
  const engineCatalog = useMemo(() => buildCatalog(catalog.data), [catalog.data]);

  useEffect(() => setDraft(initial), [initial]);

  const dirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(initial));
  const parsed = useMemo(() => settingsSchema.safeParse(draft), [draft]);
  const preview = parsed.success ? computeBaseline(parsed.data, engineCatalog) : null;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setQuran = <K extends keyof Settings['quran']>(k: K, v: Settings['quran'][K]) => setDraft((d) => ({ ...d, quran: { ...d.quran, [k]: v } }));
  const setBaseline = <K extends keyof Settings['baseline']>(k: K, v: number) => setDraft((d) => ({ ...d, baseline: { ...d.baseline, [k]: v } }));
  const setRule = (k: keyof Settings['fastingRules'], v: boolean) => setDraft((d) => ({ ...d, fastingRules: { ...d.fastingRules, [k]: v } }));

  const submit = async () => {
    setSavedText(null);
    if (!parsed.success) {
      const e: Errors = {};
      for (const i of parsed.error.issues) e[i.path.join('.')] = friendly(i.message);
      setErrors(e);
      if (Object.keys(e).some(inAdvanced)) setAdvancedOpen(true);
      toast({ tone: 'error', title: 'Check the highlighted fields' });
      return;
    }
    setErrors({});
    try {
      const res = await save.mutateAsync(editable(parsed.data));
      setSavedText(computeBaseline(res.settings, engineCatalog).text);
      toast({ title: 'Settings saved', body: res.regenerated ? 'The plan from today was refreshed.' : 'No plan changes were needed.' });
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const e: Errors = {};
        for (const d of err.details) e[d.path] = friendly(d.message);
        setErrors(e);
        if (Object.keys(e).some(inAdvanced)) setAdvancedOpen(true);
      }
      toast({ tone: 'error', title: 'Could not save settings', body: errorMessage(err) });
    }
  };

  const err = (path: string) => errors[path];

  return (
    <div className="flex flex-col gap-5">
      <PlanSection catalog={catalog} />

      <Section icon={Clock} title="Capacity per weekday" description="Net focused minutes per day, including the Quran session.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {draft.capacityByDow.map((c, i) => (
            <NumberField
              key={i}
              id={`cap-${i}`}
              label={DOW[i] as string}
              value={c}
              suffix="min"
              error={err(`capacityByDow.${i}`)}
              onChange={(n) => set('capacityByDow', draft.capacityByDow.map((x, j) => (j === i ? n : x)))}
            />
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={Moon} title="Fasting" description="Fasting days get less planned time and a lower daily goal.">
          <NumberField
            id="fasting-pct"
            label="Time reduction on fasting days"
            value={draft.fastingReductionPct}
            suffix="%"
            error={err('fastingReductionPct')}
            hint={`A 120 min day becomes ${Math.round(120 * (1 - (Number.isFinite(draft.fastingReductionPct) ? draft.fastingReductionPct : 0) / 100))} min.`}
            onChange={(n) => set('fastingReductionPct', n)}
          />
          <div className="mt-4 divide-y divide-line rounded-[10px] border border-line px-3">
            <Switch checked={draft.fastingRules.monday} onChange={(v) => setRule('monday', v)} label="Mondays" />
            <Switch checked={draft.fastingRules.thursday} onChange={(v) => setRule('thursday', v)} label="Thursdays" />
            <Switch checked={draft.fastingRules.whiteDays} onChange={(v) => setRule('whiteDays', v)} label="White Days" description="13th, 14th and 15th of each Hijri month" />
            <Switch checked={draft.fastingRules.ramadan} onChange={(v) => setRule('ramadan', v)} label="Ramadan" />
            <Switch checked={draft.fastingRules.dhulHijjahFirstNine} onChange={(v) => setRule('dhulHijjahFirstNine', v)} label="First 9 days of Dhu al-Hijjah" />
          </div>
          <p className="mt-3 text-xs text-muted">Eid days and the days of Tashreeq are never fasting days.</p>
        </Section>

        <Section icon={BookOpen} title="Quran" description="How long sessions take. Memorize minutes adapt to your real average after a few sessions.">
          <div className="rounded-[10px] border border-line px-3">
            <Switch
              checked={draft.quran.enabled}
              onChange={(v) => setQuran('enabled', v)}
              label="Quran sessions"
              description="When off, no Quran sessions are planned and all study time goes to your tracks. Your Quran history is kept."
              id="quran-enabled"
            />
          </div>
          <div className={cn(!draft.quran.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.quran.enabled}>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberField id="q-mem" label="Memorize session" value={draft.quran.memorizeMinutes} suffix="min" error={err('quran.memorizeMinutes')} onChange={(n) => setQuran('memorizeMinutes', n)} />
            </div>
            <div className="mt-4">
              <div className="mb-1.5 text-sm font-medium text-ink">Memorization order</div>
              <Segmented<Settings['quran']['memorizationOrder']>
                label="Memorization order"
                value={draft.quran.memorizationOrder}
                onChange={(v) => setQuran('memorizationOrder', v)}
                options={[
                  { value: 'juz30-29-then-forward', label: 'Juz 30, 29, then from the start' },
                  { value: 'forward', label: 'From the start' },
                ]}
              />
            </div>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={CalendarBlank} title="Hijri date" description="Shift the calculated Hijri date to match the local moon sighting.">
          <Segmented<number>
            label="Hijri offset in days"
            value={draft.hijriOffsetDays}
            onChange={(v) => set('hijriOffsetDays', v)}
            options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: <span className="num">{v > 0 ? `+${v}` : v}</span> }))}
          />
          <div className="mt-4 rounded-2xl bg-surface-2 p-4">
            <div className="text-xs text-muted">Today with this offset</div>
            <div className="mt-1 text-lg font-semibold text-ink" data-testid="hijri-preview">
              {hijriLabel(toHijri(today, draft.hijriOffsetDays), lang)}
            </div>
            <div className="text-sm text-muted">{formatLongDate(today)}</div>
          </div>
        </Section>
        <Section icon={Palette} title={t('settings.appearance')} description={t('settings.appearanceDesc')}>
          <div className="flex flex-col gap-4">
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
        </Section>
      </div>

      <Disclosure
        title="Advanced"
        subtitle="Fine-tuning for the daily goal, Quran review timing and the timezone. The defaults work for most people."
        icon={SlidersHorizontal}
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div>
            <h3 className="label">Daily goal</h3>
            <p className="mt-1.5 text-sm text-muted">The goal is a share of an average planned day. Fasting days use a smaller share.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField id="b-factor" label="Baseline factor" step={0.01} value={draft.baseline.factor} error={err('baseline.factor')} hint="0 to 2" onChange={(n) => setBaseline('factor', n)} />
              <NumberField
                id="b-fasting"
                label="Fasting factor"
                step={0.05}
                value={draft.baseline.fastingFactor}
                error={err('baseline.fastingFactor')}
                hint="0 to 1"
                onChange={(n) => setBaseline('fastingFactor', n)}
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">Normal day goal</div>
                <div className="num text-2xl font-semibold text-ink" data-testid="preview-normal">
                  {preview ? preview.normal : '-'}
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">Fasting day goal</div>
                <div className="num text-2xl font-semibold text-ink">{preview ? preview.fasting : '-'}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">Past days keep the goal they had. Changes only apply from today.</p>
          </div>

          <div className={cn(!draft.quran.enabled && 'pointer-events-none opacity-45')} aria-disabled={!draft.quran.enabled}>
            <h3 className="label">Quran review</h3>
            <p className="mt-1.5 text-sm text-muted">How long a review page takes and the most review minutes a day can plan.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <NumberField id="q-page" label="Review per page" value={draft.quran.minutesPerReviewPage} suffix="min" error={err('quran.minutesPerReviewPage')} onChange={(n) => setQuran('minutesPerReviewPage', n)} />
              <NumberField id="q-cap" label="Review cap" value={draft.quran.reviewCapMinutes} suffix="min" error={err('quran.reviewCapMinutes')} onChange={(n) => setQuran('reviewCapMinutes', n)} />
            </div>
          </div>

          <div>
            <label htmlFor="timezone" className="label block">
              Timezone
            </label>
            <p className="mt-1.5 text-sm text-muted">IANA name used for &apos;today&apos;, greetings and week boundaries.</p>
            <input
              id="timezone"
              data-testid="field-timezone"
              className={cn('field mt-4', err('timezone') && 'border-danger')}
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
              <p className="mt-1 text-xs text-muted">For example Africa/Cairo or Europe/Berlin.</p>
            )}
          </div>
        </div>
      </Disclosure>

      <AnimatePresence>
        {savedText && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card flex items-start gap-3 border-accent/30 p-5" data-testid="saved-explanation">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
            <div>
              <p className="font-semibold text-ink">Saved. Here is how your daily goal works now</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{savedText}</p>
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
            <span className="me-auto text-sm text-muted">Unsaved changes</span>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(initial);
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button variant="primary" icon={FloppyDisk} onClick={() => void submit()} loading={save.isPending} data-testid="settings-save">
              Save changes
            </Button>
          </motion.div>
        ) : (
          <motion.p key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 px-1 text-sm text-muted">
            <CheckCircle size={16} className="text-accent-ink" aria-hidden /> All changes saved
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsPage() {
  const q = useSettings();
  const catalog = useCatalog();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Saving refreshes the plan from today. Past days and their streak status never change." />
      {q.isPending || catalog.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
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
