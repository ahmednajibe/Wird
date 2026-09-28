/**
 * Plan-pack import: dry-run previews and commits. Preview writes nothing;
 * commit snapshots the DB, rewrites the plan tables in one transaction and
 * regenerates today onward when the plan actually changed.
 */
import { maxDate } from '../shared/dates.js';
import { validatePack, type PackIssue, type PlanPack } from '../shared/pack.js';
import type { Settings } from '../shared/settings.js';
import type { IsoDate } from '../shared/types.js';
import type { CatalogData, StreamDef, TrackDef } from '../shared/catalog.js';
import type { CurriculumModule } from '../shared/types.js';
import { snapshotDb } from './backup.js';
import { backupDirFor } from './config.js';
import { transaction } from './db.js';
import { unprocessable } from './errors.js';
import { CatalogRepo } from './repoCatalog.js';
import { PLANNING_KEYS, TRACKING_START_KEY, type LearningService } from './service.js';

export type ImportMode = 'update' | 'fresh';
export type IdReuse = 'reset' | 'keep';

export interface ChangeCounts {
  added: number;
  updated: number;
  unchanged: number;
  revived: number;
  archived: number;
}

export interface ArchivedEntity {
  kind: 'track' | 'stream' | 'module';
  /** Stream ids are written as 'track/stream'. */
  id: string;
  title: string;
  hasProgress: boolean;
}

export interface ReusedModule {
  id: string;
  title: string;
  creditedMinutes: number;
  manualComplete: boolean;
}

export type ImportPreview =
  | { ok: false; errors: PackIssue[]; warnings: PackIssue[] }
  | {
      ok: true;
      mode: ImportMode;
      name: string;
      warnings: PackIssue[];
      counts: { tracks: ChangeCounts; streams: ChangeCounts; modules: ChangeCounts };
      archived: ArchivedEntity[];
      reusedWithProgress: ReusedModule[];
      settingsChanged: string[];
      regenerates: boolean;
      regenerateFrom: IsoDate;
    };

export interface ImportResult {
  preview: ImportPreview;
  backup: string | null;
  regenerated: boolean;
}

const zero = (): ChangeCounts => ({ added: 0, updated: 0, unchanged: 0, revived: 0, archived: 0 });

function sameTrack(a: TrackDef, b: TrackDef): boolean {
  return (
    a.kind === b.kind &&
    a.label === b.label &&
    a.shortLabel === b.shortLabel &&
    a.theme === b.theme &&
    a.icon === b.icon &&
    JSON.stringify(a.typeLabels) === JSON.stringify(b.typeLabels)
  );
}

function sameStream(a: StreamDef, b: StreamDef): boolean {
  return (
    a.label === b.label &&
    a.shortLabel === b.shortLabel &&
    a.style === b.style &&
    a.warmupTitle === b.warmupTitle &&
    a.lightTitle === b.lightTitle &&
    a.defaultDrills === b.defaultDrills &&
    a.theme === b.theme &&
    a.icon === b.icon
  );
}

function sameModule(a: CurriculumModule, b: CurriculumModule): boolean {
  const { archived: _a, ...na } = a;
  const { archived: _b, ...nb } = b;
  return JSON.stringify(na) === JSON.stringify(nb);
}

interface ProgressProbe {
  module(id: string): boolean;
  stream(track: string, stream: string): boolean;
  track(track: string): boolean;
}

