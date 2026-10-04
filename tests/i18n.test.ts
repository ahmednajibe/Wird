import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
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
          const want = placeholders(v.other);
          const got = placeholders(arForms[form] as string);
          // The dual noun already means "two", so an ar `two` form may drop
          // {count} (only {count}; every other placeholder must still match).
          const expected = form === 'two' && !got.includes('count') ? want.filter((p) => p !== 'count') : want;
          expect(got, `${k}.${form}`).toEqual(expected);
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

  it('no ar two form puts a numeral before a dual noun', () => {
    // Keys allowed to keep '{count} <dual>' would go here. None today: the
    // only `two` form still showing {count} is addTask.toastLogged, where the
    // signed delta '+{count}' is followed by the singular 'نقطة', not a dual.
    const ALLOWED_DUAL_NUMERAL = new Set<string>([]);
    const dualAfterCount = /\{count\}\s*[ء-ي]*?(?:ان|ين)(?![ء-ي])/;
    for (const [k, v] of Object.entries(ar)) {
      if (typeof v === 'string' || ALLOWED_DUAL_NUMERAL.has(k)) continue;
      const two = (v as Record<string, string>)['two'];
      expect(two, `${k}.two`).not.toMatch(dualAfterCount);
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
    expect(formatMinutes(2)).toBe('دقيقتان');
    expect(formatMinutes(3)).toBe('3 دقائق');
    expect(formatMinutes(20)).toBe('20 دقيقة');
    expect(formatMinutes(60)).toBe('1 ساعة');
    expect(formatMinutes(120)).toBe('ساعتان');
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

// ---------------------------------------------------------------------------
// Leftover-English scan: reads .tsx files as text (never imports them) and
// fails on JSX text nodes or visible string props that still contain raw
// English words. A "text node" is content between '>' and '<' once {...}
// expressions are stripped; "props" are literal strings on visible/a11y
// attributes and on toast/alert title and body keys.
// ---------------------------------------------------------------------------

const WEB_ROOT = join(import.meta.dirname, '..', 'src', 'web');

// Short, deliberate allowlist. Do not grow without a comment.
const ALLOWED = [
  'Wird', // brand name
  'tanzil.net', // Quran data attribution link text
  'Africa/Cairo', // timezone input placeholder example (IANA id)
  'Preview', // score-preview request payload in AddTaskModal, never rendered
  '{"version": 1, "name": "My plan", ...}', // JSON code sample in the paste textarea
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...tsxFiles(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** True if a candidate fragment looks like code rather than UI text. */
function isCodeish(frag: string): boolean {
  if (/[=;&|()[\]]|=>|&&|\|\|/.test(frag)) return true;
  if (/^\s*[,.:)\]]/.test(frag)) return true; // ", countable: " between elements inside a call
  if (/[\w.]+:\s*$/.test(frag)) return true; // trailing "key:" inside an object literal
  return false;
}

/** Scan a text region for JSX text nodes (between > and <). */
function scanJsxText(region: string, file: string, hits: string[]): void {
  for (const m of region.matchAll(/>([^<]*)</g)) {
    const raw = m[1] ?? '';
    // Drop quoted string literals so code strings are not mistaken for text.
    const frag = raw.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
    if (!/[A-Za-z]{3,}/.test(frag)) continue;
    if (isCodeish(frag)) continue;
    let cleaned = frag;
    for (const ok of ALLOWED) cleaned = cleaned.split(ok).join('');
    if (/[A-Za-z]{3,}/.test(cleaned)) hits.push(`${file}: JSX text "${frag.trim().slice(0, 60)}"`);
  }
}

/** Strip innermost {...} expressions; scan each stripped block for JSX too. */
function scanFile(src: string, file: string, hits: string[]): void {
  let src2 = src;
  for (let i = 0; i < 60; i++) {
    const next = src2.replace(/\{([^{}]*)\}/g, (_m, inner: string) => {
      scanJsxText(inner, file, hits);
      return '';
    });
    if (next === src2) break;
    src2 = next;
  }
  scanJsxText(src2, file, hits);
}

describe('leftover English scan', () => {
  const files = tsxFiles(WEB_ROOT);
  it('finds .tsx files under src/web', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no raw English in JSX text nodes', () => {
    const hits: string[] = [];
    for (const f of files) scanFile(readFileSync(f, 'utf8'), relative(WEB_ROOT, f), hits);
    expect(hits).toEqual([]);
  });

  it('no raw English in visible string props', () => {
    const hits: string[] = [];
    // JSX attributes (prop="..." / prop='...') on visible/a11y attributes.
    const attrRe = /\b(?:aria-label|alt|placeholder|title|label|confirmLabel|subtitle|description)\s*=\s*['"]([^'"]*)['"]/g;
    // Object-literal keys that carry user-visible copy: toast/alert payloads.
    const objRe = /\b(?:title|body|message)\s*:\s*'([^']*)'/g;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const rel = relative(WEB_ROOT, f);
      for (const re of [attrRe, objRe]) {
        for (const m of src.matchAll(re)) {
          const v = m[1] ?? '';
          if (!/[A-Za-z]{3,}/.test(v)) continue;
          let cleaned = v;
          for (const ok of ALLOWED) cleaned = cleaned.split(ok).join('');
          if (/[A-Za-z]{3,}/.test(cleaned)) hits.push(`${rel}: prop ${m[0].slice(0, 60)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
