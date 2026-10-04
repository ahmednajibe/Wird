import React from 'react';
import { C } from '../theme';

// The Wird ribbon-W from assets/brand/wird.svg, drawn stroke by stroke:
// the cream ribbon first, then the gold one, like writing the W in one go.
export const Logo: React.FC<{ size: number; draw?: number; id: string; glow?: number }> = ({
  size,
  draw = 1,
  id,
  glow = 0,
}) => {
  const a = Math.min(1, draw / 0.55);
  const b = Math.max(0, (draw - 0.45) / 0.55);
  const stroke = (t: number) => ({
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1 - t,
    opacity: t > 0.001 ? 1 : 0,
  });
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`${id}-cream`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#FBF6E4" />
          <stop offset="1" stopColor="#E9DCAC" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#F0D77E" />
          <stop offset="1" stopColor="#D9AE3C" />
        </linearGradient>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.surface2} />
          <stop offset="1" stopColor={C.surface} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>
      {glow > 0 && (
        <rect x="40" y="60" width="432" height="432" rx="112" fill="#D9AE3C" opacity={0.35 * glow}
          filter={`url(#${id}-glow)`} />
      )}
      <rect width="512" height="512" rx="112" fill={`url(#${id}-tile)`} />
      <rect x="1.5" y="1.5" width="509" height="509" rx="110.5" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      {/* Same z-order as the brand file: the cream ribbon sits on top. */}
      <path d="M256 220 L296 356 L372 158" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="76"
        strokeLinecap="round" strokeLinejoin="round" {...stroke(b)} />
      <path d="M140 160 L216 356 L256 220" fill="none" stroke={`url(#${id}-cream)`} strokeWidth="76"
        strokeLinecap="round" strokeLinejoin="round" {...stroke(a)} />
    </svg>
  );
};
