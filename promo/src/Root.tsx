import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { Background } from './components/Background';
import { FontGate } from './components/Fonts';
import { Promo } from './Promo';
import { FPS, H, W } from './theme';
import { SceneDef, SCENES, TOTAL } from './timeline';

/** One scene with the shared background, for tweaking it alone in the Studio. */
const solo = (s: SceneDef): React.FC => {
  const Solo: React.FC = () => (
    <FontGate>
      <AbsoluteFill>
        <Background keys={[0, 1]} glowA={[s.glow[0], s.glow[0]]} glowB={[s.glow[1], s.glow[1]]} />
        <s.component />
      </AbsoluteFill>
    </FontGate>
  );
  return Solo;
};

export const Root: React.FC = () => (
  <>
    <Composition id="WirdPromo" component={Promo} durationInFrames={TOTAL} fps={FPS} width={W} height={H} />
    {SCENES.map((s) => (
      <Composition key={s.id} id={`scene-${s.id}`} component={solo(s)} durationInFrames={s.dur} fps={FPS} width={W} height={H} />
    ))}
  </>
);
