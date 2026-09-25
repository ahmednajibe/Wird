/**
 * Date helpers. Every calendar date in the app is a 'YYYY-MM-DD' string in the
 * Africa/Cairo timezone. Arithmetic is done on UTC-noon instants so that the
 * machine's local timezone and DST never leak into the results.
 */
import type { IsoDate } from './types.js';

export const APP_TIMEZONE = 'Africa/Cairo';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const cairoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new Error(`Invalid date '${value}', expected YYYY-MM-DD`);
  return value;
}

/** Converts a date string to a UTC-noon Date instant (safe for any timezone). */
export function toUtcNoon(date: IsoDate): Date {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid date '${date}'`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function fromUtcDate(d: Date): IsoDate {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The Cairo calendar date for an instant (defaults to now). */
export function cairoDateOf(instant: Date): IsoDate {
  const parts = cairoDateFormatter.formatToParts(instant);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Today's date in Africa/Cairo. Pass `now` to make it deterministic in tests. */
export function today(now: Date = new Date()): IsoDate {
  return cairoDateOf(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtcNoon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtcDate(d);
}

/** Day of week, 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return toUtcNoon(date).getUTCDay();
}

export const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** The Sunday that starts the week containing `date` (weeks start on Sunday). */
export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, -dayOfWeek(date));
}

export function weekEnd(date: IsoDate): IsoDate {
  return addDays(weekStart(date), 6);
}

export function weekDates(start: IsoDate): IsoDate[] {
  const s = weekStart(start);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** Inclusive range of dates. Returns [] when from > to. */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Whole days from a to b (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcNoon(b).getTime() - toUtcNoon(a).getTime()) / 86_400_000);
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}