function makeProgressProbe(service: LearningService, current: CatalogData): ProgressProbe {
  const ledger = service.ledger();
  const states = new Map(service.modules.all().map((s) => [s.moduleId, s]));
  const credited = (id: string) => ledger.creditedOf(id) > 0;
  const manual = (id: string) => states.get(id)?.manualComplete === true;
  const taskHits = (sql: string, ...args: string[]) =>
    Number((service.db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${sql}`).get(...args) as { n: number }).n) > 0;
  return {
    module: (id) => credited(id) || manual(id) || taskHits('module_id = ?', id),
    stream: (track, stream) =>
      taskHits('track = ? AND stream = ?', track, stream) || current.modules.some((m) => m.track === track && m.stream === stream && (credited(m.id) || manual(m.id))),
    track: (track) => taskHits('track = ?', track) || current.modules.some((m) => m.track === track && (credited(m.id) || manual(m.id))),
  };
}

export function previewImport(service: LearningService, input: unknown, mode: ImportMode): ImportPreview {
  const v = validatePack(input);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
  const incoming = v.catalog;
  const current = new CatalogRepo(service.db).load();
  const probe = makeProgressProbe(service, current);

  // In update mode a module may not move to a different track/stream
  // (progress is keyed by id). Fresh mode replaces the whole plan, so
  // reusing an id elsewhere is allowed and governed by onIdReuse.
  const dbModule = new Map(current.modules.map((m) => [m.id, m]));
  if (mode === 'update') {
    const conflicts: PackIssue[] = [];
    for (const m of incoming.modules) {
      const db = dbModule.get(m.id);
      if (db && (db.track !== m.track || db.stream !== m.stream)) {
        conflicts.push({
          path: 'modules',
          message: `module '${m.id}' already exists in ${db.track}/${db.stream}; it cannot move to ${m.track}/${m.stream}. Give it a new id.`,
        });
      }
    }
    if (conflicts.length > 0) return { ok: false, errors: conflicts, warnings: v.warnings };
  }

  const counts = { tracks: zero(), streams: zero(), modules: zero() };
  const archived: ArchivedEntity[] = [];

  const dbTracks = new Map(current.tracks.map((t) => [t.id, t]));
  const inTracks = new Set(incoming.tracks.map((t) => t.id));
  const dbStreams = new Map<string, StreamDef>();
  for (const t of current.tracks) for (const s of t.streams) dbStreams.set(`${s.track}/${s.id}`, s);
  const inStreams = new Map<string, StreamDef>();
  for (const t of incoming.tracks) for (const s of t.streams) inStreams.set(`${s.track}/${s.id}`, s);
  const inModules = new Set(incoming.modules.map((m) => m.id));

  for (const t of incoming.tracks) {
    const db = dbTracks.get(t.id);
    if (!db) counts.tracks.added++;
    else if (db.archived) counts.tracks.revived++;
    else counts.tracks[sameTrack(db, t) ? 'unchanged' : 'updated']++;
  }
  for (const t of current.tracks) {
    if (t.kind === 'quran' || t.archived || inTracks.has(t.id)) continue; // the Quran track is never archived
    counts.tracks.archived++;
    archived.push({ kind: 'track', id: t.id, title: t.label, hasProgress: probe.track(t.id) });
  }

  for (const [key, s] of inStreams) {
    const db = dbStreams.get(key);
    if (!db) counts.streams.added++;
    else if (db.archived) counts.streams.revived++;
    else counts.streams[sameStream(db, s) ? 'unchanged' : 'updated']++;
  }
  // Every active stream not in the pack is archived (directly or by its
  // track's cascade); each is listed once.
  for (const [key, s] of dbStreams) {
    if (s.archived || inStreams.has(key)) continue;
    if (dbTracks.get(s.track)?.kind === 'quran') continue;
    counts.streams.archived++;
    archived.push({ kind: 'stream', id: key, title: s.label, hasProgress: probe.stream(s.track, s.id) });
  }

  for (const m of incoming.modules) {
    const db = dbModule.get(m.id);
    if (!db) counts.modules.added++;
    else if (db.archived) counts.modules.revived++;
    else counts.modules[sameModule(db, m) ? 'unchanged' : 'updated']++;
  }
  for (const m of current.modules) {
    if (m.archived || inModules.has(m.id)) continue;
    counts.modules.archived++;
    archived.push({ kind: 'module', id: m.id, title: m.title, hasProgress: probe.module(m.id) });
  }

  // Fresh only: pack module ids that already exist with progress the user may reset.
  const reusedWithProgress: ReusedModule[] =
    mode === 'fresh'
      ? incoming.modules
          .filter((m) => dbModule.has(m.id))
          .map((m) => {
            const db = dbModule.get(m.id)!;
            const ledger = service.ledger();
            const st = service.modules.all().find((s) => s.moduleId === m.id);
            return { id: m.id, title: db.title, creditedMinutes: ledger.creditedOf(m.id), manualComplete: st?.manualComplete === true };
          })
          .filter((r) => r.creditedMinutes > 0 || r.manualComplete)
      : [];

  const currentSettings = service.settings();
  const settingsChanged: string[] = [];
  for (const k of Object.keys(v.settings) as (keyof Settings)[]) {
    if (JSON.stringify(currentSettings[k]) !== JSON.stringify(v.settings[k])) settingsChanged.push(String(k));
  }
  if (currentSettings.quran.enabled !== v.settings.quran.enabled && !settingsChanged.includes('quran.enabled')) {
    settingsChanged.push('quran.enabled');
  }

  const catalogChanged =
    counts.tracks.added + counts.tracks.updated + counts.tracks.revived + counts.tracks.archived +
      counts.streams.added + counts.streams.updated + counts.streams.revived + counts.streams.archived +
      counts.modules.added + counts.modules.updated + counts.modules.revived + counts.modules.archived >
    0;
  const planningChanged = PLANNING_KEYS.some((k) => JSON.stringify(currentSettings[k]) !== JSON.stringify(v.settings[k]));

  // planFloor() would write tracking_start_date on a never-touched DB; preview must not write.
  const stored = service.meta.get(TRACKING_START_KEY);
  const regenerateFrom = stored ? maxDate(service.today(), stored) : service.today();

  return {
    ok: true,
    mode,
    name: v.pack.name,
    warnings: v.warnings,
    counts,
    archived,
    reusedWithProgress,
    settingsChanged,
    regenerates: catalogChanged || planningChanged,
    regenerateFrom,
  };
}

export interface ImportBody {
  pack: unknown;
  mode: ImportMode;
  onIdReuse?: IdReuse;
}

export function commitImport(service: LearningService, body: ImportBody): ImportResult {
  const preview = previewImport(service, body.pack, body.mode);
  if (!preview.ok) throw unprocessable('Invalid plan', { errors: preview.errors, warnings: preview.warnings });
  const v = validatePack(body.pack);
  if (!v.ok) throw unprocessable('Invalid plan', { errors: v.errors, warnings: v.warnings });
  const pack: PlanPack = v.pack;
  const incoming = v.catalog;
  const repo = new CatalogRepo(service.db);
  const nowIso = service.nowIso();

  const backup = service.dbPath !== null && service.dbPath !== ':memory:' ? snapshotDb(service.db, backupDirFor(service.dbPath), 'pre-import') : null;

  transaction(service.db, () => {
    // Freeze past days under the settings and catalog that were in effect.
    service.freezePastDays();

    // Upsert the pack's entities in pack order (the Quran row stays as is
    // when the pack omits it: packToCatalogData prepends the built-in then).
    const packHasQuran = pack.tracks.some((t) => t.kind === 'quran');
    const upsertTracks = packHasQuran ? incoming.tracks : incoming.tracks.slice(1);
    upsertTracks.forEach((t, i) => {
      repo.upsertTrack(t, packHasQuran ? i : i + 1);
      t.streams.forEach((s, j) => repo.upsertStream(s, j));
    });
    incoming.modules.forEach((m, i) => repo.upsertModule(m, i));

    // Archive what the preview listed (cascades are idempotent).
    for (const a of preview.archived) {
      if (a.kind === 'track') repo.archiveTrack(a.id, nowIso);
      else if (a.kind === 'stream') {
        const sep = a.id.indexOf('/');
        repo.archiveStream(a.id.slice(0, sep), a.id.slice(sep + 1), nowIso);
      } else repo.archiveModule(a.id, nowIso);
    }

    // Resources: pack modules' rows and the whole library are rewritten.
    repo.deletePackResources(incoming.modules.map((m) => m.id));
    for (const m of incoming.modules) repo.insertModuleResources(m.id, m.resources);
    repo.insertLibrary(incoming.library);

    // Fresh + reuse: explicit reset clears the module's progress (reset_at).
    if (body.mode === 'fresh' && (body.onIdReuse ?? 'reset') === 'reset') {
      for (const m of preview.reusedWithProgress) service.modules.reset(m.id, nowIso);
    }

    // Catalog reload happens before settings so regeneration plans with the
    // imported data.
    service.reloadCatalog();
    service.applyImportedSettings(v.settings, preview.regenerates);

    repo.recordImport(body.mode, pack.name, JSON.stringify(body.pack), JSON.stringify(preview), nowIso);
  });

  return { preview, backup, regenerated: preview.regenerates };
}
