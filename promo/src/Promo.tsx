import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { easeInOut, prog } from './anim';
import { Background } from './components/Background';
import { FontGate } from './components/Fonts';
import { Sound } from './Sound';
import { OVERLAP, SCENES, STARTS } from './timeline';

/** Fades a scene out over the overlap with the next one. */
const Exit: React.FC<{ dur: number; last: boolean; children: React.ReactNode }> = ({ dur, last, children }) => {
  const f = useCurrentFrame();
  if (last) return <AbsoluteFill>{children}</AbsoluteFill>;
  const t = prog(f, dur - OVERLAP - 4, OVERLAP + 4, easeInOut);
  return (
    <AbsoluteFill
      style={{
        opacity: 1 - t,
        transform: `scale(${1 + t * 0.04})`,
        filter: t > 0 ? `blur(${t * 14}px)` : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const Promo: React.FC = () => {
  const keys = STARTS.map((s, i) => s + SCENES[i].dur / 2);
  return (
    <FontGate>
      <AbsoluteFill>
        <Background keys={keys} glowA={SCENES.map((s) => s.glow[0])} glowB={SCENES.map((s) => s.glow[1])} />
        {SCENES.map((s, i) => (
          <Sequence key={s.id} name={s.id} from={STARTS[i]} durationInFrames={s.dur}>
            <Exit dur={s.dur} last={i === SCENES.length - 1}>
              <s.component />
            </Exit>
          </Sequence>
        ))}
        <Sound />
      </AbsoluteFill>
    </FontGate>
  );
};
