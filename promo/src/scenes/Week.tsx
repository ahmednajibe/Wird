import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { easeInOut, enter, leave, lerp, pop, prog } from '../anim';
import { Icon } from '../components/Icon';
import { Em } from '../components/Text';
import { alpha, C, FONT, MONO } from '../theme';

// Seven day columns sized by capacity (Sun-Thu 120 min, Fri/Sat 180 min,
// fasting days 40% less), filled with sessions. Then a missed session on
// Tuesday rolls forward to Wednesday, in its own lane.

const PX = 2.9; // px per minute
const COL_W = 168;
const COL_GAP = 28;
const COLS_X = (1920 - (7 * COL_W + 6 * COL_GAP)) / 2;
const BASE_Y = 900; // column bottoms

type Block = { min: number; color: string; label: string };
const Q = (min: number): Block => ({ min, color: C.amber, label: 'Quran' });
const G = (min: number): Block => ({ min, color: C.blue, label: 'German' });
const P = (min: number): Block => ({ min, color: C.violet, label: 'Python' });
const D = (min: number): Block => ({ min, color: C.coral, label: 'Drawing' });

const DAYS: { name: string; cap: number; fasting?: boolean; blocks: Block[] }[] = [
  { name: 'SUN', cap: 120, blocks: [Q(40), G(20), P(40), D(20)] },
  { name: 'MON', cap: 72, fasting: true, blocks: [Q(10), G(32), P(30)] },
  { name: 'TUE', cap: 120, blocks: [Q(40), G(20), P(40), D(20)] },
  { name: 'WED', cap: 120, blocks: [Q(40), G(20), P(40)] },
  { name: 'THU', cap: 72, fasting: true, blocks: [Q(40), G(32)] },
  { name: 'FRI', cap: 180, blocks: [Q(10), G(20), D(60), P(60)] },
  { name: 'SAT', cap: 180, blocks: [Q(40), G(20), D(60), P(60)] },
];

const RESIZE = 26;
const FILL = 50;
const MISS = 118;
const ROLL = 132;

export const Week: React.FC = () => {
  const f = useCurrentFrame();
  const resize = prog(f, RESIZE, 24, easeInOut);
  const miss = prog(f, MISS, 12);
  const roll = pop(f, ROLL, 15, 90);

  // Where Tuesday's drawing block sits, and where it lands on Wednesday.
  const tueTop = BASE_Y - 100 * PX;
  const wedTop = BASE_Y - 100 * PX - 20 * PX;
  const rollX = lerp(COLS_X + 2 * (COL_W + COL_GAP), COLS_X + 3 * (COL_W + COL_GAP), roll);
  const rollY = lerp(tueTop - 20 * PX, wedTop, roll) - Math.sin(Math.min(roll, 1) * Math.PI) * 90;

  let block = 0;
  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <div style={{ position: 'absolute', top: 100, width: '100%', textAlign: 'center' }}>
        <div style={{ ...enter(f, 2), fontSize: 70, fontWeight: 800, color: C.ink, letterSpacing: '-0.035em' }}>
          It plans your week <Em>around your time.</Em>
        </div>
        <div style={{ position: 'relative', height: 50, marginTop: 18, fontSize: 32, fontWeight: 500, color: C.muted }}>
          <div style={{ position: 'absolute', width: '100%', ...(f < MISS - 8 ? enter(f, 10) : leave(f, MISS - 8)) }}>
            Lighter on fasting days. Fuller on weekends.
          </div>
          <div style={{ position: 'absolute', width: '100%', ...enter(f, MISS) }}>
            Missed a session? It <span style={{ color: C.coral }}>rolls forward</span>, nothing piles up.
          </div>
        </div>
      </div>

      {DAYS.map((d, i) => {
        const x = COLS_X + i * (COL_W + COL_GAP);
        const cap = lerp(120, d.cap, resize);
        const colIn = pop(f, 4 + i * 3);
        const changed = d.cap !== 120;
        let stack = 0;
        return (
          <React.Fragment key={d.name}>
            {/* capacity column */}
            <div
              style={{
                position: 'absolute',
                left: x,
                top: BASE_Y - cap * PX - 8,
                width: COL_W,
                height: cap * PX + 16,
                borderRadius: 22,
                background: alpha(C.surface, 0.85),
                border: `1.5px solid ${C.line}`,
                opacity: colIn,
                transform: `translateY(${(1 - colIn) * 40}px)`,
              }}
            />
            {/* capacity label */}
            <div
              style={{
                position: 'absolute',
                left: x,
                width: COL_W,
                top: BASE_Y - cap * PX - 62,
                display: 'flex',
                justifyContent: 'center',
                opacity: changed ? resize : 0,
              }}
            >
              {d.fasting ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 99, background: alpha(C.amber, 0.14), border: `1.5px solid ${alpha(C.amber, 0.45)}`, color: C.amberInk, fontSize: 21, fontWeight: 600 }}>
                  <Icon name="moon" size={20} color={C.amberInk} /> Fasting
                </span>
              ) : (
                <span style={{ fontFamily: MONO, fontSize: 24, color: C.greenInk, fontWeight: 600 }}>3h</span>
              )}
            </div>
            {/* sessions */}
            {d.blocks.map((b, j) => {
              const h = b.min * PX - 6;
              const y = BASE_Y - stack * PX - b.min * PX;
              stack += b.min;
              const t = pop(f, FILL + block++ * 1.6, 14, 150);
              const isMissed = i === 2 && b.label === 'Drawing';
              return (
                <div
                  key={j}
                  style={{
                    position: 'absolute',
                    left: x + 8,
                    top: y + (1 - t) * -60,
                    width: COL_W - 16,
                    height: h,
                    borderRadius: 12,
                    background: isMissed && miss > 0 ? alpha(b.color, 0.12 * miss + (1 - miss) * 0.9) : `linear-gradient(180deg, ${b.color}, ${alpha(b.color, 0.78)})`,
                    border: isMissed && miss > 0 ? `2px dashed ${alpha(b.color, 0.6)}` : 'none',
                    boxSizing: 'border-box',
                    opacity: Math.min(1, t * 1.5),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 700,
                    color: isMissed && miss > 0.5 ? b.color : alpha(C.bg, 0.85),
                  }}
                >
                  {h >= 52 ? (isMissed && miss > 0.5 ? 'missed' : b.label) : ''}
                </div>
              );
            })}
            <div style={{ position: 'absolute', left: x, width: COL_W, top: BASE_Y + 26, textAlign: 'center', fontFamily: MONO, fontSize: 24, fontWeight: 600, color: i === 0 ? C.greenInk : C.subtle, opacity: colIn }}>
              {d.name}
            </div>
          </React.Fragment>
        );
      })}

      {/* the rolled session */}
      {f >= ROLL - 1 && (
        <div
          style={{
            position: 'absolute',
            left: rollX + 8,
            top: rollY,
            width: COL_W - 16,
            height: 20 * PX - 6,
            borderRadius: 12,
            background: `linear-gradient(180deg, ${C.coral}, ${alpha(C.coral, 0.78)})`,
            boxShadow: `0 10px 30px -6px ${alpha(C.coral, 0.7)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontSize: 20,
            fontWeight: 700,
            color: alpha(C.bg, 0.85),
            opacity: prog(f, ROLL - 1, 6),
          }}
        >
          <Icon name="redo" size={20} color={alpha(C.bg, 0.85)} stroke={2.6} /> Drawing
        </div>
      )}
    </AbsoluteFill>
  );
};
