// Colors and fonts mirror the app (src/web/styles.css, dark theme), so the
// promo looks like Wird itself.

export const C = {
  bg: '#05192d',
  surface: '#0b2239',
  surface2: '#11304d',
  surface3: '#183b5d',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.16)',
  ink: '#e6edf5',
  muted: '#a8b8ca',
  subtle: '#8ba0b6',
  green: '#03ef62',
  greenInk: '#2cf27d',
  amber: '#eccb62',
  amberInk: '#f0d27a',
  gold: '#d9ae3c',
  cream: '#fbf6e4',
  blue: '#5ea8f2',
  violet: '#b39af2',
  coral: '#f08b6e',
  teal: '#4fc4bd',
  rose: '#ee92b4',
  slate: '#9fb4c8',
} as const;

export const FONT = "'Plus Jakarta Sans Variable', 'IBM Plex Sans Arabic', system-ui, sans-serif";
export const MONO = "'JetBrains Mono Variable', ui-monospace, monospace";
export const AMIRI = "'Amiri', 'Traditional Arabic', serif";
export const ARABIC = "'IBM Plex Sans Arabic', sans-serif";

export const W = 1920;
export const H = 1080;
export const FPS = 30;

/** '#rrggbb' + alpha -> rgba() string. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
