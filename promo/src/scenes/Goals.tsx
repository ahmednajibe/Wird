import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { enter, leave, lerp, pop, prog } from '../anim';
import { Icon } from '../components/Icon';
import { Em } from '../components/Text';
import { alpha, C, FONT, MONO } from '../theme';

// Beat 1: "You want to learn" + four goals.
// Beat 2: "Your day has 2 hours." The goals drop into a 120-minute bar,
// sized to fit, Quran first (Wird reserves its time before the tracks).

const PX_PER_MIN = 11;
const BAR_W = 120 * PX_PER_MIN;
const BAR_X = (1920 - BAR_W) / 2;
const BAR_Y = 600;
const BAR_H = 150;

const ROW_Y = 520;
const PILL_H = 104;
const GAP = 26;

export const GOALS = [
  { label: 'German', color: C.blue, w: 270, slot: 1 },
  { label: 'Python', color: C.violet, w: 270, slot: 2 },
  { label: 'Drawing', color: C.coral, w: 296, slot: 3 },
  { label: 'Quran', color: C.amber, w: 270, slot: 0 },
];
const SLOT_MIN = [40, 20, 40, 20];

const ROW_W = GOALS.reduce((s, g) => s + g.w, 0) + GAP * (GOALS.length - 1);
const ROW_X = (1920 - ROW_W) / 2;

export const DROP = 112; // first pill leaves the row
export const FIT = 172; // "Wird makes it fit."

export const Goals: React.FC = () => {
  const f = useCurrentFrame();

  const barIn = prog(f, DROP - 16, 18);
  const fitGlow = prog(f, FIT, 20);

  let rowX = ROW_X;
  let slotX = BAR_X;
  const slots = SLOT_MIN.map((m) => {
    const x = slotX;
    slotX += m * PX_PER_MIN;
    return { x: x + 6, w: m * PX_PER_MIN - 12 };
  });

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {/* Beat 1 line */}
      <div style={{ position: 'absolute', top: 300, width: '100%', textAlign: 'center', ...(f < DROP - 20 ? enter(f, 2) : leave(f, DROP - 20)) }}>
        <span style={{ fontSize: 60, fontWeight: 600, color: C.muted, letterSpacing: '-0.02em' }}>You want to learn...</span>
      </div>

      {/* Beat 2 line */}
      <div style={{ position: 'absolute', top: 290, width: '100%', textAlign: 'center', ...enter(f, DROP - 8) }}>
        <span style={{ fontSize: 84, fontWeight: 800, color: C.ink, letterSpacing: '-0.04em' }}>
          But your day has <Em>2 hours.</Em>
        </span>
      </div>

      {/* The day bar */}
      <div
        style={{
          position: 'absolute',
          left: BAR_X - 10,
          top: BAR_Y + (BAR_H - 0) - BAR_H - 10,
          width: BAR_W + 20,
          height: BAR_H + 20,
          borderRadius: 30,
          background: alpha(C.surface, 0.9),
          border: `2px solid ${fitGlow > 0 ? alpha(C.green, 0.25 + fitGlow * 0.45) : C.lineStrong}`,
          boxShadow: `0 30px 80px -30px rgba(0,8,20,0.9), 0 0 ${60 * fitGlow}px ${alpha(C.green, 0.35 * fitGlow)}`,
          opacity: barIn,
          transform: `scale(${lerp(0.94, 1, barIn)})`,
        }}
      />
      {slots.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: s.x,
            top: BAR_Y + 8,
            width: s.w,
            height: BAR_H - 16,
            borderRadius: 18,
            border: `2px dashed ${C.lineStrong}`,
            opacity: barIn * (1 - prog(f, DROP + 10 + i * 6, 20)),
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: BAR_X,
          width: BAR_W,
          top: BAR_Y - 56,
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: MONO,
          fontSize: 24,
          color: C.subtle,
          opacity: barIn,
        }}
      >
        <span>TODAY</span>
        <span>120 min</span>
      </div>

      {/* Goals: pills in a row, then dropped into their slot. */}
      {GOALS.map((g, i) => {
        const x0 = rowX;
        rowX += g.w + GAP;
        const inT = pop(f, 14 + i * 9);
        const t = pop(f, DROP + i * 8, 15, 110);
        const slot = slots[g.slot];
        const x = lerp(x0, slot.x, t);
        const w = lerp(g.w, slot.w, t);
        const hop = Math.sin(Math.min(t, 1) * Math.PI) * -110;
        const y = lerp(ROW_Y - PILL_H / 2, BAR_Y + 8, t) + hop;
        const h = lerp(PILL_H, BAR_H - 16, t);
        const bob = Math.sin((f + i * 20) / 14) * 5 * (1 - Math.min(t, 1));
        const minutes = prog(f, DROP + i * 8 + 16, 14);
        return (
          <div
            key={g.label}
            style={{
              position: 'absolute',
              left: x,
              top: y + bob,
              width: w,
              height: h,
              borderRadius: lerp(PILL_H / 2, 18, t),
              background: t > 0.02 ? `linear-gradient(180deg, ${alpha(g.color, 0.34)}, ${alpha(g.color, 0.2)})` : alpha(g.color, 0.14),
              border: `2px solid ${alpha(g.color, lerp(0.45, 0.75, t))}`,
              boxShadow: `0 14px 40px -16px ${alpha(g.color, 0.6)}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${inT})`,
              opacity: Math.min(1, inT * 1.4),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 16, height: 16, borderRadius: 99, background: g.color, boxShadow: `0 0 16px ${g.color}` }} />
              <span style={{ fontSize: lerp(46, 38, t), fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>{g.label}</span>
            </div>
            <div style={{ height: minutes * 40, overflow: 'hidden', opacity: minutes, fontFamily: MONO, fontSize: 26, color: g.color, marginTop: 4 }}>
              {SLOT_MIN[g.slot]} min
            </div>
          </div>
        );
      })}

      {/* Payoff */}
      <div style={{ position: 'absolute', top: 830, width: '100%', display: 'flex', justifyContent: 'center', ...enter(f, FIT) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 52, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: 99,
              background: C.green,
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 0 40px ${alpha(C.green, 0.6)}`,
            }}
          >
            <Icon name="check" size={34} color={C.bg} stroke={3.4} draw={prog(f, FIT + 6, 14)} />
          </div>
          Wird makes it fit.
        </div>
      </div>
    </AbsoluteFill>
  );
};
