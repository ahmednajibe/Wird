import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { Background } from './components/Background';
import { FontGate } from './components/Fonts';
import { Icon } from './components/Icon';
import { Logo } from './components/Logo';
import { alpha, AMIRI, C, FONT, MONO } from './theme';

// The video's cover image (npm run thumbnail). It has to read at thumbnail
// size, so: the brand on the left, and on the right the film's two ideas in
// one card: goals fitted into a 2-hour day, and the streak that follows.

const SEGMENTS = [
  { label: 'Quran', color: C.amber, min: 20 },
  { label: 'German', color: C.blue, min: 40 },
  { label: 'Python', color: C.violet, min: 20 },
  { label: 'Drawing', color: C.coral, min: 40 },
];

const WEEKS = 20;

export const Thumbnail: React.FC = () => (
  <FontGate>
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Background keys={[0, 1]} glowA={[C.violet, C.violet]} glowB={[C.green, C.green]} />

      {/* brand */}
      <div style={{ position: 'absolute', left: 130, top: 0, bottom: 0, width: 820, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
          <Logo size={190} id="thumb" glow={1} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 190, fontWeight: 800, color: C.ink, letterSpacing: '-0.05em', lineHeight: 0.9 }}>Wird</span>
            <span style={{ fontFamily: AMIRI, fontSize: 64, color: C.amberInk, lineHeight: 1.3, textShadow: `0 0 30px ${alpha(C.amber, 0.4)}` }}>وِرد</span>
          </div>
        </div>
        <div style={{ marginTop: 56, fontSize: 92, fontWeight: 800, color: C.greenInk, letterSpacing: '-0.04em', lineHeight: 1.02 }}>
          A little,
          <br />
          every day.
        </div>
        <div style={{ marginTop: 34, fontSize: 38, fontWeight: 500, color: C.muted, letterSpacing: '-0.01em', lineHeight: 1.35 }}>
          A daily learning planner that fits your goals into the time you have.
        </div>
      </div>

      {/* the card */}
      <div
        style={{
          position: 'absolute',
          left: 1040,
          top: 140,
          width: 760,
          boxSizing: 'border-box',
          padding: 48,
          borderRadius: 40,
          background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
          border: `2px solid ${alpha(C.green, 0.35)}`,
          boxShadow: `0 50px 100px -40px rgba(0,8,20,0.95), 0 0 90px -10px ${alpha(C.green, 0.22)}`,
          transform: 'rotate(-2deg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 30, fontWeight: 600, color: C.subtle }}>
          <span>TODAY</span>
          <span>120 min</span>
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 10, height: 150 }}>
          {SEGMENTS.map((s) => (
            <div
              key={s.label}
              style={{
                flex: s.min,
                borderRadius: 20,
                background: `linear-gradient(180deg, ${alpha(s.color, 0.42)}, ${alpha(s.color, 0.24)})`,
                border: `2px solid ${alpha(s.color, 0.8)}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: s.min > 20 ? 32 : 23, fontWeight: 700, color: C.ink }}>{s.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 24, color: s.color }}>{s.min}m</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 18, fontSize: 40, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>
          <div style={{ width: 56, height: 56, borderRadius: 99, background: C.green, display: 'grid', placeItems: 'center', boxShadow: `0 0 34px ${alpha(C.green, 0.6)}` }}>
            <Icon name="check" size={34} color={C.bg} stroke={3.4} />
          </div>
          It all fits.
        </div>

        <div style={{ marginTop: 44, height: 2, background: C.line }} />

        <div style={{ marginTop: 38, display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: C.green, display: 'grid', placeItems: 'center', boxShadow: `0 0 40px ${alpha(C.green, 0.55)}` }}>
            <Icon name="flame" size={38} color={C.bg} fill={C.bg} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: 64, fontWeight: 700, color: C.ink, lineHeight: 1 }}>128</span>
          <span style={{ fontSize: 36, color: C.muted }}>day streak</span>
        </div>
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: `repeat(${WEEKS}, 1fr)`, gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 1fr)', gap: 6 }}>
          {Array.from({ length: WEEKS * 7 }, (_, i) => {
            const r = random(`thumb-${i}`);
            const rest = i % 7 === 5 && r < 0.4;
            return (
              <div
                key={i}
                style={{
                  aspectRatio: '1',
                  borderRadius: 5,
                  boxSizing: 'border-box',
                  background: rest ? 'transparent' : r < 0.3 ? C.green : alpha(C.green, 0.5),
                  border: rest ? `1.5px dashed ${alpha(C.slate, 0.5)}` : 'none',
                  boxShadow: !rest && r < 0.3 ? `0 0 8px ${alpha(C.green, 0.45)}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  </FontGate>
);
