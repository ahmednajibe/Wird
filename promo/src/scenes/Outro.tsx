import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { easeInOut, enter, leave, lerp, pop, prog } from '../anim';
import { Logo } from '../components/Logo';
import { alpha, AMIRI, C, FONT, MONO } from '../theme';

// The idea behind the name, then the sign-off. The last frame holds.

export const SIGN = 92;

/** Set to false to skip the hadith and open straight on the logo. */
export const SHOW_QUOTE = true;

export const Outro: React.FC<{ quote?: boolean }> = ({ quote = SHOW_QUOTE }) => {
  const f = useCurrentFrame();
  const sign = quote ? SIGN : 0;
  const tile = pop(f, sign, 14, 120);
  return (
    <AbsoluteFill style={{ fontFamily: FONT, alignItems: 'center' }}>
      {quote && (
        <div style={{ position: 'absolute', top: 330, width: '100%', textAlign: 'center', ...(f < SIGN - 16 ? {} : leave(f, SIGN - 16, 16)) }}>
          <div dir="rtl" style={{ ...enter(f, 4, 26), fontFamily: AMIRI, fontSize: 92, color: C.amberInk, textShadow: `0 0 40px ${alpha(C.amber, 0.35)}`, lineHeight: 1.5 }}>
            أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ
          </div>
          <div style={{ ...enter(f, 22, 22), marginTop: 26, fontSize: 38, fontWeight: 500, color: C.ink, letterSpacing: '-0.01em' }}>
            "The most beloved deeds to God are the most constant, even if small."
          </div>
          <div style={{ ...enter(f, 30, 22), marginTop: 18, fontSize: 24, color: C.subtle }}>Sahih al-Bukhari and Sahih Muslim</div>
        </div>
      )}

      {f >= sign && (
        <>
          <div style={{ position: 'absolute', top: 210, transform: `scale(${lerp(0.7, 1, tile)})`, opacity: Math.min(1, tile * 1.5) }}>
            <Logo size={200} draw={prog(f, sign + 4, 30, easeInOut)} id="outro" glow={prog(f, sign + 24, 30)} />
          </div>
          <div style={{ position: 'absolute', top: 440, fontSize: 128, fontWeight: 800, color: C.ink, letterSpacing: '-0.05em', ...enter(f, sign + 18, 20) }}>
            Wird
          </div>
          <div style={{ position: 'absolute', top: 618, fontSize: 52, fontWeight: 700, color: C.greenInk, letterSpacing: '-0.03em', ...enter(f, sign + 28, 20) }}>
            A little, every day.
          </div>
          <div style={{ position: 'absolute', top: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, ...enter(f, sign + 40, 20) }}>
            <div style={{ display: 'flex', gap: 14 }}>
              {['Windows', 'macOS', 'Linux'].map((os) => (
                <span key={os} style={{ padding: '8px 22px', borderRadius: 99, border: `1.5px solid ${C.lineStrong}`, background: alpha(C.surface, 0.7), fontSize: 26, fontWeight: 600, color: C.muted }}>
                  {os}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 30, color: C.ink, marginTop: 6 }}>
              github.com/<span style={{ color: C.greenInk }}>ahmednajibe/Wird</span>
            </div>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
