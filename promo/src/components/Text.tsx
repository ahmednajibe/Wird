import React from 'react';
import { useCurrentFrame } from 'remotion';
import { enter } from '../anim';
import { alpha, C, FONT, MONO } from '../theme';

/** Scene title + optional subline, centered, entering on `at`. */
export const Headline: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  at?: number;
  top?: number;
  size?: number;
}> = ({ title, sub, at = 4, top = 110, size = 70 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, textAlign: 'center', fontFamily: FONT }}>
      <div style={{ ...enter(f, at), fontSize: size, fontWeight: 800, color: C.ink, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
        {title}
      </div>
      {sub && (
        <div style={{ ...enter(f, at + 8), marginTop: 18, fontSize: 32, fontWeight: 500, color: C.muted, letterSpacing: '-0.01em' }}>
          {sub}
        </div>
      )}
    </div>
  );
};

/** Highlight a word in a headline. */
export const Em: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.green }) => (
  <span style={{ color }}>{children}</span>
);

/** Rounded track chip, like the app's track badges. */
export const Chip: React.FC<{ color: string; children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  color,
  children,
  size = 20,
  style,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.4,
      padding: `${size * 0.22}px ${size * 0.6}px`,
      borderRadius: 999,
      background: alpha(color, 0.12),
      border: `1.5px solid ${alpha(color, 0.4)}`,
      color,
      fontFamily: FONT,
      fontWeight: 600,
      fontSize: size,
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {children}
  </span>
);

export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({
  children,
  color = C.green,
  style,
}) => (
  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color, ...style }}>
    {children}
  </div>
);
