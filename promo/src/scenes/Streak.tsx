import React from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { countUp, enter, prog } from '../anim';
import { Icon } from '../components/Icon';
import { Em } from '../components/Text';
import { alpha, C, FONT, MONO } from '../theme';

// A year of days, filling week by week like the Stats heatmap: most days
// reach their goal, a few fall short, rest days pause without breaking.

const WEEKS = 52;
const CELL = 21;
const GAP = 5;
const GRID_W = WEEKS * (CELL + GAP) - GAP;
const GRID_X = (1920 - GRID_W) / 2;
const GRID_Y = 560;

type Kind = 'goal' | 'big' | 'short' | 'rest';
function kindOf(w: number, d: number): Kind {
  const r = random(`day-${w}-${d}`);
  if (d === 5 && random(`rest-${w}`) < 0.45) return 'rest';
  // No short days in the last 18 weeks: that is the current streak.
  if (r < 0.07 && w < WEEKS - 18) return 'short';
  if (r < 0.3) return 'big';
  return 'goal';
}

export const Streak: React.FC = () => {
  const f = useCurrentFrame();
  const sweep = prog(f, 14, 80) * (WEEKS + 2);

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center' }}>
        <div style={{ ...enter(f, 2), fontSize: 96, fontWeight: 800, color: C.ink, letterSpacing: '-0.045em' }}>
          Small days. <Em>Long streaks.</Em>
        </div>
        <div style={{ ...enter(f, 12), marginTop: 30, display: 'inline-flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: C.green, display: 'grid', placeItems: 'center', boxShadow: `0 0 40px ${alpha(C.green, 0.55)}` }}>
            <Icon name="flame" size={38} color={C.bg} fill={C.bg} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.ink }}>{countUp(f, 14, 84, 1, 128)}</span>
          <span style={{ fontSize: 34, color: C.muted }}>day streak</span>
        </div>
      </div>

      {Array.from({ length: WEEKS }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => {
          const t = Math.min(1, Math.max(0, sweep - w - d * 0.12));
          const k = kindOf(w, d);
          const bg =
            t <= 0
              ? alpha('#ffffff', 0.05)
              : k === 'big'
                ? C.green
                : k === 'goal'
                  ? alpha(C.green, 0.55)
                  : k === 'short'
                    ? alpha(C.slate, 0.3)
                    : 'transparent';
          return (
            <div
              key={`${w}-${d}`}
              style={{
                position: 'absolute',
                left: GRID_X + w * (CELL + GAP),
                top: GRID_Y + d * (CELL + GAP),
                width: CELL,
                height: CELL,
                borderRadius: 5,
                boxSizing: 'border-box',
                background: bg,
                border: t > 0 && k === 'rest' ? `1.5px dashed ${alpha(C.slate, 0.5)}` : 'none',
                transform: `scale(${t > 0 ? 0.6 + 0.4 * t : 1})`,
                boxShadow: t > 0 && k === 'big' ? `0 0 10px ${alpha(C.green, 0.45)}` : 'none',
                opacity: prog(f, 4 + w * 0.2, 12),
              }}
            />
          );
        }),
      )}

      <div style={{ position: 'absolute', top: GRID_Y + 7 * (CELL + GAP) + 50, width: '100%', display: 'flex', justifyContent: 'center', gap: 46, fontSize: 26, color: C.muted, ...enter(f, 60) }}>
        <Legend swatch={<Swatch bg={alpha(C.green, 0.55)} />} label="Goal reached" />
        <Legend swatch={<Swatch bg={C.green} glow />} label="2.5x goal" />
        <Legend swatch={<Swatch bg="transparent" dashed />} label="Rest day: pauses, never breaks" />
      </div>
    </AbsoluteFill>
  );
};

const Swatch: React.FC<{ bg: string; glow?: boolean; dashed?: boolean }> = ({ bg, glow, dashed }) => (
  <span
    style={{
      width: 22,
      height: 22,
      borderRadius: 5,
      background: bg,
      boxSizing: 'border-box',
      border: dashed ? `1.5px dashed ${alpha(C.slate, 0.6)}` : 'none',
      boxShadow: glow ? `0 0 10px ${alpha(C.green, 0.5)}` : 'none',
      display: 'inline-block',
    }}
  />
);

const Legend: React.FC<{ swatch: React.ReactNode; label: string }> = ({ swatch, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
    {swatch}
    {label}
  </span>
);
