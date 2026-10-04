import React from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { easeInOut, enter, lerp, pop, prog } from '../anim';
import { Icon } from '../components/Icon';
import { Chip, Em, Headline } from '../components/Text';
import { alpha, C, FONT, MONO } from '../theme';

// Today: tick tasks off, points fly into the ring, the small daily goal is
// reached and the streak is secured.

const GOAL = 42;
export const TASKS = [
  { track: 'German', color: C.blue, title: 'Deep study: German A1', min: 20, pts: 24, at: 30 },
  { track: 'Python', color: C.violet, title: 'Python for Data Science', min: 40, pts: 48, at: 60 },
  { track: 'Quran', color: C.amber, title: 'Memorize page 582', min: 40, pts: 75, at: 90 },
];
export const FLY = 18;

/** The frame the task that crosses the goal lands: "Streak secured". */
export const SECURED = (() => {
  let before = 0;
  for (const t of TASKS) {
    if (before < GOAL && before + t.pts >= GOAL) return t.at + FLY;
    before += t.pts;
  }
  return Infinity;
})();

const CARD_X = 200;
const CARD_W = 840;
const CARD_H = 150;
const CARD_TOP = 330;
const CARD_GAP = 26;

const RING_X = 1450;
const RING_Y = 560;
const R = 170;

