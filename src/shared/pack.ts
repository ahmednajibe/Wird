/**
 * Plan packs: the importable/editable representation of a plan (catalog +
 * settings). Validation reports PackIssues with self-contained messages a
 * user can paste back to whatever produced the file.
 */
import { z } from 'zod';
import {
  BUILTIN_QURAN_TRACK,
  ID_RE,
  QURAN_TRACK_ID,
  type CatalogData,
  type LibraryResource,
  type StreamDef,
  type TrackDef,
} from './catalog.js';
import { deepMerge, DEFAULT_SETTINGS, settingsSchema, type Settings } from './settings.js';
import type { CurriculumModule, Phase, Resource, StudyTaskType } from './types.js';

export const THEMES = ['amber', 'blue', 'violet', 'coral', 'green', 'teal', 'rose', 'slate'] as const;
export const ICONS = [
  'book-open',
  'code',
  'brain',
  'paint-brush',
  'film-slate',
  'flask',
  'globe',
  'translate',
  'cooking-pot',
  'music-notes',
  'calculator',
  'heartbeat',
  'camera',
  'pen-nib',
  'barbell',
  'chart-line',
] as const;
export type Theme = (typeof THEMES)[number];
export type Icon = (typeof ICONS)[number];

/** Phase ids may contain uppercase (the owner's are 'A1', 'N-D1', ...). */
export const PHASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export interface PackIssue {
  path: string;
  message: string;
}

// ------------------------------------------------------------ schema

const ID_RULE = `use lowercase letters, digits and '-', starting with a letter or digit (no '/')`;
const PHASE_ID_RULE = `use letters, digits and '-', starting with a letter or digit`;

const resourceSchema = z.strictObject({
  name: z.string({ error: 'name is required' }).min(1, { error: 'name is required' }).max(200, { error: 'name must be at most 200 characters' }),
  url: z
    .string({ error: 'url must be an http(s) URL' })
    .refine(
      (v) => /^https?:\/\//.test(v),
      { error: 'url must be an http(s) URL' },
    )
    .optional(),
  owned: z.boolean().optional(),
  paid: z.boolean().optional(),
  note: z.string().optional(),
});

const streamSchema = z.strictObject({
  id: z.string().regex(ID_RE),
  label: z.string({ error: 'label is required' }).min(1, { error: 'label is required' }).max(60, { error: 'label must be at most 60 characters' }),
  shortLabel: z.string().min(1, { error: 'shortLabel must not be empty' }).max(24, { error: 'shortLabel must be at most 24 characters' }).optional(),
  style: z.enum(['study', 'practice'], { error: (i) => `style '${i.input}' is not allowed. Allowed: study, practice` }).optional(),
  warmupTitle: z.string().optional(),
  lightTitle: z.string().optional(),
  defaultDrills: z.string().optional(),
  theme: z.enum(THEMES, { error: (i) => `theme '${i.input}' is not allowed. Allowed: ${THEMES.join(', ')}` }).optional(),
  icon: z.enum(ICONS, { error: (i) => `icon '${i.input}' is not allowed. Allowed: ${ICONS.join(', ')}` }).optional(),
});

const typeLabelsSchema = z.strictObject({
  learn: z.string().min(1).max(24).optional(),
  build: z.string().min(1).max(24).optional(),
  practice: z.string().min(1).max(24).optional(),
  review: z.string().min(1).max(24).optional(),
});

const studyTrackSchema = z.strictObject({
  id: z.string().regex(ID_RE),
  kind: z.literal('study'),
  label: z.string({ error: 'label is required' }).min(1, { error: 'label is required' }).max(60, { error: 'label must be at most 60 characters' }),
  shortLabel: z.string().min(1, { error: 'shortLabel must not be empty' }).max(24, { error: 'shortLabel must be at most 24 characters' }).optional(),
  theme: z.enum(THEMES, { error: (i) => `theme '${i.input}' is not allowed. Allowed: ${THEMES.join(', ')}` }),
  icon: z.enum(ICONS, { error: (i) => `icon '${i.input}' is not allowed. Allowed: ${ICONS.join(', ')}` }),
  typeLabels: typeLabelsSchema.optional(),
  streams: z.array(streamSchema).min(1, { error: 'a study track needs at least one stream' }),
});

