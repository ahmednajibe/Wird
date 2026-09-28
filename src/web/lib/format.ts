import { DEFAULT_TIMEZONE, toUtcNoon } from '../../shared/dates.js';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts });

const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const mediumDate = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = fmt({ day: 'numeric', month: 'short' });
const weekdayShort = fmt({ weekday: 'short' });
const monthShort = fmt({ month: 'short' });

/** "Friday, 25 September 2026" */
export const formatLongDate = (d: string): string => longDate.format(toUtcNoon(d));
/** "25 Sep 2026" */
export const formatMediumDate = (d: string): string => mediumDate.format(toUtcNoon(d));
/** "25 Sep" */
export const formatShortDate = (d: string): string => shortDate.format(toUtcNoon(d));
/** "Fri" */
export const formatWeekdayShort = (d: string): string => weekdayShort.format(toUtcNoon(d));
export const formatMonthShort = (d: string): string => monthShort.format(toUtcNoon(d));
export const dayOfMonth = (d: string): number => Number(d.slice(8, 10));

export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** Compact hours: "12.5 h" */
export function formatHours(min: number): string {
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`;
}

export const formatNumber = (n: number): string => new Intl.NumberFormat('en-US').format(Math.round(n));

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Hour of the day in Cairo (0..23). */
export function cairoHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: DEFAULT_TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(now);
  return Number(h);
}

export function greeting(now: Date = new Date()): string {
  const h = cairoHour(now);
  if (h < 5) return 'Up early';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function relativeDays(from: string, to: string): number {
  return Math.round((toUtcNoon(to).getTime() - toUtcNoon(from).getTime()) / 86_400_000);
}
