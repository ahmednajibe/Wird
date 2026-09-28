import { BookOpen, CalendarBlank, CheckCircle, Clock, FloppyDisk, Moon, Palette, Target } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toHijri } from '../../shared/calendar.js';
import { today as cairoToday } from '../../shared/dates.js';
import { settingsSchema } from '../../shared/settings.js';
import { computeBaseline } from '../../shared/streak.js';
import { ApiError, errorMessage } from '../client/client';
import { CATALOG } from '../lib/catalog';
import { useSaveSettings, useSettings } from '../client/hooks';
import type { Settings } from '../client/types';
import { Button } from '../components/ui/Button';
import { Card, ErrorState, PageHeader, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { cn, formatLongDate } from '../lib/format';
import { useTheme, type ThemePref } from '../lib/theme';

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Errors = Record<string, string>;

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
          className={cn('field num pr-14', error && 'border-danger')}
          value={text}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === '' ? Number.NaN : Number(e.target.value);
            onChange(n);
          }}
        />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{suffix}</span>}
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
  };
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [draft, setDraft] = useState<Settings>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [savedText, setSavedText] = useState<string | null>(null);
  const save = useSaveSettings();
  const { toast } = useToast();
  const { pref, setPref } = useTheme();
  const t = cairoToday();

  useEffect(() => setDraft(initial), [initial]);

  const dirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(initial));
  const parsed = useMemo(() => settingsSchema.safeParse(draft), [draft]);
  const preview = parsed.success ? computeBaseline(parsed.data, CATALOG) : null;

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
      toast({ tone: 'error', title: 'Check the highlighted fields' });
      return;
    }
    setErrors({});
    try {
      const res = await save.mutateAsync(editable(parsed.data));
      setSavedText(computeBaseline(res.settings, CATALOG).text);
      toast({ title: 'Settings saved', body: res.regenerated ? 'The plan from today was refreshed.' : 'No plan changes were needed.' });
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const e: Errors = {};
        for (const d of err.details) e[d.path] = friendly(d.message);
        setErrors(e);
      }
      toast({ tone: 'error', title: 'Could not save settings', body: errorMessage(err) });
    }
  };

  const err = (path: string) => errors[path];

  return (
    <div className="flex flex-col gap-5">
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

        <div className="flex flex-col gap-5">
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
                {toHijri(t, draft.hijriOffsetDays).label}
              </div>
              <div className="text-sm text-muted">{formatLongDate(t)}</div>
            </div>
          </Section>
          <Section icon={Palette} title="Appearance" description="Saved on this device. System follows your OS setting.">
            <Segmented<ThemePref>
              label="Theme"
              value={pref}
              onChange={setPref}
              options={[
                { value: 'system', label: 'System' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={BookOpen} title="Quran" description="How long sessions take. Memorize minutes adapt to your real average after a few sessions.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberField id="q-mem" label="Memorize session" value={draft.quran.memorizeMinutes} suffix="min" error={err('quran.memorizeMinutes')} onChange={(n) => setQuran('memorizeMinutes', n)} />
            <NumberField id="q-page" label="Review per page" value={draft.quran.minutesPerReviewPage} suffix="min" error={err('quran.minutesPerReviewPage')} onChange={(n) => setQuran('minutesPerReviewPage', n)} />
            <NumberField id="q-cap" label="Review cap" value={draft.quran.reviewCapMinutes} suffix="min" error={err('quran.reviewCapMinutes')} onChange={(n) => setQuran('reviewCapMinutes', n)} />
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
        </Section>

        <Section icon={Target} title="Daily goal" description="The goal is a share of an average planned day. Fasting days use a smaller share.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </Section>
      </div>


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
            className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 flex items-center justify-end gap-2 rounded-full border border-line-strong bg-surface/95 p-2 pl-5 shadow-pop backdrop-blur-md md:bottom-4"
          >
            <span className="mr-auto text-sm text-muted">Unsaved changes</span>
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
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" subtitle="Saving refreshes the plan from today. Past days and their streak status never change." />
      {q.isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <SettingsForm initial={q.data} />
      )}
    </div>
  );
}
