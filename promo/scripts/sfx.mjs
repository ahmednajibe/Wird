// Synthesize the promo's sound effects into public/sfx/*.wav.
// Usage: node scripts/sfx.mjs   (runs automatically before render and studio)
//
// Everything is made here from seeded noise and short transients: no samples,
// no downloads, no licenses to track, byte-identical on every run. Nothing is
// musical: no notes, no chords, no rhythm. Longer sounds are pure filtered
// noise (air), and the only pitched parts are transients under 0.2 s whose
// pitch sweeps (a click, a bloop, a soft thump), so no note is heard.
// Every file starts and ends at zero with short fades, so cuts never click.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 48000;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');

// ---------------------------------------------------------------- building blocks

/** Seeded PRNG (mulberry32), so every run writes the same bytes. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const buf = (sec) => new Float64Array(Math.round(sec * RATE));

function white(n, seed) {
  const r = rng(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Pink-ish noise (Paul Kellet's economy filter): softer and airier than white. */
function pink(n, seed) {
  const w = white(n, seed);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    b0 = 0.99765 * b0 + w[i] * 0.099046;
    b1 = 0.963 * b1 + w[i] * 0.2965164;
    b2 = 0.57 * b2 + w[i] * 1.0526913;
    w[i] = (b0 + b1 + b2 + w[i] * 0.1848) * 0.25;
  }
  return w;
}

/**
 * RBJ biquad, run in place. `freq` is a number or a function of time (s), so
 * filters can sweep. Coefficients are refreshed every 16 samples.
 */
function biquad(x, type, freq, q = 0.707) {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const fAt = typeof freq === 'function' ? freq : () => freq;
  for (let i = 0; i < x.length; i++) {
    if (i % 16 === 0) {
      const f = Math.min(Math.max(fAt(i / RATE), 20), RATE * 0.45);
      const w0 = (2 * Math.PI * f) / RATE;
      const cos = Math.cos(w0);
      const alpha = Math.sin(w0) / (2 * q);
      const a0 = 1 + alpha;
      if (type === 'lowpass') {
        b0 = (1 - cos) / 2 / a0; b1 = (1 - cos) / a0; b2 = b0;
      } else if (type === 'highpass') {
        b0 = (1 + cos) / 2 / a0; b1 = -(1 + cos) / a0; b2 = b0;
      } else {
        // band-pass, constant 0 dB peak gain
        b0 = alpha / a0; b1 = 0; b2 = -alpha / a0;
      }
      a1 = (-2 * cos) / a0;
      a2 = (1 - alpha) / a0;
    }
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Multiply by an envelope given as a function of time (s). */
function shape(x, env) {
  for (let i = 0; i < x.length; i++) x[i] *= env(i / RATE);
  return x;
}

/** Exponential sweep from a to b over `dur` seconds, then holds b. */
const sweep = (a, b, dur) => (t) => a * Math.pow(b / a, Math.min(t / dur, 1));

/** Smooth 0..1 over [t0, t1]. */
const smooth = (t, t0, t1) => {
  const u = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
  return u * u * (3 - 2 * u);
};

/** A pitch-swept sine burst: the body of clicks, pops and thumps. */
function chirp(sec, f0, f1, sweepSec, decaySec) {
  const x = buf(sec);
  const f = sweep(f0, f1, sweepSec);
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / RATE;
    ph += (2 * Math.PI * f(t)) / RATE;
    x[i] = Math.sin(ph) * Math.exp(-t / decaySec);
  }
  return x;
}

/** Sum b into a starting at `at` seconds, scaled by `gain`. */
function mixInto(a, b, at = 0, gain = 1) {
  const o = Math.round(at * RATE);
  for (let i = 0; i < b.length && o + i < a.length; i++) a[o + i] += b[i] * gain;
  return a;
}

/** Short tiny noise grain, for textures. */
function grain(r, lenMs, center, q) {
  const n = Math.round((lenMs / 1000) * RATE);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  biquad(x, 'bandpass', center, q);
  // Hann window: grains have no edges of their own.
  for (let i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return x;
}

/** Fade the edges to exact zero and normalize to a peak in dBFS. */
function finish(chs, peakDb, fadeInMs = 3, fadeOutMs = 12) {
  const fi = Math.max(1, Math.round((fadeInMs / 1000) * RATE));
  const fo = Math.max(1, Math.round((fadeOutMs / 1000) * RATE));
  let peak = 0;
  for (const x of chs) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      if (i < fi) x[i] *= i / fi;
      if (i >= n - fo) x[i] *= (n - 1 - i) / fo;
      peak = Math.max(peak, Math.abs(x[i]));
    }
  }
  const g = Math.pow(10, peakDb / 20) / (peak || 1);
  for (const x of chs) for (let i = 0; i < x.length; i++) x[i] *= g;
  return chs;
}

