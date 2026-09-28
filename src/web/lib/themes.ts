/**
 * Static presentation for the plan-pack themes. Every Tailwind class is a
 * full literal string so the scanner picks them up; colors come from the
 * theme-named CSS variables in styles.css.
 */
import { THEMES } from '../../shared/pack.js';

export type ThemeId = (typeof THEMES)[number];

export interface ThemeClasses {
  text: string;
  bg: string;
  soft: string;
  border: string;
  fill: string;
  cssVar: string;
}

export const THEME_CLASSES: Record<ThemeId, ThemeClasses> = {
  amber: { text: 'text-amber-ink', bg: 'bg-amber', soft: 'bg-amber/12', border: 'border-amber/40', fill: 'fill-amber', cssVar: 'var(--amber)' },
  blue: { text: 'text-blue-ink', bg: 'bg-blue', soft: 'bg-blue/12', border: 'border-blue/40', fill: 'fill-blue', cssVar: 'var(--blue)' },
  violet: { text: 'text-violet-ink', bg: 'bg-violet', soft: 'bg-violet/12', border: 'border-violet/40', fill: 'fill-violet', cssVar: 'var(--violet)' },
  coral: { text: 'text-coral-ink', bg: 'bg-coral', soft: 'bg-coral/12', border: 'border-coral/40', fill: 'fill-coral', cssVar: 'var(--coral)' },
  green: { text: 'text-green-ink', bg: 'bg-green', soft: 'bg-green/12', border: 'border-green/40', fill: 'fill-green', cssVar: 'var(--green)' },
  teal: { text: 'text-teal-ink', bg: 'bg-teal', soft: 'bg-teal/12', border: 'border-teal/40', fill: 'fill-teal', cssVar: 'var(--teal)' },
  rose: { text: 'text-rose-ink', bg: 'bg-rose', soft: 'bg-rose/12', border: 'border-rose/40', fill: 'fill-rose', cssVar: 'var(--rose)' },
  slate: { text: 'text-slate-ink', bg: 'bg-slate', soft: 'bg-slate/12', border: 'border-slate/40', fill: 'fill-slate', cssVar: 'var(--slate)' },
};

const KNOWN = new Set<string>(THEMES);

/** Theme classes for an id; unknown ids fall back to slate. */
export function themeClasses(id: string | null | undefined): ThemeClasses {
  return THEME_CLASSES[KNOWN.has(id ?? '') ? (id as ThemeId) : 'slate'];
}
