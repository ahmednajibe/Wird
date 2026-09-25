import { describe, expect, it } from 'vitest';
import { dayCapacity, fastingInfo, toHijri } from '../src/shared/calendar.js';
import { addDays, dateRange, dayOfWeek, today } from '../src/shared/dates.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/settings.js';

const S: Settings = DEFAULT_SETTINGS;

/** Finds Gregorian dates whose Hijri date (with offset) matches, via Intl. */
function findHijri(year: number, month: number, day: number, offset = 0): string {
  // Scan a generous window: Hijri 1448 spans roughly 2026-06 to 2027-06.
  for (const d of dateRange('2026-05-01', '2027-07-31')) {
    const h = toHijri(d, offset);
    if (h.year === year && h.month === month && h.day === day) return d;
  }
  throw new Error(`Hijri ${day}/${month}/${year} not found`);
}

describe('dates', () => {
  it('computes today in Africa/Cairo regardless of machine timezone', () => {
    // 2026-09-24T22:30Z is already 2026-09-25 in Cairo (UTC+2 or UTC+3 with DST).
    expect(today(new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-25');
    expect(today(new Date('2026-09-25T12:00:00Z'))).toBe('2026-09-25');
  });

  it('weeks start on Sunday', () => {
    expect(dayOfWeek('2026-09-27')).toBe(0);
    expect(dayOfWeek('2026-09-25')).toBe(5);
  });
});

describe('calendar: hijri and fasting', () => {
  it('detects Monday and Thursday', () => {
    expect(dayOfWeek('2026-09-28')).toBe(1);
    const mon = fastingInfo('2026-09-28', S);
    expect(mon.isFasting).toBe(true);
    expect(mon.codes).toContain('monday');
    const thu = fastingInfo('2026-10-01', S);
    expect(thu.isFasting).toBe(true);
    expect(thu.codes).toContain('thursday');
    const tue = fastingInfo('2026-09-29', S);
    expect(tue.isFasting).toBe(false);
    expect(tue.reasons).toEqual([]);
  });

  it('2026-09-25 is 14 Rabi al-Thani 1448, a White Day', () => {
    const h = toHijri('2026-09-25');
    expect([h.year, h.month, h.day]).toEqual([1448, 4, 14]);
    const f = fastingInfo('2026-09-25', S);
    expect(f.isFasting).toBe(true);
    expect(f.codes).toContain('white-day');
  });

  it('every day of Ramadan 1448 is fasting (range computed with Intl)', () => {
    const first = findHijri(1448, 9, 1);
    const days = dateRange(first, addDays(first, 35)).filter((d) => toHijri(d).month === 9);
    expect(days.length).toBeGreaterThanOrEqual(29);
    for (const d of days) {
      const f = fastingInfo(d, S);
      expect(f.isFasting, d).toBe(true);
      expect(f.codes).toContain('ramadan');
    }
  });

  it('1 Shawwal 1448 (Eid al-Fitr) is not fasting, even when it falls on Monday/Thursday', () => {
    const eid = findHijri(1448, 10, 1);
    expect(fastingInfo(eid, S).isFasting).toBe(false);
    expect(fastingInfo(eid, S).codes).toEqual(['eid-al-fitr']);
    // Find an offset for which 1 Shawwal lands on a Monday or Thursday.
    let tested = false;
    for (const offset of [-2, -1, 0, 1, 2]) {
      const settings: Settings = { ...S, hijriOffsetDays: offset };
      const d = findHijri(1448, 10, 1, offset);
      const dow = dayOfWeek(d);
      if (dow === 1 || dow === 4) {
        const f = fastingInfo(d, settings);
        expect(f.isFasting).toBe(false);
        expect(f.blockedBy).toMatch(/Eid al-Fitr/);
        tested = true;
      }
    }
    expect(tested).toBe(true);
  });

  it('10-13 Dhu al-Hijjah are never fasting; 1-9 are fasting', () => {
    for (let day = 1; day <= 9; day++) {
      const d = findHijri(1447, 12, day);
      const f = fastingInfo(d, S);
      expect(f.isFasting, `${day} Dhu al-Hijjah (${d})`).toBe(true);
      expect(f.codes).toContain('dhul-hijjah-first-nine');
    }
    for (let day = 10; day <= 13; day++) {
      const d = findHijri(1447, 12, day);
      const f = fastingInfo(d, S);
      expect(f.isFasting, `${day} Dhu al-Hijjah (${d})`).toBe(false);
      expect(f.codes[0]).toBe(day === 10 ? 'eid-al-adha' : 'tashreeq');
    }
  });

  it('13 Dhu al-Hijjah is not a White Day fast', () => {
    const d = findHijri(1447, 12, 13);
    expect(fastingInfo(d, S).isFasting).toBe(false);
  });

  it('hijriOffsetDays shifts the Hijri date and the fasting result', () => {
    const plus = toHijri('2026-09-25', 1);
    expect(plus).toEqual(toHijri('2026-09-26'));
    expect(plus.day).toBe(15);
    // 2026-09-23 (Wed) is 12 Rabi al-Thani: not fasting; with +1 it becomes the 13th.
    expect(toHijri('2026-09-23').day).toBe(12);
    expect(fastingInfo('2026-09-23', S).isFasting).toBe(false);
    expect(fastingInfo('2026-09-23', { ...S, hijriOffsetDays: 1 }).isFasting).toBe(true);
    expect(fastingInfo('2026-09-23', { ...S, hijriOffsetDays: -1 }).isFasting).toBe(false);
  });

  it('rule toggles disable individual rules', () => {
    const off: Settings = { ...S, fastingRules: { ...S.fastingRules, monday: false } };
    expect(fastingInfo('2026-09-28', off).isFasting).toBe(false);
  });

  it('manual overrides win', () => {
    const mon = '2026-09-28';
    expect(fastingInfo(mon, S, { date: mon, fasting: false, capacityOverride: null, note: null }).isFasting).toBe(false);
    const tue = '2026-09-29';
    const on = fastingInfo(tue, S, { date: tue, fasting: true, capacityOverride: null, note: null });
    expect(on.isFasting).toBe(true);
    expect(on.overridden).toBe(true);
    // Null means automatic.
    expect(fastingInfo(mon, S, { date: mon, fasting: null, capacityOverride: null, note: null }).isFasting).toBe(true);
  });

  it('capacity: fasting reduces the total by 40% and overrides replace the base', () => {
    expect(dayCapacity('2026-09-28', S).total).toBe(72); // Monday
    expect(dayCapacity('2026-09-29', S).total).toBe(120); // Tuesday
    expect(dayCapacity('2026-09-25', S).total).toBe(108); // Friday, White Day
    expect(dayCapacity('2026-09-26', S).total).toBe(108); // Saturday, White Day (15th)
    expect(dayCapacity('2026-10-03', S).total).toBe(180); // Saturday, normal
    const travel = dayCapacity('2026-09-29', S, { date: '2026-09-29', fasting: null, capacityOverride: 0, note: 'travel' });
    expect(travel.total).toBe(0);
    expect(travel.isRestDay).toBe(true);
  });
});
