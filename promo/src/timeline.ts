import React from 'react';
import { AiPlan } from './scenes/AiPlan';
import { Goals } from './scenes/Goals';
import { Local } from './scenes/Local';
import { Outro } from './scenes/Outro';
import { Quran } from './scenes/Quran';
import { Streak } from './scenes/Streak';
import { Title } from './scenes/Title';
import { Today } from './scenes/Today';
import { Week } from './scenes/Week';
import { C } from './theme';

// The whole film in order. Scenes overlap by OVERLAP frames: the outgoing
// one fades and blurs away while the incoming one builds in. Edit a
// duration here and everything after it shifts.

export const OVERLAP = 12;

export type SceneDef = {
  id: string;
  component: React.FC;
  dur: number;
  /** Background glow colors while this scene plays. */
  glow: [string, string];
};

export const SCENES: SceneDef[] = [
  { id: 'goals', component: Goals, dur: 228, glow: [C.violet, C.blue] },
  { id: 'title', component: Title, dur: 120, glow: [C.violet, C.green] },
  { id: 'ai-plan', component: AiPlan, dur: 190, glow: [C.violet, C.green] },
  { id: 'week', component: Week, dur: 180, glow: [C.blue, C.coral] },
  { id: 'today', component: Today, dur: 180, glow: [C.green, C.teal] },
  { id: 'quran', component: Quran, dur: 156, glow: [C.violet, C.teal] },
  { id: 'streak', component: Streak, dur: 138, glow: [C.green, C.blue] },
  { id: 'local', component: Local, dur: 170, glow: [C.blue, C.violet] },
  { id: 'outro', component: Outro, dur: 200, glow: [C.blue, C.green] },
];

export const STARTS: number[] = [];
{
  let at = 0;
  for (const s of SCENES) {
    STARTS.push(at);
    at += s.dur - OVERLAP;
  }
}

export const TOTAL = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].dur;
