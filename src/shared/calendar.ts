/**
 * Hijri conversion (ICU islamic-umalqura) and fasting rules.
 */
import { addDays, dayOfWeek, toUtcNoon } from './dates.js';
import type { Settings } from './settings.js';
import type { DayOverride, FastingCode, FastingInfo, HijriDate, IsoDate } from './types.js';

export const HIJRI_MONTH_NAMES = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
] as const;

// Inputs are UTC-noon instants, so format in UTC: the calendar fields are the
// same in every timezone and the setting can never shift the Hijri result.
const hijriFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

const hijriCache = new Map<string, HijriDate>();

/**
 * Hijri date for a Gregorian date in the configured timezone. `offsetDays` shifts the Gregorian
 * date before conversion (local moon sighting can differ from Umm al-Qura).
 */
export function toHijri(date: IsoDate, offsetDays = 0): HijriDate {
  const key = `${date}|${offsetDays}`;
  const cached = hijriCache.get(key);
  if (cached) return cached;
  const shifted = offsetDays === 0 ? date : addDays(date, offsetDays);
  const parts = hijriFormatter.formatToParts(toUtcNoon(shifted));
  const num = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value;
    const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) throw new Error(`Hijri conversion failed for ${date} (${type})`);
    return n;
  };
  const year = num('year');
  const month = num('month');
  const day = num('day');
  const monthName = HIJRI_MONTH_NAMES[month - 1] ?? `Month ${month}`;
  const result: HijriDate = { year, month, day, monthName, label: `${day} ${monthName} ${year} AH` };
  hijriCache.set(key, result);
  return result;
}

/**
 * Fasting status for a date. Manual override (true/false) wins over everything.
 * Otherwise automatic rules apply, and prohibited days (Eid al-Fitr, Eid al-Adha,
 * Tashreeq) always block the automatic rules.
 */
export function fastingInfo(date: IsoDate, settings: Settings, override?: DayOverride | null): FastingInfo {
  const hijri = toHijri(date, settings.hijriOffsetDays);
  const rules = settings.fastingRules;
  const codes: FastingCode[] = [];
  const reasons: string[] = [];

  const dow = dayOfWeek(date);
  if (rules.monday && dow === 1) {
    codes.push('monday');
    reasons.push('Monday');
  }
  if (rules.thursday && dow === 4) {
    codes.push('thursday');
    reasons.push('Thursday');
  }
  if (rules.whiteDays && hijri.day >= 13 && hijri.day <= 15) {
    codes.push('white-day');
    reasons.push(`White Day (${hijri.day} ${hijri.monthName})`);
  }
  if (rules.ramadan && hijri.month === 9) {
    codes.push('ramadan');
    reasons.push(`Ramadan (day ${hijri.day})`);
  }
  if (rules.dhulHijjahFirstNine && hijri.month === 12 && hijri.day >= 1 && hijri.day <= 9) {
    codes.push('dhul-hijjah-first-nine');
    reasons.push(`First days of Dhu al-Hijjah (day ${hijri.day})`);
  }

  let blockedBy: string | null = null;
  let blockCode: FastingCode | null = null;
  if (hijri.month === 10 && hijri.day === 1) {
    blockedBy = 'Eid al-Fitr (1 Shawwal)';
    blockCode = 'eid-al-fitr';
  } else if (hijri.month === 12 && hijri.day === 10) {
    blockedBy = 'Eid al-Adha (10 Dhu al-Hijjah)';
    blockCode = 'eid-al-adha';
  } else if (hijri.month === 12 && hijri.day >= 11 && hijri.day <= 13) {
    blockedBy = `Day of Tashreeq (${hijri.day} Dhu al-Hijjah)`;
    blockCode = 'tashreeq';
  }

  if (override && override.fasting !== null && override.fasting !== undefined) {
    const on = override.fasting;
    return {
      isFasting: on,
      reasons: [on ? 'Manual override: fasting' : 'Manual override: not fasting', ...reasons],
      codes: [on ? 'override-on' : 'override-off', ...codes],
      blockedBy,
      overridden: true,
    };
  }

  if (blockCode && blockedBy) {
    return {
      isFasting: false,
      reasons: [`Not a fasting day: ${blockedBy}`],
      codes: [blockCode],
      blockedBy,
      overridden: false,
    };
  }

  return { isFasting: codes.length > 0, reasons, codes, blockedBy: null, overridden: false };
}

export interface DayCapacity {
  /** Configured capacity for the weekday, before overrides/fasting. */
  base: number;
  override: number | null;
  isFasting: boolean;
  /** Final total minutes for the day, including Quran. */
  total: number;
  /** capacityOverride === 0: the day neither breaks nor extends the streak. */
  isRestDay: boolean;
}

export function dayCapacity(date: IsoDate, settings: Settings, override?: DayOverride | null): DayCapacity {
  const base = settings.capacityByDow[dayOfWeek(date)] ?? 0;
  const ov = override?.capacityOverride ?? null;
  const isFasting = fastingInfo(date, settings, override).isFasting;
  let total = ov ?? base;
  if (isFasting) total = Math.round(total * (1 - settings.fastingReductionPct / 100));
  return { base, override: ov, isFasting, total, isRestDay: ov === 0 };
}
