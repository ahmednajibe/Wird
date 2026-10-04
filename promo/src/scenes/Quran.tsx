import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { countUp, easeInOut, enter, prog } from '../anim';
import { Eyebrow } from '../components/Text';
import { alpha, AMIRI, C, FONT, MONO } from '../theme';

// 604 pages as 30 juz rows. Pages fill in the app's memorization order
// (Juz 30 from its last page backward, then Juz 29, then from page 1),
// while a review wave keeps passing back over what is already known.

const ROWS = 30;
const COLS = 20;
const CELL = 17;
const GAP = 5;
const GRID_X = 250;
const GRID_Y = 220;
const FILLED = 100;

const ORDER: [number, number][] = [];
for (let c = COLS - 1; c >= 0; c--) ORDER.push([29, c]);
for (let c = 0; c < COLS; c++) ORDER.push([28, c]);
for (let r = 0; r < 27; r++) for (let c = 0; c < COLS; c++) ORDER.push([r, c]);
const RANK = new Map(ORDER.map(([r, c], i) => [`${r}:${c}`, i]));

export const Quran: React.FC = () => {
  const f = useCurrentFrame();
  const filled = FILLED * prog(f, 12, 100, easeInOut);
  const wave = (f - 30) * 1.4; // review head, in rank units

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {/* grid */}
      <div style={{ position: 'absolute', left: GRID_X - 110, top: GRID_Y - 6, fontFamily: MONO, fontSize: 18, color: C.subtle, ...enter(f, 4) }}>
        Juz 1
      </div>
      <div style={{ position: 'absolute', left: GRID_X - 110, top: GRID_Y + 29 * (CELL + GAP) - 4, fontFamily: MONO, fontSize: 18, color: C.amberInk, ...enter(f, 4) }}>
        Juz 30
      </div>
      {Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => {
          const k = RANK.get(`${r}:${c}`) ?? 9999;
          const on = k < filled;
          const isNext = Math.floor(filled) === k && f > 12;
          const appear = Math.min(1, Math.max(0, filled - k));
          const d = wave - k;
          const reviewed = on && d >= 0 && d < 18 ? 1 - d / 18 : 0;
          const rowIn = prog(f, r * 0.6, 14);
          return (
            <div
              key={`${r}:${c}`}
              style={{
                position: 'absolute',
                left: GRID_X + c * (CELL + GAP),
                top: GRID_Y + r * (CELL + GAP),
                width: CELL,
                height: CELL,
                borderRadius: 4,
                background: on
                  ? `rgba(${lerpRgb([186, 156, 72], [255, 226, 135], reviewed)},${0.6 + 0.4 * appear})`
                  : alpha('#ffffff', 0.05),
                border: isNext ? `2px solid ${C.amberInk}` : 'none',
                boxSizing: 'border-box',
                boxShadow: reviewed > 0.3 ? `0 0 ${12 * reviewed}px ${alpha(C.amber, 0.7 * reviewed)}` : 'none',
                transform: `scale(${on ? 0.7 + 0.3 * appear : 1})`,
                opacity: rowIn,
              }}
            />
          );
        }),
      )}

      {/* copy */}
      <div style={{ position: 'absolute', left: 860, top: 250, width: 900 }}>
        <div style={enter(f, 6)}>
          <Eyebrow color={C.amberInk}>Optional: Quran memorization</Eyebrow>
        </div>
        <div style={{ ...enter(f, 12), marginTop: 26, fontSize: 80, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1.06 }}>
          Memorize a page.
          <br />
          <span style={{ color: C.amberInk }}>Review the next.</span>
        </div>
        <div style={{ ...enter(f, 22), marginTop: 30, fontSize: 34, lineHeight: 1.45, fontWeight: 500, color: C.muted }}>
          Reviews rotate through everything you know, so no page is left behind.
        </div>
        <div style={{ ...enter(f, 34), marginTop: 46, display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 72, fontWeight: 700, color: C.amberInk }}>{countUp(f, 12, 100, 0, FILLED)}</span>
          <span style={{ fontSize: 32, color: C.muted }}>of 604 pages</span>
        </div>
        <div
          dir="rtl"
          style={{
            ...enter(f, 44),
            marginTop: 30,
            display: 'inline-flex',
            gap: 34,
            padding: '14px 32px',
            borderRadius: 999,
            border: `1.5px solid ${alpha(C.amber, 0.35)}`,
            background: alpha(C.amber, 0.08),
            fontFamily: AMIRI,
            fontSize: 44,
            color: C.amberInk,
          }}
        >
          <span>الكافرون</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>النصر</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>المسد</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

function lerpRgb(a: number[], b: number[], t: number): string {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',');
}
