/**
 * Plan catalog persistence: tracks, streams, modules, resources and the
 * import log. `load` reconstructs CatalogData; `insertAll` writes pack data
 * (used by the owner seed now, by the plan-pack importer in phase 3).
 */
import type { DatabaseSync } from 'node:sqlite';
import type { CatalogData, LibraryResource, StreamDef, StreamStyle, TrackDef, TrackKind } from '../shared/catalog.js';
import type { CurriculumModule, ModuleKind, Resource } from '../shared/types.js';

interface TrackRow {
  id: string;
  kind: string;
  label: string;
  short_label: string;
  theme: string;
  icon: string;
  type_labels: string;
  sort_order: number;
  archived_at: string | null;
}

interface StreamRow {
  track_id: string;
  id: string;
  label: string;
  short_label: string;
  style: string;
  warmup_title: string | null;
  light_title: string | null;
  default_drills: string | null;
  theme: string | null;
  icon: string | null;
  sort_order: number;
  archived_at: string | null;
}

interface ModuleRow {
  id: string;
  track_id: string;
  stream_id: string;
  phase_id: string;
  phase_title: string;
  title: string;
  kind: string;
  est_minutes: number;
  estimate_uncertain: number;
  note: string | null;
  warmup_drills: string | null;
  sort_order: number;
  archived_at: string | null;
}

interface ResourceRow {
  id: number;
  module_id: string | null;
  track_id: string | null;
  stream_id: string | null;
  name: string;
  url: string | null;
  owned: number;
  paid: number;
  note: string | null;
  sort_order: number;
}

function toResource(r: ResourceRow): Resource {
  const res: Resource = { name: r.name };
  if (r.url !== null) res.url = r.url;
  if (r.owned) res.owned = true;
  if (r.paid) res.paid = true;
  if (r.note !== null) res.note = r.note;
  return res;
}

export class CatalogRepo {
  constructor(private readonly db: DatabaseSync) {}