const quranTrackSchema = z.strictObject({
  id: z.literal(QURAN_TRACK_ID, { error: (i) => `id '${i.input}': the Quran track's id must be 'quran'` }),
  kind: z.literal('quran'),
  label: z.string({ error: 'label is required' }).min(1, { error: 'label is required' }).max(60, { error: 'label must be at most 60 characters' }),
  shortLabel: z.string().min(1, { error: 'shortLabel must not be empty' }).max(24, { error: 'shortLabel must be at most 24 characters' }).optional(),
  theme: z.enum(THEMES, { error: (i) => `theme '${i.input}' is not allowed. Allowed: ${THEMES.join(', ')}` }),
  icon: z.enum(ICONS, { error: (i) => `icon '${i.input}' is not allowed. Allowed: ${ICONS.join(', ')}` }),
});

const moduleSchema = z.strictObject({
  id: z.string().regex(ID_RE),
  track: z.string().regex(ID_RE),
  stream: z.string().regex(ID_RE),
  phase: z.strictObject({
    id: z.string().regex(PHASE_ID_RE),
    title: z.string({ error: 'phase.title is required' }).min(1, { error: 'phase.title is required' }).max(80, { error: 'phase.title must be at most 80 characters' }),
  }),
  title: z.string({ error: 'title is required' }).min(1, { error: 'title is required' }).max(200, { error: 'title must be at most 200 characters' }),
  resources: z.array(resourceSchema).optional(),
  estMinutes: z
    .number({ error: 'estMinutes must be a whole number of minutes, at least 1' })
    .int({ error: 'estMinutes must be a whole number of minutes, at least 1' })
    .min(1, { error: 'estMinutes must be a whole number of minutes, at least 1' })
    .max(100000, { error: 'estMinutes must be at most 100000' }),
  kind: z.enum(['study', 'project'], { error: (i) => `kind '${i.input}' is not allowed. Allowed: study, project` }).optional(),
  note: z.string().optional(),
  estimateUncertain: z.boolean().optional(),
  warmupDrills: z.string().optional(),
});

