import { describe, expect, it } from 'vitest';
import { ar } from '../src/web/i18n/ar.js';
import { en, tnFor, type PluralKey } from '../src/web/i18n/en.js';
import { formatLongDate, formatMinutes, formatHours, setFormatLang } from '../src/web/lib/format.js';

const AR_PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

const values = (d: Record<string, unknown>): string[] =>
  Object.values(d).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v as Record<string, string>)));

describe('i18n dictionaries', () => {
  it('en and ar have exactly the same keys', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('every ar plural key has all six CLDR forms', () => {
    for (const [k, v] of Object.entries(en) as [string, string | { one: string; other: string }][]) {
      if (typeof v === 'string') continue;
      const a = (ar as Record<string, unknown>)[k];
      expect(typeof a).not.toBe('string');
      expect(Object.keys(a as object).sort()).toEqual([...AR_PLURAL_FORMS].sort());
    }
  });

  it('placeholders match between en and ar', () => {
    for (const [k, v] of Object.entries(en) as [string, string | { one: string; other: string }][]) {
      const a = (ar as Record<string, unknown>)[k];
      if (typeof v === 'string') {
        expect(typeof a).toBe('string');
        expect(placeholders(a as string), k).toEqual(placeholders(v));
      } else {
        const arForms = a as Record<string, string>;
        for (const form of AR_PLURAL_FORMS) {
          expect(placeholders(arForms[form] as string), `${k}.${form}`).toEqual(placeholders(v.other));
        }
      }
    }
  });

  it('no em dashes or en dashes anywhere', () => {
    for (const s of [...values(en), ...values(ar)]) {
      expect(s).not.toMatch(/[–—]/);
    }
  });

  it('no Arabic-Indic digits in ar', () => {
    for (const s of values(ar)) {
      expect(s).not.toMatch(/[٠-٩]/);
    }
  });
});

describe('tnFor Arabic plural selection', () => {
  const key: PluralKey = 'common.points';
  it.each([
    [0, 'zero'],
    [1, 'one'],
    [2, 'two'],
    [3, 'few'],
    [11, 'many'],
    [100, 'other'],
  ])('count %i picks %s', (count, form) => {
    const forms = ar[key] as Record<string, string>;
    expect(tnFor('ar', key, count)).toBe(forms[form]?.replace('{count}', String(count)));
  });

  it('en picks one/other', () => {
    expect(tnFor('en', key, 1)).toBe('1 point');
    expect(tnFor('en', key, 5)).toBe('5 points');
  });
});

describe('locale-aware formatting', () => {
  it('ar dates use Western digits and Arabic month names', () => {
    setFormatLang('ar');
    const s = formatLongDate('2026-10-03');
    expect(s).not.toMatch(/[٠-٩]/);
    expect(s).toContain('أكتوبر');
    setFormatLang('en');
    expect(formatLongDate('2026-10-03')).toBe('Saturday, 3 October 2026');
  });

  it('ar minutes are plural aware', () => {
    setFormatLang('ar');
    expect(formatMinutes(1)).toBe('1 دقيقة');
    expect(formatMinutes(2)).toBe('2 دقيقتان');
    expect(formatMinutes(3)).toBe('3 دقائق');
    expect(formatMinutes(20)).toBe('20 دقيقة');
    expect(formatMinutes(60)).toBe('1 ساعة');
    expect(formatMinutes(120)).toBe('2 ساعتان');
    expect(formatMinutes(180)).toBe('3 ساعات');
    expect(formatMinutes(100)).toBe('1 س 40 د');
    expect(formatHours(750)).toBe('12.5 س');
  });

  it('en durations unchanged', () => {
    setFormatLang('en');
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(100)).toBe('1 h 40 min');
    expect(formatHours(750)).toBe('12.5 h');
  });
});