export const Today: React.FC = () => {
  const f = useCurrentFrame();

  let pts = 0;
  for (const t of TASKS) pts += t.pts * prog(f, t.at + FLY - 4, 10, easeInOut);
  const shown = Math.round(pts);
  const fill = Math.min(1, pts / GOAL);
  const secured = prog(f, SECURED, 16);
  const C_LEN = 2 * Math.PI * R;

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Headline
        title={<>Finish a task. <Em>The points are automatic.</Em></>}
        sub="Worked out from the minutes and the kind of work. Nothing to type in."
      />

      {TASKS.map((t, i) => {
        const y = CARD_TOP + i * (CARD_H + CARD_GAP);
        const check = pop(f, t.at, 12, 200);
        const done = f >= t.at;
        return (
          <div
            key={t.title}
            style={{
              position: 'absolute',
              left: CARD_X,
              top: y,
              width: CARD_W,
              height: CARD_H,
              borderRadius: 24,
              background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
              border: `1.5px solid ${done ? alpha(C.green, 0.3) : C.line}`,
              boxShadow: '0 30px 60px -36px rgba(0,8,20,0.95)',
              display: 'flex',
              alignItems: 'center',
              gap: 30,
              padding: '0 36px',
              boxSizing: 'border-box',
              ...enter(f, 8 + i * 5),
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 99,
                border: `3px solid ${done ? C.green : C.lineStrong}`,
                background: done ? C.green : 'transparent',
                display: 'grid',
                placeItems: 'center',
                transform: `scale(${done ? lerp(0.6, 1, check) : 1})`,
                boxShadow: done ? `0 0 30px ${alpha(C.green, 0.5)}` : 'none',
                flexShrink: 0,
              }}
            >
              {done && <Icon name="check" size={34} color={C.bg} stroke={3.4} draw={prog(f, t.at + 2, 10)} />}
            </div>
            <div style={{ flex: 1, opacity: done ? lerp(1, 0.6, prog(f, t.at + 8, 12)) : 1 }}>
              <Chip color={t.color} size={19}>{t.track}</Chip>
              <div style={{ marginTop: 10, fontSize: 34, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>{t.title}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 22, fontSize: 23, color: C.subtle, alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="clock" size={20} color={C.subtle} /> {t.min} min
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.greenInk, fontWeight: 700 }}>
                  <Icon name="zap" size={20} color={C.greenInk} fill={C.greenInk} /> {t.pts} points
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* the ring */}
      <div style={{ position: 'absolute', left: RING_X - R - 40, top: RING_Y - R - 40, ...enter(f, 14) }}>
        <svg width={2 * R + 80} height={2 * R + 80} style={{ overflow: 'visible' }}>
          <circle cx={R + 40} cy={R + 40} r={R} fill="none" stroke={alpha('#ffffff', 0.07)} strokeWidth={26} />
          <circle
            cx={R + 40}
            cy={R + 40}
            r={R}
            fill="none"
            stroke={C.green}
            strokeWidth={26}
            strokeLinecap="round"
            strokeDasharray={C_LEN}
            strokeDashoffset={C_LEN * (1 - fill)}
            transform={`rotate(-90 ${R + 40} ${R + 40})`}
            style={{ filter: `drop-shadow(0 0 ${10 + 24 * secured}px ${alpha(C.green, 0.4 + 0.4 * secured)})` }}
            opacity={fill > 0.002 ? 1 : 0}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 120, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shown}</div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 8 }}>goal {GOAL}</div>
        </div>
        <Confetti start={SECURED} cx={R + 40} cy={R + 40} />
      </div>

      {/* points flying to the ring */}
      {TASKS.map((t, i) => {
        if (f < t.at || f >= t.at + FLY + 2) return null;
        const k = prog(f, t.at, FLY, easeInOut);
        const sx = CARD_X + CARD_W - 120;
        const sy = CARD_TOP + i * (CARD_H + CARD_GAP) + CARD_H / 2;
        const x = lerp(sx, RING_X, k);
        const y = lerp(sy, RING_Y, k) - Math.sin(k * Math.PI) * 120;
        return (
          <div
            key={t.title}
            style={{
              position: 'absolute',
              left: x - 80,
              top: y - 30,
              width: 160,
              textAlign: 'center',
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: lerp(46, 30, k),
              color: C.greenInk,
              textShadow: `0 0 24px ${alpha(C.green, 0.8)}`,
              opacity: k > 0.85 ? (1 - k) / 0.15 : 1,
            }}
          >
            +{t.pts}
          </div>
        );
      })}

      {/* secured */}
      <div style={{ position: 'absolute', left: RING_X - 300, width: 600, top: RING_Y + R + 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ ...enter(f, SECURED + 2, 16, 18), display: 'flex', alignItems: 'center', gap: 12, fontSize: 38, fontWeight: 800, color: C.greenInk, letterSpacing: '-0.02em' }}>
          <Icon name="shield" size={40} color={C.greenInk} stroke={2.4} /> Streak secured
        </div>
        <div style={{ ...enter(f, SECURED + 10, 16, 18), display: 'flex', alignItems: 'center', gap: 10, fontSize: 28, color: C.muted }}>
          <Icon name="flame" size={28} color={C.green} fill={C.green} />
          <b style={{ color: C.ink }}>{f < SECURED + 18 ? 11 : 12} day</b> streak
        </div>
      </div>

      <div style={{ position: 'absolute', top: 930, width: '100%', textAlign: 'center', fontSize: 30, fontWeight: 500, color: C.muted, ...enter(f, 122) }}>
        The daily goal is small on purpose: <span style={{ color: C.ink }}>a light day still counts.</span>
      </div>
    </AbsoluteFill>
  );
};

const Confetti: React.FC<{ start: number; cx: number; cy: number }> = ({ start, cx, cy }) => {
  const f = useCurrentFrame();
  const t = f - start;
  if (!Number.isFinite(start) || t < 0 || t > 50) return null;
  const colors = [C.green, C.amber, C.blue, C.violet, C.coral, C.greenInk];
  return (
    <>
      {Array.from({ length: 34 }, (_, i) => {
        const a = random(`a${i}`) * Math.PI * 2;
        const v = 7 + random(`v${i}`) * 9;
        const x = cx + Math.cos(a) * v * t;
        const y = cy + Math.sin(a) * v * t + 0.18 * t * t;
        const s = 8 + random(`s${i}`) * 8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: s,
              height: s * 0.5,
              borderRadius: 2,
              background: colors[i % colors.length],
              transform: `rotate(${t * (8 + i)}deg)`,
              opacity: 1 - t / 50,
            }}
          />
        );
      })}
    </>
  );
};
