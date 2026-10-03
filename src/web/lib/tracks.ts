/**
 * Track/stream presentation derived from the fetched plan catalog
 * (useCatalog). Themes and icons come from the static maps in lib/themes.ts
 * and lib/icons.ts; unknown ids fall back to slate + a neutral icon.
 */
import type { Icon } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { QURAN_TRACK_ID, type TrackDef } from '../../shared/catalog.js';
import type { StudyTaskType } from '../../shared/types.js';
import { useCatalog } from '../client/hooks';
import type { CatalogResponse, Intensity, StreamId, TaskType, TrackId } from '../client/types';
import { useI18n, type StringKey } from '../i18n';
import { iconFor } from './icons';
import { themeClasses, type ThemeClasses } from './themes';

export interface TrackMeta extends ThemeClasses {
  /** 'track.stream' (or 'track' for Quran), handy as a React key. */
  key: string;
  label: string;
  short: string;
  icon: Icon;
  theme: string;
}

function fallback(track: TrackId): TrackMeta {
  return { key: track, label: track, short: track, icon: iconFor(null), theme: 'slate', ...themeClasses('slate') };
}

export function metaFor(catalog: CatalogResponse | null | undefined, track: TrackId, stream?: StreamId): TrackMeta {
  const def = catalog?.tracks.find((t) => t.id === track);
  if (!def) return fallback(track);
  const s =
    stream !== undefined ? def.streams.find((x) => x.id === stream) : (def.streams.find((x) => !x.archived) ?? def.streams[0]);
  const multi = def.streams.filter((x) => !x.archived).length > 1;
  const theme = s?.theme ?? def.theme;
  return {
    key: stream !== undefined ? `${track}.${stream}` : track,
    label: multi && s ? `${def.shortLabel}: ${s.shortLabel}` : def.shortLabel,
    short: multi && s ? s.shortLabel : def.shortLabel,
    icon: iconFor(s?.icon ?? def.icon),
    theme,
    ...themeClasses(theme),
  };
}

/** Hook form of metaFor: call once per component, reuse the lookup. */
export function useTrackMeta(): (track: TrackId, stream?: StreamId) => TrackMeta {
  const { data } = useCatalog();
  return useMemo(() => (track: TrackId, stream?: StreamId) => metaFor(data, track, stream), [data]);
}

export const TYPE_KEYS: Record<TaskType, StringKey> = {
  learn: 'type.learn',
  practice: 'type.practice',
  build: 'type.build',
  review: 'type.review',
  'quran-memorize': 'type.quran-memorize',
  'quran-review': 'type.quran-review',
};

export const INTENSITY_KEYS: Record<Intensity, StringKey> = {
  deep: 'intensity.deep',
  normal: 'intensity.normal',
  light: 'intensity.light',
};

type Translate = (key: StringKey) => string;

/** Task type label: the track's configured labels, then the dictionary defaults. */
export function typeLabel(track: TrackDef | undefined, type: string, t: Translate): string {
  return track?.typeLabels[type as StudyTaskType] ?? (TYPE_KEYS[type as TaskType] ? t(TYPE_KEYS[type as TaskType]) : type);
}

export function useTypeLabel(): (track: TrackId, type: TaskType) => string {
  const { data } = useCatalog();
  const { t } = useI18n();
  return useMemo(() => (track: TrackId, type: TaskType) => typeLabel(data?.tracks.find((x) => x.id === track), type, t), [data, t]);
}

/**
 * Display order map keyed 'track.stream' ('quran' and 'quran.main' both map
 * to the first slot): Quran first, then active study streams in catalog
 * order. `includeQuran` defaults to catalog.quranEnabled; pass true when the
 * view renders historical Quran data even while Quran is off.
 */
export function streamOrderMap(catalog: CatalogResponse | null | undefined, includeQuran?: boolean): Map<string, number> {
  const order = new Map<string, number>();
  let i = 0;
  if (includeQuran ?? catalog?.quranEnabled ?? false) {
    order.set(QURAN_TRACK_ID, i);
    order.set(`${QURAN_TRACK_ID}.main`, i);
    i++;
  }
  for (const t of catalog?.tracks ?? []) {
    if (t.kind !== 'study' || t.archived) continue;
    for (const s of t.streams) {
      if (!s.archived) order.set(`${t.id}.${s.id}`, i++);
    }
  }
  return order;
}
