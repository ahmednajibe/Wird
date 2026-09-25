/**
 * Settings: defaults in code, persisted as JSON, validated with zod.
 */
import { z } from 'zod';

const trackSchema = z.enum(['fsd', 'ai', 'animation']);
const streamSchema = z.enum(['main', 'draw', 'story']);

export const templateSlotSchema = z
  .object({
    track: trackSchema,
    stream: streamSchema,
    role: z.enum(['warmup', 'focus']),
    /**
     * fixed: `minutes` (or `fastingMinutes` on fasting days) off the top.
     * share: fraction `share` of the minutes left after fixed slots.
     * rest: whatever is left.
     */
    kind: z.enum(['fixed', 'share', 'rest']),
    minutes: z.number().int().min(0).max(600).optional(),
    fastingMinutes: z.number().int().min(0).max(600).optional(),
    share: z.number().min(0).max(1).optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.kind === 'fixed' && slot.minutes === undefined) {
      ctx.addIssue({ code: 'custom', message: 'fixed slot requires minutes' });
    }
    if (slot.kind === 'share' && slot.share === undefined) {
      ctx.addIssue({ code: 'custom', message: 'share slot requires share' });
    }
    const validStream =
      slot.track === 'animation' ? slot.stream === 'draw' || slot.stream === 'story' : slot.stream === 'main';
    if (!validStream) {
      ctx.addIssue({ code: 'custom', message: `stream '${slot.stream}' is not valid for track '${slot.track}'` });
    }
  });

export type TemplateSlot = z.infer<typeof templateSlotSchema>;

export const settingsSchema = z.object({
  /** Net focused minutes per day of week, index 0 = Sunday. */
  capacityByDow: z.array(z.number().int().min(0).max(960)).length(7),
  fastingReductionPct: z.number().int().min(0).max(100),
  fastingRules: z.object({
    monday: z.boolean(),
    thursday: z.boolean(),
    whiteDays: z.boolean(),
    ramadan: z.boolean(),
    dhulHijjahFirstNine: z.boolean(),
  }),
  hijriOffsetDays: z.number().int().min(-2).max(2),
  /** Weekly template, index 0 = Sunday. */
  weeklyTemplate: z.array(z.array(templateSlotSchema)).length(7),
  planner: z.object({
    roundToMinutes: z.number().int().min(1).max(30),
    minSlotMinutes: z.number().int().min(0).max(120),
    maxTaskMinutes: z.number().int().min(15).max(240),
  }),
  quran: z.object({
    memorizationOrder: z.enum(['juz30-29-then-forward', 'forward']),
    memorizeMinutes: z.number().int().min(5).max(180),
    minutesPerReviewPage: z.number().int().min(1).max(30),
    reviewCapMinutes: z.number().int().min(10).max(180),
    reviewMinMinutes: z.number().int().min(1).max(60),
    nearPages: z.number().int().min(0).max(30),
    rollingWindow: z.number().int().min(1).max(50),
    rollingMinSessions: z.number().int().min(1).max(50),
  }),
  baseline: z.object({
    factor: z.number().min(0).max(2),
    fastingFactor: z.number().min(0).max(1),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

const warmup = (): TemplateSlot => ({
  track: 'animation',
  stream: 'draw',
  role: 'warmup',
  kind: 'fixed',
  minutes: 20,
  fastingMinutes: 15,
});

const rest = (track: 'ai' | 'fsd'): TemplateSlot => ({ track, stream: 'main', role: 'focus', kind: 'rest' });

export const DEFAULT_WEEKLY_TEMPLATE: TemplateSlot[][] = [
  /* Sun */ [warmup(), rest('ai')],
  /* Mon */ [warmup(), rest('fsd')],
  /* Tue */ [warmup(), rest('fsd')],
  /* Wed */ [warmup(), rest('ai')],
  /* Thu */ [warmup(), rest('ai')],
  /* Fri */ [
    { track: 'animation', stream: 'draw', role: 'focus', kind: 'share', share: 0.5 },
    { track: 'ai', stream: 'main', role: 'focus', kind: 'rest' },
  ],
  /* Sat */ [
    { track: 'animation', stream: 'story', role: 'focus', kind: 'share', share: 0.5 },
    { track: 'fsd', stream: 'main', role: 'focus', kind: 'rest' },
  ],
];

export const DEFAULT_SETTINGS: Settings = {
  capacityByDow: [120, 120, 120, 120, 120, 180, 180],
  fastingReductionPct: 40,
  fastingRules: {
    monday: true,
    thursday: true,
    whiteDays: true,
    ramadan: true,
    dhulHijjahFirstNine: true,
  },
  hijriOffsetDays: 0,
  weeklyTemplate: DEFAULT_WEEKLY_TEMPLATE,
  planner: {
    roundToMinutes: 5,
    minSlotMinutes: 15,
    maxTaskMinutes: 75,
  },
  quran: {
    memorizationOrder: 'juz30-29-then-forward',
    memorizeMinutes: 40,
    minutesPerReviewPage: 3,
    reviewCapMinutes: 45,
    reviewMinMinutes: 10,
    nearPages: 5,
    rollingWindow: 10,
    rollingMinSessions: 3,
  },
  baseline: {
    factor: 0.35,
    fastingFactor: 0.6,
  },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge for plain objects; arrays and scalars from `patch` replace `base`. */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/** Merges stored (possibly older/partial) settings with defaults and validates. */
export function resolveSettings(stored: unknown): Settings {
  const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), stored ?? {});
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS);
}
