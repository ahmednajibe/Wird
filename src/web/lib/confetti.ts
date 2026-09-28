import confetti from 'canvas-confetti';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function palette(): string[] {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return [v('--accent', '#03ef62'), v('--amber', '#eccb62'), v('--blue', '#5ea8f2'), v('--violet', '#b39af2'), v('--coral', '#f08b6e')];
}

/** Small burst from an element (task completed). */
export function burstFrom(el: Element | null): void {
  if (prefersReducedMotion()) return;
  let origin = { x: 0.5, y: 0.5 };
  if (el) {
    const r = el.getBoundingClientRect();
    origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  }
  void confetti({
    particleCount: 36,
    spread: 62,
    startVelocity: 26,
    gravity: 1.1,
    ticks: 110,
    scalar: 0.8,
    origin,
    colors: palette(),
    disableForReducedMotion: true,
  });
}

/** Bigger two-sided celebration: today's baseline crossed for the first time. */
export function celebrate(): void {
  if (prefersReducedMotion()) return;
  const colors = palette();
  const end = Date.now() + 900;
  const frame = () => {
    void confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors, disableForReducedMotion: true });
    void confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
  void confetti({ particleCount: 120, spread: 100, startVelocity: 42, origin: { x: 0.5, y: 0.35 }, colors, disableForReducedMotion: true });
}
