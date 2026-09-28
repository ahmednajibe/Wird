/**
 * Settings: defaults in code, persisted as JSON, validated with zod.
 */
import { z } from 'zod';
import { ID_RE } from './catalog.js';

export const templateSlotSchema = z
  .object({
    track: z.string().regex(ID_RE, 'must be a lowercase id (a-z, 0-9, -)'),
    stream: z.string().regex(ID_RE, 'must be a lowercase id (a-z, 0-9, -)'),
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
  /** IANA timezone used for "today" (and therefore every day boundary). */
  timezone: z.string().superRefine((tz, ctx) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      ctx.addIssue({ code: 'custom', message: `unknown timezone '${tz}'` });
    }
  }),
  /** Weekly template, index 0 = Sunday. */
  weeklyTemplate: z.array(z.array(templateSlotSchema)).length(7),
  planner: z.object({
    roundToMinutes: z.number().int().min(1).max(30),
    minSlotMinutes: z.number().int().min(0).max(120),
    maxTaskMinutes: z.number().int().min(15).max(240),
  }),
  quran: z.object({
    /** When false, Quran sessions are not planned and the reservation is 0. */
    enabled: z.boolean(),
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
  timezone: 'Africa/Cairo',
  /** Fresh installs start with an empty plan; packs fill this in. */
  weeklyTemplate: [[], [], [], [], [], [], []],
  planner: {
    roundToMinutes: 5,
    minSlotMinutes: 15,
    maxTaskMinutes: 75,
  },
  quran: {
    enabled: true,
    memorizationOrder: 'juz30-29-then-forward',
    memorizeMinutes: 40,
    minutesPerReviewPage: 3,
    /** Effective cap is min(reviewCapMinutes, daily Quran reservation). */
    reviewCapMinutes: 40,
    reviewMinMinutes: 10,
    nearPages: 5,
    rollingWindow: 10,
    rollingMinSessions: 3,
  },
  baseline: {
    factor: 0.28,
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
