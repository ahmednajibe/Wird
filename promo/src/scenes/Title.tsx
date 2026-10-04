import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { easeInOut, enter, lerp, pop, prog } from '../anim';
import { Logo } from '../components/Logo';
import { alpha, AMIRI, C, FONT } from '../theme';

// The ribbon-W writes itself, the name lands, and the word gets its meaning.

export const DRAW = 6; // the logo starts writing itself

export const Title: React.FC = () => {
  const f = useCurrentFrame();
  const tile = pop(f, 0, 14, 120);
  const draw = prog(f, DRAW, 34, easeInOut);
  const word = prog(f, 30, 22);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 190, transform: `scale(${lerp(0.7, 1, tile)})`, opacity: Math.min(1, tile * 1.5) }}>
        <Logo size={250} draw={draw} id="title" glow={prog(f, 34, 30)} />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 478,
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          color: C.ink,
          clipPath: `inset(0 ${(1 - word) * 100}% 0 0)`,
          transform: `translateX(${(1 - word) * -30}px)`,
        }}
      >
        Wird
      </div>
      <div style={{ position: 'absolute', top: 690, display: 'flex', alignItems: 'center', gap: 22, ...enter(f, 50) }}>
        <span style={{ fontFamily: AMIRI, fontSize: 64, color: C.amberInk, textShadow: `0 0 30px ${alpha(C.amber, 0.4)}` }}>وِرد</span>
        <span style={{ fontSize: 40, fontWeight: 500, color: C.muted, letterSpacing: '-0.01em' }}>
          <i style={{ color: C.subtle }}>n.</i> a daily portion, kept every day.
        </span>
      </div>
      <div style={{ position: 'absolute', top: 800, fontSize: 30, fontWeight: 600, color: C.subtle, letterSpacing: '0.02em', ...enter(f, 62) }}>
        A daily learning planner, with optional Quran memorization.
      </div>
    </AbsoluteFill>
  );
};
