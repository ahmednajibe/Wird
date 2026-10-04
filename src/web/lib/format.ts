import { DEFAULT_TIMEZONE, toUtcNoon } from '../../shared/dates.js';
import { ar } from '../i18n/ar.js';
import { en } from '../i18n/en.js';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export type FormatLang = 'en' | 'ar';

let currentLang: FormatLang = 'en';

/** Called by LocaleProvider whenever the language changes. */
export function setFormatLang(lang: FormatLang): void {
  currentLang = lang;
}

const dict = () => (currentLang === 'ar' ? ar : en);

const DATE_LOCALES: Record<FormatLang, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };
const NUM_LOCALES: Record<FormatLang, string> = { en: 'en-US', ar: 'ar-EG-u-nu-latn' };

interface DateFormatters {
  longDate: Intl.DateTimeFormat;
  mediumDate: Intl.DateTimeFormat;
  shortDate: Intl.DateTimeFormat;
  weekdayShort: Intl.DateTimeFormat;
  monthShort: Intl.DateTimeFormat;
}

const dateCache = new Map<FormatLang, DateFormatters>();

function formatters(): DateFormatters {
  let f = dateCache.get(currentLang);
  if (!f) {
    const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(DATE_LOCALES[currentLang], { timeZone: 'UTC', ...opts });
    f = {
      longDate: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      mediumDate: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
      shortDate: fmt({ day: 'numeric', month: 'short' }),
      weekdayShort: fmt({ weekday: 'short' }),
      monthShort: fmt({ month: 'short' }),
    };
    dateCache.set(currentLang, f);
  }
  return f;
}

/** "Friday, 25 September 2026" (en) / "الجمعة، 25 سبتمبر 2026" (ar) */
export const formatLongDate = (d: string): string => formatters().longDate.format(toUtcNoon(d));
/** "25 Sep 2026" */
export const formatMediumDate = (d: string): string => formatters().mediumDate.format(toUtcNoon(d));
/** "25 Sep" */
export const formatShortDate = (d: string): string => formatters().shortDate.format(toUtcNoon(d));
/** "Fri" */
export const formatWeekdayShort = (d: string): string => formatters().weekdayShort.format(toUtcNoon(d));
export const formatMonthShort = (d: string): string => formatters().monthShort.format(toUtcNoon(d));
export const dayOfMonth = (d: string): number => Number(d.slice(8, 10));

const arRules = new Intl.PluralRules('ar');
const AR_MINUTES: Record<Intl.LDMLPluralRule, string> = { zero: 'دقيقة', one: 'دقيقة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' };
const AR_HOURS: Record<Intl.LDMLPluralRule, string> = { zero: 'ساعة', one: 'ساعة', two: 'ساعتان', few: 'ساعات', many: 'ساعة', other: 'ساعة' };

export interface DurationPart {
  /** Null for the Arabic dual: 'ساعتان'/'دقيقتان' already carry the 2, no numeral renders. */
  n: number | null;
  unit: string;
}

/** Duration as (number, unit) segments: digits go in `num` spans, units stay in sans text. */
export function durationParts(minutes: number): DurationPart[] {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (currentLang === 'ar') {
    if (m < 60) return [{ n: m === 2 ? null : m, unit: AR_MINUTES[arRules.select(m)] }];
    if (r === 0) return [{ n: h === 2 ? null : h, unit: AR_HOURS[arRules.select(h)] }];
    return [
      { n: h, unit: 'س' },
      { n: r, unit: 'د' },
    ];
  }
  if (m < 60) return [{ n: m, unit: 'min' }];
  if (r === 0) return [{ n: h, unit: 'h' }];
  return [
    { n: h, unit: 'h' },
    { n: r, unit: 'min' },
  ];
}

export function formatMinutes(min: number): string {
  return durationParts(min)
    .map((p) => (p.n === null ? p.unit : `${p.n} ${p.unit}`))
    .join(' ');
}

/** Compact hours: "12.5 h" / "12.5 س" */
export function formatHours(min: number): string {
  const h = min / 60;
  const n = h % 1 === 0 ? h : Number(h.toFixed(1));
  return `${n} ${currentLang === 'ar' ? 'س' : 'h'}`;
}

export const formatNumber = (n: number): string => new Intl.NumberFormat(NUM_LOCALES[currentLang]).format(Math.round(n));

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Hour of the day in the plan timezone (0..23). */
export function localHour(now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(h);
}

export function greeting(now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): string {
  const h = localHour(now, tz);
  const d = dict();
  if (h < 5) return d['greeting.early'];
  if (h < 12) return d['greeting.morning'];
  if (h < 17) return d['greeting.afternoon'];
  return d['greeting.evening'];
}

export function relativeDays(from: string, to: string): number {
  return Math.round((toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / 86_400_000);
}