  private nextOrder(table: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${table}`).get() as { n: number };
    return row.n;
  }

  /** Loads the whole catalog. Array order = sort_order, which mirrors the imported pack order. */
  load(): CatalogData {
    const trackRows = this.db.prepare('SELECT * FROM plan_tracks ORDER BY sort_order').all() as unknown as TrackRow[];
    const streamRows = this.db
      .prepare('SELECT * FROM plan_streams ORDER BY track_id, sort_order')
      .all() as unknown as StreamRow[];
    const moduleRows = this.db.prepare('SELECT * FROM plan_modules ORDER BY sort_order').all() as unknown as ModuleRow[];
    const moduleResourceRows = this.db
      .prepare('SELECT * FROM plan_resources WHERE module_id IS NOT NULL ORDER BY module_id, sort_order')
      .all() as unknown as ResourceRow[];
    const libraryRows = this.db
      .prepare('SELECT * FROM plan_resources WHERE module_id IS NULL ORDER BY sort_order, id')
      .all() as unknown as ResourceRow[];

    const streamsByTrack = new Map<string, StreamDef[]>();
    for (const s of streamRows) {
      const list = streamsByTrack.get(s.track_id) ?? [];
      list.push({
        track: s.track_id,
        id: s.id,
        label: s.label,
        shortLabel: s.short_label,
        style: s.style as StreamStyle,
        warmupTitle: s.warmup_title,
        lightTitle: s.light_title,
        defaultDrills: s.default_drills,
        theme: s.theme,
        icon: s.icon,
        archived: s.archived_at !== null,
      });
      streamsByTrack.set(s.track_id, list);
    }

    const resourcesByModule = new Map<string, Resource[]>();
    for (const r of moduleResourceRows) {
      const list = resourcesByModule.get(r.module_id as string) ?? [];
      list.push(toResource(r));
      resourcesByModule.set(r.module_id as string, list);
    }

    const tracks: TrackDef[] = trackRows.map((t) => ({
      id: t.id,
      kind: t.kind as TrackKind,
      label: t.label,
      shortLabel: t.short_label,
      theme: t.theme,
      icon: t.icon,
      typeLabels: JSON.parse(t.type_labels) as TrackDef['typeLabels'],
      archived: t.archived_at !== null,
      streams: streamsByTrack.get(t.id) ?? [],
    }));

    const modules: CurriculumModule[] = moduleRows.map((m) => {
      // Key order matches the module literals so serialized output is identical.
      const mod: CurriculumModule = {
        id: m.id,
        track: m.track_id,
        stream: m.stream_id,
        phase: { id: m.phase_id, title: m.phase_title },
        title: m.title,
        ...(m.note !== null ? { note: m.note } : {}),
        resources: resourcesByModule.get(m.id) ?? [],
        estMinutes: m.est_minutes,
        kind: m.kind as ModuleKind,
      };
      if (m.estimate_uncertain === 1) mod.estimateUncertain = true;
      if (m.warmup_drills !== null) mod.warmupDrills = m.warmup_drills;
      if (m.archived_at !== null) mod.archived = true;
      return mod;
    });

    const library: LibraryResource[] = libraryRows.map((r) => ({
      track: r.track_id as string,
      stream: r.stream_id as string,
      ...toResource(r),
    }));

    return { tracks, modules, library };
  }

  /** Inserts pack data, appending after existing sort_order values. */
  insertAll(data: CatalogData, nowIso = new Date().toISOString()): void {
    const trackStmt = this.db.prepare(
      `INSERT INTO plan_tracks (id, kind, label, short_label, theme, icon, type_labels, sort_order, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const streamStmt = this.db.prepare(
      `INSERT INTO plan_streams (track_id, id, label, short_label, style, warmup_title, light_title, default_drills, theme, icon, sort_order, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const moduleStmt = this.db.prepare(
      `INSERT INTO plan_modules (id, track_id, stream_id, phase_id, phase_title, title, kind, est_minutes, estimate_uncertain, note, warmup_drills, sort_order, archived_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const resourceStmt = this.db.prepare(
      `INSERT INTO plan_resources (module_id, track_id, stream_id, name, url, owned, paid, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let trackOrder = this.nextOrder('plan_tracks');
    for (const t of data.tracks) {
      trackStmt.run(
        t.id,
        t.kind,
        t.label,
        t.shortLabel,
        t.theme,
        t.icon,
        JSON.stringify(t.typeLabels),
        trackOrder++,
        t.archived ? nowIso : null,
      );
      t.streams.forEach((s, i) => {
        streamStmt.run(
          t.id,
          s.id,
          s.label,
          s.shortLabel,
          s.style,
          s.warmupTitle,
          s.lightTitle,
          s.defaultDrills,
          s.theme,
          s.icon,
          i,
          s.archived ? nowIso : null,
        );
      });
    }

    let moduleOrder = this.nextOrder('plan_modules');
    for (const m of data.modules) {
      moduleStmt.run(
        m.id,
        m.track,
        m.stream,
        m.phase.id,
        m.phase.title,
        m.title,
        m.kind,
        m.estMinutes,
        m.estimateUncertain ? 1 : 0,
        m.note ?? null,
        m.warmupDrills ?? null,
        moduleOrder++,
        m.archived ? nowIso : null,
      );
      m.resources.forEach((r, i) => {
        resourceStmt.run(m.id, null, null, r.name, r.url ?? null, r.owned ? 1 : 0, r.paid ? 1 : 0, r.note ?? null, i);
      });
    }

    data.library.forEach((r, i) => {
      resourceStmt.run(null, r.track, r.stream, r.name, r.url ?? null, r.owned ? 1 : 0, r.paid ? 1 : 0, r.note ?? null, i);
    });
  }

  // ------------------------------------------------------ import writes

  /** Inserts or fully updates a track; pack entities are always written active. */
  upsertTrack(t: TrackDef, sortOrder: number): void {
    this.db
      .prepare(
        `INSERT INTO plan_tracks (id, kind, label, short_label, theme, icon, type_labels, sort_order, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, label = excluded.label, short_label = excluded.short_label,
           theme = excluded.theme, icon = excluded.icon, type_labels = excluded.type_labels, sort_order = excluded.sort_order,
           archived_at = NULL`,
      )
      .run(t.id, t.kind, t.label, t.shortLabel, t.theme, t.icon, JSON.stringify(t.typeLabels), sortOrder);
  }

  upsertStream(s: StreamDef, sortOrder: number): void {
    this.db
      .prepare(
        `INSERT INTO plan_streams (track_id, id, label, short_label, style, warmup_title, light_title, default_drills, theme, icon, sort_order, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(track_id, id) DO UPDATE SET label = excluded.label, short_label = excluded.short_label,
           style = excluded.style, warmup_title = excluded.warmup_title, light_title = excluded.light_title,
           default_drills = excluded.default_drills, theme = excluded.theme, icon = excluded.icon,
           sort_order = excluded.sort_order, archived_at = NULL`,
      )
      .run(s.track, s.id, s.label, s.shortLabel, s.style, s.warmupTitle, s.lightTitle, s.defaultDrills, s.theme, s.icon, sortOrder);
  }

  upsertModule(m: CurriculumModule, sortOrder: number): void {
    this.db
      .prepare(
        `INSERT INTO plan_modules (id, track_id, stream_id, phase_id, phase_title, title, kind, est_minutes, estimate_uncertain, note, warmup_drills, sort_order, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET track_id = excluded.track_id, stream_id = excluded.stream_id,
           phase_id = excluded.phase_id, phase_title = excluded.phase_title, title = excluded.title, kind = excluded.kind,
           est_minutes = excluded.est_minutes, estimate_uncertain = excluded.estimate_uncertain, note = excluded.note,
           warmup_drills = excluded.warmup_drills, sort_order = excluded.sort_order, archived_at = NULL`,
      )
      .run(m.id, m.track, m.stream, m.phase.id, m.phase.title, m.title, m.kind, m.estMinutes, m.estimateUncertain ? 1 : 0, m.note ?? null, m.warmupDrills ?? null, sortOrder);
  }

  /** Archives a track plus its streams and modules; already-archived rows keep their original timestamp. */
  archiveTrack(id: string, nowIso: string): void {
    this.db.prepare('UPDATE plan_tracks SET archived_at = COALESCE(archived_at, ?) WHERE id = ?').run(nowIso, id);
    this.db.prepare('UPDATE plan_streams SET archived_at = COALESCE(archived_at, ?) WHERE track_id = ?').run(nowIso, id);
    this.db.prepare('UPDATE plan_modules SET archived_at = COALESCE(archived_at, ?) WHERE track_id = ?').run(nowIso, id);
  }

  archiveStream(trackId: string, id: string, nowIso: string): void {
    this.db.prepare('UPDATE plan_streams SET archived_at = COALESCE(archived_at, ?) WHERE track_id = ? AND id = ?').run(nowIso, trackId, id);
    this.db.prepare('UPDATE plan_modules SET archived_at = COALESCE(archived_at, ?) WHERE track_id = ? AND stream_id = ?').run(nowIso, trackId, id);
  }

  archiveModule(id: string, nowIso: string): void {
    this.db.prepare('UPDATE plan_modules SET archived_at = COALESCE(archived_at, ?) WHERE id = ?').run(nowIso, id);
  }

  /** Deletes module resources of the given modules plus every library row. */
  deletePackResources(moduleIds: string[]): void {
    if (moduleIds.length > 0) {
      this.db
        .prepare(`DELETE FROM plan_resources WHERE module_id IN (${moduleIds.map(() => '?').join(',')}) OR module_id IS NULL`)
        .run(...moduleIds);
    } else {
      this.db.exec('DELETE FROM plan_resources WHERE module_id IS NULL');
    }
  }

  insertModuleResources(moduleId: string, resources: Resource[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO plan_resources (module_id, track_id, stream_id, name, url, owned, paid, note, sort_order)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
    );
    resources.forEach((r, i) => stmt.run(moduleId, r.name, r.url ?? null, r.owned ? 1 : 0, r.paid ? 1 : 0, r.note ?? null, i));
  }

  insertLibrary(library: LibraryResource[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO plan_resources (module_id, track_id, stream_id, name, url, owned, paid, note, sort_order)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    library.forEach((r, i) => stmt.run(r.track, r.stream, r.name, r.url ?? null, r.owned ? 1 : 0, r.paid ? 1 : 0, r.note ?? null, i));
  }

  recordImport(mode: 'seed' | 'update' | 'fresh', packName: string | null, packJson: string, summaryJson: string, importedAt: string): void {
    this.db
      .prepare('INSERT INTO plan_imports (imported_at, mode, pack_name, pack_json, summary_json) VALUES (?, ?, ?, ?, ?)')
      .run(importedAt, mode, packName, packJson, summaryJson);
  }

  /** Most recent plan_imports row, if any. */
  latestImport(): { packName: string | null; importedAt: string } | null {
    const row = this.db.prepare('SELECT pack_name, imported_at FROM plan_imports ORDER BY id DESC LIMIT 1').get() as
      | { pack_name: string | null; imported_at: string }
      | undefined;
    return row ? { packName: row.pack_name, importedAt: row.imported_at } : null;
  }
}