const librarySchema = z.strictObject({
  name: z.string({ error: 'name is required' }).min(1, { error: 'name is required' }).max(200, { error: 'name must be at most 200 characters' }),
  url: z
    .string({ error: 'url must be an http(s) URL' })
    .refine((v) => /^https?:\/\//.test(v), { error: 'url must be an http(s) URL' })
    .optional(),
  owned: z.boolean().optional(),
  paid: z.boolean().optional(),
  note: z.string().optional(),
  track: z.string().regex(ID_RE),
  stream: z.string().regex(ID_RE),
});

export const planPackSchema = z.strictObject({
  version: z.literal(1, { error: 'version must be 1' }),
  name: z.string({ error: 'name is required' }).min(1, { error: 'name is required' }).max(100, { error: 'name must be at most 100 characters' }),
  tracks: z.array(z.discriminatedUnion('kind', [studyTrackSchema, quranTrackSchema]), { error: 'tracks must be an array' }),
  modules: z.array(moduleSchema).default([]),
  library: z.array(librarySchema).optional(),
  settings: z.custom<Record<string, unknown>>((v) => typeof v === 'object' && v !== null && !Array.isArray(v), { error: 'settings must be an object' }).optional(),
});

export type PlanPack = z.infer<typeof planPackSchema>;

// ------------------------------------------------- layer 1: shape

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** `tracks[3].streams[0].id` style path. */
function fmtPath(segs: readonly (string | number | symbol)[], prefix = ''): string {
  let out = prefix;
  for (const s of segs) {
    if (typeof s === 'number') out += `[${s}]`;
    else out += out === '' ? String(s) : `.${String(s)}`;
  }
  return out;
}

/** ` (id 'x')` when the object at `segs` inside `input` has a string id. */
function idSuffix(input: unknown, segs: readonly (string | number | symbol)[]): string {
  let cur: unknown = input;
  for (const s of segs) {
    if (!isPlainObject(cur) && !Array.isArray(cur)) return '';
    cur = (cur as Record<string | number, unknown>)[s as string | number];
  }
  if (isPlainObject(cur) && typeof cur.id === 'string') return ` (id '${cur.id}')`;
  return '';
}

const ALLOWED = {
  pack: ['version', 'name', 'tracks', 'modules', 'library', 'settings'],
  studyTrack: ['id', 'kind', 'label', 'shortLabel', 'theme', 'icon', 'typeLabels', 'streams'],
  quranTrack: ['id', 'kind', 'label', 'shortLabel', 'theme', 'icon'],
  typeLabels: ['learn', 'build', 'practice', 'review'],
  stream: ['id', 'label', 'shortLabel', 'style', 'warmupTitle', 'lightTitle', 'defaultDrills', 'theme', 'icon'],
  module: ['id', 'track', 'stream', 'phase', 'title', 'resources', 'estMinutes', 'kind', 'note', 'estimateUncertain', 'warmupDrills'],
  phase: ['id', 'title'],
  resource: ['name', 'url', 'owned', 'paid', 'note'],
  library: ['name', 'url', 'owned', 'paid', 'note', 'track', 'stream'],
} as const;

function unknownFields(value: unknown, allowed: readonly string[], path: string, input: unknown, segs: (string | number)[], errors: PackIssue[]): void {
  if (!isPlainObject(value)) return;
  for (const k of Object.keys(value)) {
    if (!allowed.includes(k)) {
      errors.push({
        path: `${path}.${k}`,
        message: `${path}${idSuffix(input, segs)}: unknown field '${k}'. Allowed fields: ${allowed.join(', ')}`,
      });
    }
  }
}

/** Flags keys that are not part of the pack shape (strict objects report these via zod too, with worse messages). */
function walkUnknownFields(input: unknown, errors: PackIssue[]): void {
  if (!isPlainObject(input)) return;
  unknownFields(input, ALLOWED.pack, 'pack', input, [], errors);
  const tracks = input.tracks;
  if (Array.isArray(tracks)) {
    tracks.forEach((t, i) => {
      const path = `tracks[${i}]`;
      if (!isPlainObject(t)) return;
      unknownFields(t, t.kind === 'quran' ? ALLOWED.quranTrack : ALLOWED.studyTrack, path, input, ['tracks', i], errors);
      if (isPlainObject(t.typeLabels)) {
        unknownFields(t.typeLabels, ALLOWED.typeLabels, `${path}.typeLabels`, input, ['tracks', i, 'typeLabels'], errors);
      }
      if (Array.isArray(t.streams)) {
        t.streams.forEach((s, j) => unknownFields(s, ALLOWED.stream, `${path}.streams[${j}]`, input, ['tracks', i, 'streams', j], errors));
      }
    });
  }
  const modules = input.modules;
  if (Array.isArray(modules)) {
    modules.forEach((m, i) => {
      const path = `modules[${i}]`;
      if (!isPlainObject(m)) return;
      unknownFields(m, ALLOWED.module, path, input, ['modules', i], errors);
      unknownFields(m.phase, ALLOWED.phase, `${path}.phase`, input, ['modules', i, 'phase'], errors);
      if (Array.isArray(m.resources)) {
        m.resources.forEach((r, j) => unknownFields(r, ALLOWED.resource, `${path}.resources[${j}]`, input, ['modules', i, 'resources', j], errors));
      }
    });
  }
  if (Array.isArray(input.library)) {
    input.library.forEach((r, i) => unknownFields(r, ALLOWED.library, `library[${i}]`, input, ['library', i], errors));
  }
  if (isPlainObject(input.settings)) walkSettingsFields(input.settings, DEFAULT_SETTINGS as unknown as Record<string, unknown>, 'settings', errors);
}

/** Walks pack settings against the DEFAULT_SETTINGS shape; arrays and scalars are leaves. */
function walkSettingsFields(value: Record<string, unknown>, shape: Record<string, unknown>, path: string, errors: PackIssue[]): void {
  for (const [k, v] of Object.entries(value)) {
    const allowed = Object.keys(shape);
    if (!(k in shape)) {
      errors.push({ path: `${path}.${k}`, message: `${path}: unknown field '${k}'. Allowed fields: ${allowed.join(', ')}` });
      continue;
    }
    const leaf = shape[k];
    if (isPlainObject(v) && isPlainObject(leaf)) walkSettingsFields(v, leaf, `${path}.${k}`, errors);
  }
}

/** Maps one zod issue to a user-facing PackIssue. */
function toPackIssue(issue: z.core.$ZodIssue, input: unknown, pathPrefix = ''): PackIssue | null {
  const segs = issue.path as (string | number | symbol)[];
  const path = fmtPath(segs, pathPrefix);
  const leaf = segs.length > 0 ? String(segs[segs.length - 1]) : '';
  const objSegs = segs.slice(0, -1);
  const prefix = objSegs.length === 0 ? 'pack' : `${fmtPath(objSegs, pathPrefix)}${idSuffix(input, objSegs)}`;

  // Object-level issues live on the object path itself.
  if (issue.code === 'unrecognized_keys') return null; // covered by the manual walk
  if (issue.code === 'invalid_union') {
    let el: unknown = input;
    for (const s of segs) el = (el as Record<string | number, unknown>)?.[s as string | number];
    const kind = isPlainObject(el) ? el.kind : undefined;
    return { path, message: `${path}: kind '${String(kind)}' must be 'study' or 'quran'` };
  }
  if (issue.code === 'invalid_format' && issue.format === 'regex') {
    let value: unknown = issue.input;
    if (value === undefined) {
      let cur: unknown = input;
      for (const s of segs) cur = (cur as Record<string | number, unknown>)?.[s as string | number];
      value = cur;
    }
    const rule = 'pattern' in issue && String(issue.pattern) === String(PHASE_ID_RE) ? PHASE_ID_RULE : ID_RULE;
    const text = leaf === 'id' ? `${path} '${value}' is not allowed: ${rule}` : `${prefix}: ${leaf} '${value}' is not allowed: ${rule}`;
    return { path, message: text };
  }
  if (issue.code === 'invalid_type' && issue.input === undefined) {
    return { path, message: `${prefix}: ${leaf || 'value'} is required` };
  }
  const custom = issue.message;
  return { path, message: `${prefix}: ${custom}` };
}

// ------------------------------------------------- layer 2: cross references

function layer2(pack: PlanPack): { errors: PackIssue[]; warnings: PackIssue[] } {
  const errors: PackIssue[] = [];
  const warnings: PackIssue[] = [];

  const trackById = new Map<string, Extract<PlanPack['tracks'][number], { kind: 'study' }>>();
  let quranSeen = false;
  const seenTracks = new Set<string>();
  pack.tracks.forEach((t, i) => {
    if (seenTracks.has(t.id)) errors.push({ path: `tracks[${i}]`, message: `tracks[${i}]: duplicate track id '${t.id}'` });
    seenTracks.add(t.id);
    if (t.kind === 'quran') {
      if (quranSeen) errors.push({ path: `tracks[${i}]`, message: `tracks[${i}]: only one Quran track is allowed` });
      quranSeen = true;
    } else if (t.id === QURAN_TRACK_ID) {
      errors.push({ path: `tracks[${i}]`, message: `tracks[${i}]: track id 'quran' is reserved for the Quran track` });
    } else {
      trackById.set(t.id, t);
      const seenStreams = new Set<string>();
      t.streams.forEach((s, j) => {
        if (seenStreams.has(s.id)) {
          errors.push({ path: `tracks[${i}].streams[${j}]`, message: `tracks[${i}].streams[${j}]: duplicate stream id '${s.id}' in track '${t.id}'` });
        }
        seenStreams.add(s.id);
      });
    }
  });

  const streamOf = (track: string, stream: string) => trackById.get(track)?.streams.find((s) => s.id === stream);

  pack.modules.forEach((m, i) => {
    const track = trackById.get(m.track);
    if (!track) {
      const label = m.track === QURAN_TRACK_ID && quranSeen ? `track 'quran' is the Quran track` : `track '${m.track}' which is not defined in tracks[]`;
      errors.push({ path: `modules[${i}]`, message: `module '${m.id}' references ${label}` });
    } else if (!streamOf(m.track, m.stream)) {
      errors.push({ path: `modules[${i}]`, message: `module '${m.id}' references stream '${m.stream}' which is not defined in track '${m.track}'.streams[]` });
    }
  });
  const seenModuleIds = new Set<string>();
  pack.modules.forEach((m, i) => {
    if (seenModuleIds.has(m.id)) errors.push({ path: `modules[${i}]`, message: `modules[${i}]: duplicate module id '${m.id}'` });
    seenModuleIds.add(m.id);
  });

  (pack.library ?? []).forEach((r, i) => {
    if (!trackById.get(r.track)) {
      errors.push({ path: `library[${i}]`, message: `library[${i}] references track '${r.track}' which is not defined in tracks[]` });
    } else if (!streamOf(r.track, r.stream)) {
      errors.push({ path: `library[${i}]`, message: `library[${i}] references stream '${r.stream}' which is not defined in track '${r.track}'.streams[]` });
    }
  });

  // Phases: one title per phase id within a stream, and contiguous runs.
  const byStream = new Map<string, PlanPack['modules']>();
  for (const m of pack.modules) {
    const key = `${m.track}/${m.stream}`;
    const list = byStream.get(key) ?? [];
    list.push(m);
    byStream.set(key, list);
  }
  for (const [key, mods] of byStream) {
    const titleByPhase = new Map<string, { title: string; firstId: string }>();
    let prevPid: string | null = null;
    let lastBlockFirstId = '';
    for (const m of mods) {
      const known = titleByPhase.get(m.phase.id);
      if (known && known.title !== m.phase.title) {
        errors.push({
          path: `modules`,
          message: `phase '${m.phase.id}' has two titles in ${key}: '${known.title}' (module '${known.firstId}') and '${m.phase.title}' (module '${m.id}')`,
        });
      } else if (!known) {
        titleByPhase.set(m.phase.id, { title: m.phase.title, firstId: m.id });
      }
      if (prevPid !== null && m.phase.id !== prevPid && titleByPhase.has(m.phase.id) && titleByPhase.get(m.phase.id)?.firstId !== m.id) {
        errors.push({
          path: 'modules',
          message: `phase '${m.phase.id}' in ${key} is split: module '${lastBlockFirstId}' belongs to phase '${prevPid}' but comes between modules of '${m.phase.id}'. Keep each phase's modules together`,
        });
      }
      if (m.phase.id !== prevPid) {
        prevPid = m.phase.id;
        lastBlockFirstId = m.id;
      }
    }
  }

  // Weekly template: required once there are study tracks, and must reference them.
  const hasStudy = trackById.size > 0;
  const template = (pack.settings as Record<string, unknown> | undefined)?.weeklyTemplate;
  if (hasStudy) {
    if (!Array.isArray(template)) {
      errors.push({ path: 'settings.weeklyTemplate', message: 'settings.weeklyTemplate is required when the pack defines study tracks' });
    } else if ((template as unknown[]).every((d) => !Array.isArray(d) || d.length === 0)) {
      errors.push({ path: 'settings.weeklyTemplate', message: 'settings.weeklyTemplate must give at least one slot' });
    }
  }
  if (Array.isArray(template)) {
    template.forEach((day, d) => {
      if (!Array.isArray(day)) return;
      day.forEach((slot, i) => {
        if (!isPlainObject(slot)) return;
        const t = slot.track;
        const s = slot.stream;
        if (typeof t !== 'string' || typeof s !== 'string') return;
        if (!trackById.get(t)) {
          errors.push({
            path: `settings.weeklyTemplate[${d}][${i}]`,
            message: `settings.weeklyTemplate[${d}][${i}] references track '${t}' which is not defined in tracks[]`,
          });
        } else if (!streamOf(t, s)) {
          errors.push({
            path: `settings.weeklyTemplate[${d}][${i}]`,
            message: `settings.weeklyTemplate[${d}][${i}] references stream '${s}' which is not defined in track '${t}'.streams[]`,
          });
        }
      });
    });
  }

  // Warnings: they never block an import.
  const templated = new Set<string>();
  if (Array.isArray(template)) {
    for (const day of template) {
      if (!Array.isArray(day)) continue;
      for (const slot of day) {
        if (isPlainObject(slot) && typeof slot.track === 'string' && typeof slot.stream === 'string') {
          templated.add(`${slot.track}/${slot.stream}`);
        }
      }
    }
  }
  for (const t of trackById.values()) {
    for (const s of t.streams) {
      const key = `${t.id}/${s.id}`;
      const hasModules = pack.modules.some((m) => m.track === t.id && m.stream === s.id);
      if (!hasModules) {
        warnings.push({ path: `tracks/${t.id}/streams/${s.id}`, message: `stream '${s.id}' in track '${t.id}' has no modules; only open practice sessions will be planned` });
      }
      if (!templated.has(key)) {
        warnings.push({ path: `tracks/${t.id}/streams/${s.id}`, message: `stream '${s.id}' in track '${t.id}' gets no time: no weeklyTemplate slot references it` });
      }
      if ((s.style ?? 'study') === 'practice' && !s.defaultDrills) {
        warnings.push({ path: `tracks/${t.id}/streams/${s.id}`, message: `practice stream '${s.id}' in track '${t.id}' has no defaultDrills; a generic warm-up text will be used` });
      }
    }
  }

  return { errors, warnings };
}

// ------------------------------------------------------------- convert

/** Pack track/module data -> engine CatalogData (the Quran track defaults to the built-in one). */
export function packToCatalogData(pack: PlanPack): CatalogData {
  const tracks: TrackDef[] = [];
  if (!pack.tracks.some((t) => t.kind === 'quran')) tracks.push({ ...BUILTIN_QURAN_TRACK, typeLabels: {}, streams: [] });
  for (const t of pack.tracks) {
    if (t.kind === 'quran') {
      tracks.push({
        id: t.id,
        kind: 'quran',
        label: t.label,
        shortLabel: t.shortLabel ?? t.label,
        theme: t.theme,
        icon: t.icon,
        typeLabels: {},
        archived: false,
        streams: [],
      });
    } else {
      tracks.push({
        id: t.id,
        kind: 'study',
        label: t.label,
        shortLabel: t.shortLabel ?? t.label,
        theme: t.theme,
        icon: t.icon,
        typeLabels: (t.typeLabels ?? {}) as Partial<Record<StudyTaskType, string>>,
        archived: false,
        streams: t.streams.map(
          (s): StreamDef => ({
            track: t.id,
            id: s.id,
            label: s.label,
            shortLabel: s.shortLabel ?? s.label,
            style: s.style ?? 'study',
            warmupTitle: s.warmupTitle ?? null,
            lightTitle: s.lightTitle ?? null,
            defaultDrills: s.defaultDrills ?? null,
            theme: s.theme ?? null,
            icon: s.icon ?? null,
            archived: false,
          }),
        ),
      });
    }
  }
  const modules: CurriculumModule[] = pack.modules.map((m) => {
    const mod: CurriculumModule = {
      id: m.id,
      track: m.track,
      stream: m.stream,
      phase: { id: m.phase.id, title: m.phase.title } satisfies Phase,
      title: m.title,
      ...(m.note !== undefined ? { note: m.note } : {}),
      resources: (m.resources ?? []) as Resource[],
      estMinutes: m.estMinutes,
      kind: m.kind ?? 'study',
    };
    if (m.estimateUncertain) mod.estimateUncertain = true;
    if (m.warmupDrills !== undefined) mod.warmupDrills = m.warmupDrills;
    return mod;
  });
  const library: LibraryResource[] = (pack.library ?? []).map((r) => {
    const res: LibraryResource = { track: r.track, stream: r.stream, name: r.name };
    if (r.url !== undefined) res.url = r.url;
    if (r.owned) res.owned = true;
    if (r.paid) res.paid = true;
    if (r.note !== undefined) res.note = r.note;
    return res;
  });
  return { tracks, modules, library };
}

/** Active catalog + settings -> a pack the user can edit and re-import. */
export function catalogToPack(data: CatalogData, settings: Settings, name: string): PlanPack {
  const tracks: PlanPack['tracks'] = data.tracks
    .filter((t) => !t.archived)
    .map((t) => {
      if (t.kind === 'quran') {
        return {
          id: t.id as 'quran',
          kind: 'quran' as const,
          label: t.label,
          shortLabel: t.shortLabel,
          theme: t.theme as Theme,
          icon: t.icon as Icon,
        };
      }
      return {
        id: t.id,
        kind: 'study' as const,
        label: t.label,
        shortLabel: t.shortLabel,
        theme: t.theme as Theme,
        icon: t.icon as Icon,
        ...(Object.keys(t.typeLabels).length > 0 ? { typeLabels: { ...t.typeLabels } } : {}),
        streams: t.streams
          .filter((s) => !s.archived)
          .map((s) => ({
            id: s.id,
            label: s.label,
            shortLabel: s.shortLabel,
            style: s.style,
            ...(s.warmupTitle !== null ? { warmupTitle: s.warmupTitle } : {}),
            ...(s.lightTitle !== null ? { lightTitle: s.lightTitle } : {}),
            ...(s.defaultDrills !== null ? { defaultDrills: s.defaultDrills } : {}),
            ...(s.theme !== null ? { theme: s.theme as Theme } : {}),
            ...(s.icon !== null ? { icon: s.icon as Icon } : {}),
          })),
      };
    });
  const modules = data.modules
    .filter((m) => !m.archived)
    .map((m) => ({
      id: m.id,
      track: m.track,
      stream: m.stream,
      phase: { id: m.phase.id, title: m.phase.title },
      title: m.title,
      ...(m.resources.length > 0 ? { resources: m.resources.map((r) => ({ ...r })) } : {}),
      estMinutes: m.estMinutes,
      kind: m.kind,
      ...(m.note !== undefined ? { note: m.note } : {}),
      ...(m.estimateUncertain ? { estimateUncertain: true } : {}),
      ...(m.warmupDrills !== undefined ? { warmupDrills: m.warmupDrills } : {}),
    }));
  const library = data.library.map((r) => {
    const out: { track: string; stream: string; name: string; url?: string; owned?: boolean; paid?: boolean; note?: string } = {
      track: r.track,
      stream: r.stream,
      name: r.name,
    };
    if (r.url !== undefined) out.url = r.url;
    if (r.owned) out.owned = true;
    if (r.paid) out.paid = true;
    if (r.note !== undefined) out.note = r.note;
    return out;
  });
  return {
    version: 1,
    name,
    tracks,
    modules,
    library,
    settings: settings as unknown as Record<string, unknown>,
  };
}

// ------------------------------------------------------------- validate

export interface ValidatedPack {
  pack: PlanPack;
  catalog: CatalogData;
  settings: Settings;
}

export type PackValidation =
  | { ok: true; pack: PlanPack; catalog: CatalogData; settings: Settings; warnings: PackIssue[] }
  | { ok: false; errors: PackIssue[]; warnings: PackIssue[] };

export function validatePack(input: unknown): PackValidation {
  const errors: PackIssue[] = [];
  walkUnknownFields(input, errors);

  const parsed = planPackSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const mapped = toPackIssue(issue, input);
      if (mapped) errors.push(mapped);
    }
    return { ok: false, errors, warnings: [] };
  }
  const pack = parsed.data;

  // Settings: merged over DEFAULT_SETTINGS, then validated by the shared schema.
  const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), pack.settings ?? {});
  const sres = settingsSchema.safeParse(merged);
  if (!sres.success) {
    for (const issue of sres.error.issues) {
      const segs = issue.path as (string | number | symbol)[];
      const path = fmtPath(segs, 'settings');
      const leaf = segs.length > 0 ? String(segs[segs.length - 1]) : '';
      const objSegs = segs.slice(0, -1);
      const prefix = objSegs.length === 0 ? 'settings' : fmtPath(objSegs, 'settings');
      if (issue.code === 'invalid_type' && issue.input === undefined) {
        errors.push({ path, message: `${prefix}: ${leaf} is required` });
      } else {
        errors.push({ path, message: `${prefix}: ${issue.message}` });
      }
    }
    return { ok: false, errors, warnings: [] };
  }

  const { errors: l2, warnings } = layer2(pack);
  errors.push(...l2);
  if (errors.length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    pack,
    catalog: packToCatalogData(pack),
    settings: sres.data,
    warnings,
  };
}
