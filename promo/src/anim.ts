import { Easing, interpolate, spring } from 'remotion';
import { FPS } from './theme';

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0..1 progress of a tween that starts at `start` and lasts `dur` frames. */
export function prog(frame: number, start: number, dur: number, easing = easeOut): number {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });
}

/** A gentle spring that settles in about 20 frames. */
export function pop(frame: number, start: number, damping = 13, stiffness = 140): number {
  return spring({ frame: frame - start, fps: FPS, config: { damping, stiffness, mass: 0.9 } });
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fade + rise + unblur for text and cards entering the frame. */
export function enter(frame: number, start: number, dur = 18, rise = 28) {
  const t = prog(frame, start, dur);
  return {
    opacity: t,
    transform: `translateY(${(1 - t) * rise}px)`,
    filter: t < 1 ? `blur(${(1 - t) * 8}px)` : undefined,
  } as const;
}

/** The mirror of enter(): fade, lift and blur away. */
export function leave(frame: number, start: number, dur = 14, lift = 24) {
  const t = prog(frame, start, dur, easeInOut);
  return {
    opacity: 1 - t,
    transform: `translateY(${-t * lift}px)`,
    filter: t > 0 ? `blur(${t * 8}px)` : undefined,
  } as const;
}

/** Count up an integer from a to b over [start, start + dur]. */
export function countUp(frame: number, start: number, dur: number, a: number, b: number): number {
  return Math.round(lerp(a, b, prog(frame, start, dur, easeInOut)));
}
