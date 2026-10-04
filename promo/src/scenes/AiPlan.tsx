import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { countUp, enter, lerp, pop, prog } from '../anim';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Chip, Em, Headline } from '../components/Text';
import { alpha, C, FONT, MONO } from '../theme';

// You -> any AI -> plan.json -> Wird. Three cards, two arrows.

const ASK = 'I want German A1, Python for data science and drawing. About 2 hours a day.';
const TYPE_AT = 16;
const TYPE_CPF = 1.6; // characters per frame
const TYPE_END = TYPE_AT + Math.ceil(ASK.length / TYPE_CPF);
const ARROW1 = TYPE_END + 2;
const JSON_AT = ARROW1 + 10;
const ARROW2 = JSON_AT + 34;
const WIRD_AT = ARROW2 + 8;
const PRESS = WIRD_AT + 30;

const CARD_Y = 330;
const CARD_H = 470;

const card = (x: number, w: number, extra?: React.CSSProperties): React.CSSProperties => ({
  position: 'absolute',
  left: x,
  top: CARD_Y,
  width: w,
  height: CARD_H,
  borderRadius: 28,
  background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
  border: `1.5px solid ${C.lineStrong}`,
  boxShadow: '0 40px 80px -40px rgba(0,8,20,0.95)',
  padding: 36,
  boxSizing: 'border-box',
  ...extra,
});

type Tok = [string, string];
const JSON_LINES: Tok[][] = [
  [['{', C.muted]],
  [['  "tracks"', C.blue], [': [', C.muted]],
  [['    { ', C.muted], ['"id"', C.blue], [': ', C.muted], ['"german"', C.amberInk], [' },', C.muted]],
  [['    { ', C.muted], ['"id"', C.blue], [': ', C.muted], ['"python"', C.amberInk], [' },', C.muted]],
  [['    { ', C.muted], ['"id"', C.blue], [': ', C.muted], ['"drawing"', C.amberInk], [' }', C.muted]],
  [['  ],', C.muted]],
  [['  "modules"', C.blue], [': [ ... ]', C.muted]],
  [['}', C.muted]],
];

const Arrow: React.FC<{ x: number; at: number }> = ({ x, at }) => {
  const f = useCurrentFrame();
  const t = prog(f, at, 14);
  return (
    <div style={{ position: 'absolute', left: x, top: CARD_Y + CARD_H / 2 - 24, width: 70, height: 48, opacity: t }}>
      <div style={{ transform: `translateX(${(1 - t) * -20}px)` }}>
        <Icon name="arrow" size={56} color={C.green} stroke={2.6} draw={t} />
      </div>
    </div>
  );
};

export const AiPlan: React.FC = () => {
  const f = useCurrentFrame();
  const typed = ASK.slice(0, Math.max(0, Math.floor((f - TYPE_AT) * TYPE_CPF)));
  const caret = f < TYPE_END + 6 && Math.floor(f / 8) % 2 === 0;
  const press = pop(f, PRESS, 10, 200);
  const done = prog(f, PRESS + 4, 12);

  return (
    <AbsoluteFill style={{ fontFamily: FONT }}>
      <Headline
        title={<>Tell <Em>any AI</Em> what you want to learn.</>}
        sub="It writes your plan. Wird imports it in one click."
      />

      {/* 1. You */}
      <div style={{ ...card(150, 520), ...enter(f, 6) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: C.muted, fontSize: 24, fontWeight: 600 }}>
          <div style={{ width: 44, height: 44, borderRadius: 99, background: alpha(C.blue, 0.2), border: `1.5px solid ${alpha(C.blue, 0.5)}` }} />
          You
        </div>
        <div
          style={{
            marginTop: 28,
            padding: '26px 28px',
            borderRadius: '24px 24px 24px 6px',
            background: alpha(C.blue, 0.13),
            border: `1.5px solid ${alpha(C.blue, 0.3)}`,
            fontSize: 34,
            lineHeight: 1.4,
            fontWeight: 500,
            color: C.ink,
            minHeight: 240,
          }}
        >
          {typed}
          <span style={{ opacity: caret ? 1 : 0, color: C.blue }}>|</span>
        </div>
      </div>

      <Arrow x={690} at={ARROW1} />

      {/* 2. plan.json from the AI */}
      <div style={{ ...card(780, 470), ...enter(f, JSON_AT - 6) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: MONO, fontSize: 26, color: C.ink }}>
            <Icon name="file" size={28} color={C.muted} />
            plan.json
          </div>
          <Chip color={C.violet} size={20}>
            <Icon name="sparkles" size={18} color={C.violet} />
            Any AI
          </Chip>
        </div>
        <div style={{ marginTop: 30, fontFamily: MONO, fontSize: 21, lineHeight: 1.75, whiteSpace: 'pre' }}>
          {JSON_LINES.map((line, i) => {
            const t = prog(f, JSON_AT + i * 3, 10);
            return (
              <div key={i} style={{ opacity: t, transform: `translateX(${(1 - t) * 12}px)` }}>
                {line.map(([s, c], j) => (
                  <span key={j} style={{ color: c }}>{s}</span>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <Arrow x={1270} at={ARROW2} />

      {/* 3. Wird imports it */}
      <div
        style={{
          ...card(1360, 410),
          ...enter(f, WIRD_AT - 4),
          border: `1.5px solid ${done > 0 ? alpha(C.green, 0.25 + 0.4 * done) : C.lineStrong}`,
          boxShadow: `0 40px 80px -40px rgba(0,8,20,0.95), 0 0 ${70 * done}px ${alpha(C.green, 0.3 * done)}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 700, color: C.ink }}>
          <Logo size={44} id="ai-logo" />
          Import a plan
        </div>
        <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 18, fontSize: 28, color: C.muted }}>
          {[
            ['tracks', countUp(f, WIRD_AT + 4, 18, 0, 3)],
            ['modules', countUp(f, WIRD_AT + 6, 22, 0, 24)],
            ['weekly plan', 'ready'],
          ].map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}`, paddingBottom: 14, ...enter(f, WIRD_AT + i * 4, 14, 12) }}>
              <span>{k}</span>
              <span style={{ fontFamily: MONO, color: C.ink, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40, ...enter(f, WIRD_AT + 12, 14, 12) }}>
        <div
          style={{
            height: 70,
            borderRadius: 999,
            background: C.green,
            color: C.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 28,
            fontWeight: 700,
            transform: `scale(${f < PRESS ? 1 : lerp(0.92, 1, press)})`,
            boxShadow: `0 12px 34px -10px ${alpha(C.green, 0.6)}`,
          }}
        >
          {done > 0.5 ? (
            <>
              <Icon name="check" size={30} color={C.bg} stroke={3.2} draw={prog(f, PRESS + 8, 10)} /> Imported
            </>
          ) : (
            'Import plan'
          )}
        </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
