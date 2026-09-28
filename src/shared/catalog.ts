/**
 * Catalog: the tracks, streams and modules that drive planning. Pure data and
 * lookup helpers, no I/O. The server injects one built from seed data
 * (phase 2: from the database / imported plan packs).
 */
import type { CurriculumModule, Resource, StudyTaskType, TrackStream } from './types.js';

export type TrackKind = 'study' | 'quran';
export type StreamStyle = 'study' | 'practice';

/** Track id reserved for Quran tasks. */
export const QURAN_TRACK_ID = 'quran';

/** Valid track/stream ids (also used for settings template slots). */
export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function streamKey(track: string, stream: string): string {
  return `${track}/${stream}`;
}

export interface StreamDef {
  track: string;
  id: string;
  label: string;
  shortLabel: string;
  style: StreamStyle;
  warmupTitle: string | null;
  lightTitle: string | null;
  defaultDrills: string | null;
  theme: string | null;
  icon: string | null;
  archived: boolean;
}

export interface TrackDef {
  id: string;
  kind: TrackKind;
  label: string;
  shortLabel: string;
  theme: string;
  icon: string;
  typeLabels: Partial<Record<StudyTaskType, string>>;
  archived: boolean;
  streams: StreamDef[];
}

/** A resource attached to a track/stream but not scheduled by any module. */
export interface LibraryResource extends Resource {
  track: string;
  stream: string;
}

export interface CatalogData {
  tracks: TrackDef[];
  modules: CurriculumModule[];
  library: LibraryResource[];
}

export interface Catalog {
  readonly data: CatalogData;
  /** Track by id, including archived ones. */
  track(id: string): TrackDef | undefined;
  /** Stream by track/id, including archived ones. */
  stream(track: string, stream: string): StreamDef | undefined;
  kindOf(track: string): TrackKind | undefined;
  /** Module by id, including archived ones. */
  module(id: string): CurriculumModule | undefined;
  /** Active modules of a stream, in array order (= study order). */
  modulesFor(track: string, stream: string): CurriculumModule[];
  /** Every active module, in array order. */
  activeModules(): CurriculumModule[];
  /** Active streams of active study tracks: track order, then stream order. */
  studyStreams(): TrackStream[];
}

/** Quran track used when the data does not define one. */
export const BUILTIN_QURAN_TRACK: TrackDef = {
  id: QURAN_TRACK_ID,
  kind: 'quran',
  label: 'Quran',
  shortLabel: 'Quran',
  theme: 'amber',
  icon: 'book-open',
  typeLabels: {},
  archived: false,
  streams: [],
};

/** Array order in `data` is the order: tracks, streams and modules alike. */
export function buildCatalog(data: CatalogData): Catalog {
  const tracks = data.tracks.some((t) => t.kind === 'quran') ? data.tracks : [BUILTIN_QURAN_TRACK, ...data.tracks];
  const trackById = new Map(tracks.map((t) => [t.id, t]));
  const streamByKey = new Map<string, StreamDef>();
  for (const t of tracks) {
    for (const s of t.streams) streamByKey.set(streamKey(t.id, s.id), s);
  }
  const moduleById = new Map(data.modules.map((m) => [m.id, m]));
  const modulesByStream = new Map<string, CurriculumModule[]>();
  const active: CurriculumModule[] = [];
  for (const m of data.modules) {
    if (m.archived) continue;
    active.push(m);
    const key = streamKey(m.track, m.stream);
    const list = modulesByStream.get(key) ?? [];
    list.push(m);
    modulesByStream.set(key, list);
  }
  const empty: CurriculumModule[] = [];
  return {
    data,
    track: (id) => trackById.get(id),
    stream: (track, stream) => streamByKey.get(streamKey(track, stream)),
    kindOf: (track) => trackById.get(track)?.kind,
    module: (id) => moduleById.get(id),
    modulesFor: (track, stream) => modulesByStream.get(streamKey(track, stream)) ?? empty,
    activeModules: () => active,
    studyStreams: () =>
      tracks
        .filter((t) => t.kind === 'study' && !t.archived)
        .flatMap((t) => t.streams.filter((s) => !s.archived).map((s) => ({ track: t.id, stream: s.id }))),
  };
}