/** Constant-power pan of a mono signal; `pan` is -1..1 or a function of time. */
function panned(x, pan) {
  const p = typeof pan === 'function' ? pan : () => pan;
  const l = new Float64Array(x.length);
  const r = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const a = ((p(i / RATE) + 1) * Math.PI) / 4;
    l[i] = x[i] * Math.cos(a) * Math.SQRT2;
    r[i] = x[i] * Math.sin(a) * Math.SQRT2;
  }
  return [l, r];
}

function writeWav(file, chs) {
  const n = chs[0].length;
  const ch = chs.length;
  const data = Buffer.alloc(n * ch * 2);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chs[c][i]));
      data.writeInt16LE(Math.round(v * 32767), (i * ch + c) * 2);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * ch * 2, 28);
  h.writeUInt16LE(ch * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([h, data]));
}

/** Remotion's easeOut, Easing.bezier(0.16, 1, 0.3, 1), as in src/anim.ts. */
function easeOut(x) {
  const [x1, y1, x2, y2] = [0.16, 1, 0.3, 1];
  const bez = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, x1, x2) < x) lo = mid;
    else hi = mid;
  }
  return bez((lo + hi) / 2, y1, y2);
}

// ---------------------------------------------------------------- the sounds

const SOUNDS = {
  /** Scene transition: band-passed air sweeping up and settling, drifting left to right. */
  whoosh(seed = 11) {
    const sec = 0.9;
    const peak = 0.52;
    const x = pink(buf(sec).length, seed);
    biquad(x, 'bandpass', (t) => (t < peak ? 260 * Math.pow(2400 / 260, t / peak) : 2400 * Math.pow(700 / 2400, (t - peak) / (sec - peak))), 0.9);
    biquad(x, 'lowpass', 5200);
    shape(x, (t) => (t < peak ? Math.pow(t / peak, 2.2) : Math.exp(-(t - peak) / 0.11)));
    return finish(panned(x, (t) => -0.35 + 0.7 * (t / sec)), -12, 5, 40);
  },

  /** Small, brighter swish: arrows, the rolled session, the language flip. */
  swish() {
    const sec = 0.42;
    const peak = 0.2;
    const x = white(buf(sec).length, 23);
    biquad(x, 'bandpass', (t) => 900 * Math.pow(4200 / 900, Math.min(t / peak, 1)), 1.4);
    biquad(x, 'lowpass', 7000);
    shape(x, (t) => (t < peak ? Math.pow(t / peak, 1.6) : Math.exp(-(t - peak) / 0.05)));
    return finish(panned(x, (t) => -0.25 + 0.5 * (t / sec)), -12, 4, 25);
  },

  /** A dry check-off click: a noise transient through a short woody resonance. */
  tick() {
    const sec = 0.07;
    const r = rng(31);
    const x = buf(sec);
    for (let i = 0; i < 90; i++) x[i] = (r() * 2 - 1) * (1 - i / 90);
    const body = Float64Array.from(x);
    biquad(body, 'bandpass', 1900, 7);
    biquad(x, 'highpass', 3500);
    const out = buf(sec);
    mixInto(out, x, 0, 0.55);
    mixInto(out, body, 0, 2.2);
    shape(out, (t) => Math.exp(-t / 0.018));
    return finish([out], -6, 0.5, 15);
  },

  /** A soft bloop as points land in the ring: a fast downward pitch drop. */
  pop() {
    const sec = 0.12;
    const x = chirp(sec, 820, 240, 0.045, 0.03);
    const r = rng(41);
    for (let i = 0; i < 60; i++) x[i] += (r() * 2 - 1) * 0.25 * (1 - i / 60);
    biquad(x, 'lowpass', 4000);
    return finish([x], -6, 0.5, 20);
  },

  /** A soft, low landing: pills dropping into the day bar, a session landing. */
  thud() {
    const sec = 0.24;
    const x = chirp(sec, 150, 58, 0.08, 0.06);
    const n = pink(buf(sec).length, 53);
    biquad(n, 'lowpass', 900);
    shape(n, (t) => Math.exp(-t / 0.012));
    mixInto(x, n, 0, 0.9);
    return finish([x], -6, 1, 40);
  },

  /** The title: air rising while the logo writes itself. */
  rise() {
    const sec = 1.5;
    const top = 1.1;
    const ch = [pink(buf(sec).length, 61), pink(buf(sec).length, 62)];
    for (const x of ch) {
      biquad(x, 'lowpass', (t) => 180 * Math.pow(3200 / 180, Math.min(t / top, 1)), 0.9);
      shape(x, (t) => (t < top ? Math.pow(t / top, 2) : Math.exp(-(t - top) / 0.12)));
    }
    return finish(ch, -12, 10, 60);
  },

  /**
   * The week filling: a short riffle of light taps, one per session block.
   * Week.tsx drops its 26 blocks 1.6 frames apart from FILL.
   */
  riffle() {
    const r = rng(71);
    const blocks = 26;
    const step = 1.6 / 30;
    const sec = blocks * step + 0.15;
    const l = buf(sec);
    const rr = buf(sec);
    for (let i = 0; i < blocks; i++) {
      const g = grain(r, 9, 900 + r() * 1300, 3);
      const at = i * step + 0.12 + (r() - 0.5) * 0.008; // blocks land ~4 frames after they start
      const pan = -0.6 + (1.2 * (i % 7)) / 6;
      const amp = 0.6 + r() * 0.4;
      mixInto(l, g, at, amp * Math.cos(((pan + 1) * Math.PI) / 4));
      mixInto(rr, g, at, amp * Math.sin(((pan + 1) * Math.PI) / 4));
    }
    return finish([l, rr], -6, 2, 30);
  },

  /**
   * The year heatmap filling: one tiny grain per day cell, timed like
   * Streak.tsx (sweep = easeOut(prog over SWEEP_DUR frames) * (WEEKS + 2),
   * cell (w, d) lights when sweep passes w + d * 0.12), panned by its week.
   */
  rain() {
    const WEEKS = 52;
    const DUR = 80 / 30;
    const r = rng(83);
    // Invert the eased sweep numerically: when does it reach `s`?
    const when = (s) => {
      let lo = 0, hi = DUR;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (easeOut(mid / DUR) * (WEEKS + 2) < s) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const sec = when(WEEKS + 0.8) + 0.2;
    const l = buf(sec);
    const rr = buf(sec);
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const at = when(w + d * 0.12) + r() * 0.004;
        const g = grain(r, 3 + r() * 3, 2600 + r() * 4200, 2.5);
        const pan = -0.8 + (1.6 * w) / (WEEKS - 1);
        const amp = 0.35 + r() * 0.65;
        mixInto(l, g, at, amp * Math.cos(((pan + 1) * Math.PI) / 4));
        mixInto(rr, g, at, amp * Math.sin(((pan + 1) * Math.PI) / 4));
      }
    }
    // The opening burst is dense; keep it from outweighing the sparse tail.
    const env = (t) => 0.35 + 0.65 * smooth(t, 0, 0.5);
    shape(l, env);
    shape(rr, env);
    return finish([l, rr], -9, 5, 60);
  },

  /** "Streak secured": a short, airy scatter of high grains with the confetti. */
  sparkle() {
    const sec = 1.1;
    const r = rng(97);
    const l = buf(sec);
    const rr = buf(sec);
    for (let i = 0; i < 46; i++) {
      const at = Math.pow(r(), 1.8) * 0.85;
      const g = grain(r, 4 + r() * 4, 5000 + r() * 4000, 3);
      const pan = r() * 1.6 - 0.8;
      const amp = (0.4 + r() * 0.6) * Math.exp(-at / 0.5);
      mixInto(l, g, at, amp * Math.cos(((pan + 1) * Math.PI) / 4));
      mixInto(rr, g, at, amp * Math.sin(((pan + 1) * Math.PI) / 4));
    }
    const air = [pink(buf(sec).length, 98), pink(buf(sec).length, 99)];
    for (const x of air) {
      biquad(x, 'highpass', 3000);
      shape(x, (t) => smooth(t, 0, 0.08) * Math.exp(-t / 0.3));
    }
    mixInto(l, air[0], 0, 0.5);
    mixInto(rr, air[1], 0, 0.5);
    return finish([l, rr], -9, 3, 80);
  },

  /** The sign-off: a soft low landing, then a long calm exhale of air settling down. */
  resolve() {
    const sec = 3.3;
    const ch = [pink(buf(sec).length, 101), pink(buf(sec).length, 102)];
    for (const x of ch) {
      biquad(x, 'lowpass', sweep(2200, 260, 2.4), 0.8);
      shape(x, (t) => smooth(t, 0, 0.35) * Math.exp(-Math.max(0, t - 0.35) / 0.9));
    }
    const land = chirp(0.5, 120, 46, 0.25, 0.14);
    mixInto(ch[0], land, 0, 0.8);
    mixInto(ch[1], land, 0, 0.8);
    return finish(ch, -9, 4, 400);
  },
};

fs.mkdirSync(OUT, { recursive: true });
const files = [
  ['whoosh-a.wav', SOUNDS.whoosh(11)],
  ['whoosh-b.wav', SOUNDS.whoosh(12)],
  ...Object.entries(SOUNDS)
    .filter(([k]) => k !== 'whoosh')
    .map(([k, fn]) => [`${k}.wav`, fn()]),
];
for (const [file, chs] of files) {
  writeWav(file, chs);
  console.log(`public/sfx/${file}  ${(chs[0].length / RATE).toFixed(2)} s`);
}
