import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { easeInOut, enter, lerp, pop, prog } from '../anim';
import { Icon, IconName } from '../components/Icon';
import { alpha, ARABIC, C, FONT, MONO } from '../theme';

// The real app (screenshots/today-*.png), in a browser window pointed at
// 127.0.0.1. It flips from English to Arabic halfway through.

export const FLIP = 84;
const WIN_X = 120;
const WIN_Y = 170;
const WIN_W = 1000;
const WIN_H = 720;

const POINTS: { icon: IconName; text: React.ReactNode; at: number }[] = [
  { icon: 'shield', text: 'No account. No cloud.', at: 28 },
  { icon: 'laptop', text: 'Your data stays on your machine.', at: 40 },
  {
    icon: 'languages',
    text: (
      <>
        English and <span style={{ fontFamily: ARABIC, fontWeight: 700 }}>العربية</span>
      </>
    ),
    at: FLIP + 4,
  },
];

export const Local: React.FC = () => {
  const f = useCurrentFrame();
  const win = pop(f, 0, 16, 90);
  const flip = prog(f, FLIP, 22, easeInOut);
  const swing = Math.sin(flip * Math.PI);

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      {/* browser window */}
      <div style={{ position: 'absolute', left: WIN_X, top: WIN_Y, width: WIN_W, height: WIN_H, perspective: 2200 }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 26,
            overflow: 'hidden',
            background: C.bg,
            border: `1.5px solid ${C.lineStrong}`,
            boxShadow: `0 60px 120px -40px rgba(0,6,16,0.95), 0 0 120px -20px ${alpha(C.blue, 0.25)}`,
            transform: `rotateY(${lerp(22, 9, win) - swing * 8}deg) rotateX(${lerp(8, 3, win)}deg) translateY(${(1 - win) * 80}px) scale(${lerp(0.9, 1, win)})`,
            transformOrigin: '60% 50%',
            opacity: Math.min(1, win * 1.5),
          }}
        >
          <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', background: C.surface, borderBottom: `1px solid ${C.line}` }}>
            {[C.coral, C.amber, C.green].map((c) => (
              <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: alpha(c, 0.8) }} />
            ))}
            <div
              style={{
                marginLeft: 22,
                flex: 1,
                height: 34,
                borderRadius: 99,
                background: C.bg,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '0 18px',
                fontFamily: MONO,
                fontSize: 19,
                color: C.muted,
              }}
            >
              <Icon name="shield" size={18} color={C.greenInk} />
              <span>
                <span style={{ color: C.greenInk }}>127.0.0.1</span>:4545
              </span>
            </div>
          </div>
          <div style={{ position: 'relative', height: WIN_H - 56 }}>
            <Img src={staticFile('today-desktop.png')} style={shot(1 - flip)} />
            <Img src={staticFile('today-ar-desktop.png')} style={shot(flip)} />
          </div>
        </div>
      </div>

      {/* copy */}
      <div style={{ position: 'absolute', left: 1220, top: 250, width: 640 }}>
        <div style={{ ...enter(f, 12), fontSize: 92, fontWeight: 800, color: C.ink, letterSpacing: '-0.045em', lineHeight: 1 }}>
          Fully <span style={{ color: C.greenInk }}>local.</span>
        </div>
        <div style={{ marginTop: 56, display: 'flex', flexDirection: 'column', gap: 34 }}>
          {POINTS.map((p) => (
            <div key={p.icon} style={{ ...enter(f, p.at, 18, 20), display: 'flex', alignItems: 'center', gap: 22, fontSize: 34, fontWeight: 600, color: C.ink }}>
              <div style={{ width: 62, height: 62, borderRadius: 18, background: alpha(C.green, 0.1), border: `1.5px solid ${alpha(C.green, 0.3)}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={p.icon} size={32} color={C.greenInk} />
              </div>
              <span>{p.text}</span>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

function shot(opacity: number): React.CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'top center',
    opacity,
  };
}
