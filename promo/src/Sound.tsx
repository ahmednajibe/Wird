import React from 'react';
import { Html5Audio, Sequence, staticFile } from 'remotion';
import { pop } from './anim';
import { ARROW1, ARROW2, PRESS } from './scenes/AiPlan';
import { DROP, FIT, GOALS } from './scenes/Goals';
import { FLIP } from './scenes/Local';
import { SHOW_QUOTE, SIGN } from './scenes/Outro';
import { SWEEP_AT } from './scenes/Streak';
import { DRAW } from './scenes/Title';
import { FLY, SECURED, TASKS } from './scenes/Today';
import { FILL, ROLL } from './scenes/Week';
import { SCENES, STARTS } from './timeline';

// The sound layer: quiet, non-musical effects on the scene beats. The film
// must work fully muted, so nothing here carries meaning on its own.
// The files are synthesized by scripts/sfx.mjs into public/sfx/ (npm run
// sfx; render and studio run it first).

/** Set to false for a silent render: no audio stream at all. */
export const SOUND = true;

/** Overall level of the layer. Cue volumes below are relative to it. */
const MASTER = 1;

type Sfx = 'whoosh-a' | 'whoosh-b' | 'swish' | 'tick' | 'pop' | 'thud' | 'rise' | 'riffle' | 'rain' | 'sparkle' | 'resolve';
type Cue = { sfx: Sfx; at: number; volume: number };

/** First frame a pop() spring started at `start` reaches 1 (a hop lands). */
function landsAt(start: number, damping: number, stiffness: number): number {
  let f = start;
  while (pop(f, start, damping, stiffness) < 1 && f < start + 60) f++;
  return f;
}

// Scene-relative frames, keyed by scene id. Quran and the hadith in the
// outro stay quiet on purpose.
const CUES: Record<string, Cue[]> = {
  goals: [
    ...GOALS.map((_, i) => ({ sfx: 'thud' as const, at: landsAt(DROP + i * 8, 15, 110), volume: 0.32 })),
    { sfx: 'tick', at: FIT + 6, volume: 0.3 },
  ],
  title: [{ sfx: 'rise', at: DRAW, volume: 0.3 }],
  'ai-plan': [
    { sfx: 'swish', at: ARROW1, volume: 0.22 },
    { sfx: 'swish', at: ARROW2, volume: 0.22 },
    { sfx: 'tick', at: PRESS, volume: 0.3 },
    { sfx: 'pop', at: PRESS + 8, volume: 0.25 },
  ],
  week: [
    { sfx: 'riffle', at: FILL, volume: 0.28 },
    { sfx: 'swish', at: ROLL, volume: 0.22 },
    { sfx: 'thud', at: landsAt(ROLL, 15, 90), volume: 0.32 },
  ],
  today: [
    ...TASKS.flatMap((t) => [
      { sfx: 'tick' as const, at: t.at, volume: 0.3 },
      { sfx: 'pop' as const, at: t.at + FLY - 3, volume: 0.25 },
    ]),
    { sfx: 'sparkle', at: SECURED, volume: 0.28 },
  ],
  streak: [{ sfx: 'rain', at: SWEEP_AT, volume: 0.3 }],
  local: [{ sfx: 'swish', at: FLIP, volume: 0.2 }],
  outro: [{ sfx: 'resolve', at: SHOW_QUOTE ? SIGN : 0, volume: 0.42 }],
};

// A whoosh on every cut, peaking in the middle of the cross-fade (the
// outgoing scene fades from 4 frames before the next one starts until 12
// after; the whoosh peaks ~16 frames in).
const WHOOSH_LEAD = 12;

const Play: React.FC<{ cue: Cue; from: number }> = ({ cue, from }) => (
  <Sequence from={from} name={`sfx ${cue.sfx}`} layout="none">
    <Html5Audio src={staticFile(`sfx/${cue.sfx}.wav`)} volume={cue.volume * MASTER} />
  </Sequence>
);

/** All cues of the film, or of one scene when `scene` is set (Studio solo comps). */
export const Sound: React.FC<{ scene?: string }> = ({ scene }) => {
  if (!SOUND) return null;
  if (scene) return <>{(CUES[scene] ?? []).map((c, j) => <Play key={j} cue={c} from={c.at} />)}</>;
  return (
    <>
      {SCENES.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 && <Play cue={{ sfx: i % 2 ? 'whoosh-a' : 'whoosh-b', at: 0, volume: 0.32 }} from={STARTS[i] - WHOOSH_LEAD} />}
          {(CUES[s.id] ?? []).map((c, j) => (
            <Play key={j} cue={c} from={STARTS[i] + c.at} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
};
