import React from 'react';
import { AbsoluteFill, interpolateColors, useCurrentFrame } from 'remotion';
import { alpha, C } from '../theme';

/**
 * The app's navy with two slow, soft glows whose colors drift from scene to
 * scene (keys are absolute frames, see timeline.ts).
 */
export const Background: React.FC<{ keys: number[]; glowA: string[]; glowB: string[] }> = ({ keys, glowA, glowB }) => {
  const f = useCurrentFrame();
  const a = interpolateColors(f, keys, glowA);
  const b = interpolateColors(f, keys, glowB);
  const ax = 22 + Math.sin(f / 90) * 8;
  const ay = 28 + Math.cos(f / 110) * 10;
  const bx = 80 + Math.cos(f / 100) * 8;
  const by = 78 + Math.sin(f / 80) * 8;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at ${ax}% ${ay}%, ${withA(a, 0.2)}, transparent 70%),
            radial-gradient(1000px 800px at ${bx}% ${by}%, ${withA(b, 0.16)}, transparent 70%)`,
        }}
      />
      {/* A faint dot grid, fading out toward the edges. */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${alpha('#ffffff', 0.07)} 1.2px, transparent 1.6px)`,
          backgroundSize: '36px 36px',
          backgroundPosition: `${(f * 0.15) % 36}px 0px`,
          maskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black 10%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 65% at 50% 50%, black 10%, transparent 80%)',
        }}
      />
      <AbsoluteFill
        style={{ background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 55%, rgba(0,6,14,0.55) 100%)' }}
      />
    </AbsoluteFill>
  );
};

/** interpolateColors returns rgba(); swap its alpha. */
function withA(rgba: string, a: number): string {
  const m = rgba.match(/[\d.]+/g);
  if (!m) return rgba;
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}
