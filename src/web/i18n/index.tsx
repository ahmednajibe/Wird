/**
 * Tiny typed i18n layer: a per-device language preference (localStorage
 * "wird-lang"), dir/lang on <html>, and t / tn / tRich / tnRich lookups
 * into the flat dictionaries in en.ts and ar.ts.
 */
import { createContext, Fragment, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { setFormatLang } from '../lib/format';
import { ar } from './ar';
import { en, fill, pluralForm, tnFor, type Dict, type PluralKey, type StringKey } from './en';

export type Lang = 'en' | 'ar';
export type Dir = 'ltr' | 'rtl';
export type { StringKey, PluralKey };
export { tnFor };

const KEY = 'wird-lang';
const DICTS: Record<Lang, Dict> = { en, ar: ar as unknown as Dict };

type Vars = Record<string, string | number>;
type RichParts = Record<string, ReactNode>;

function detect(): Lang {
  try {
    const primary = navigator.languages?.[0] ?? navigator.language ?? '';
    if (primary.toLowerCase().startsWith('ar')) return 'ar';
  } catch {
    /* no navigator */
  }
  return 'en';
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'ar') return v;
  } catch {
    /* storage unavailable */
  }
  return detect();
}

/** Fill {placeholders} with ReactNodes; unknown placeholders stay literal. */
function rich(template: string, parts: RichParts): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  const re = /\{(\w+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) out.push(<Fragment key={i++}>{template.slice(last, m.index)}</Fragment>);
    const name = m[1] as string;
    out.push(<Fragment key={i++}>{name in parts ? parts[name] : m[0]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(<Fragment key={i++}>{template.slice(last)}</Fragment>);
  return out;
}

interface I18nCtx {
  lang: Lang;
  dir: Dir;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Vars) => string;
  tn: (key: PluralKey, count: number, vars?: Vars) => string;
  tRich: (key: StringKey, parts: RichParts) => ReactNode[];
  tnRich: (key: PluralKey, count: number, parts: RichParts) => ReactNode[];
}

const Ctx = createContext<I18nCtx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const dir: Dir = lang === 'ar' ? 'rtl' : 'ltr';

  // Keep the non-React formatters in sync before children render.
  setFormatLang(lang);

  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18nCtx>(() => {
    const d = DICTS[lang];
    return {
      lang,
      dir,
      setLang,
      t: (key, vars) => fill(d[key] as string, vars),
      tn: (key, count, vars) => tnFor(lang, key, count, vars),
      tRich: (key, parts) => rich(d[key] as string, parts),
      tnRich: (key, count, parts) => rich(pluralForm(lang, key, count), { count, ...parts }),
    };
  }, [lang, dir, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside LocaleProvider');
  return v;
}
