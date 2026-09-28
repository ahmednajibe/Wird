/**
 * Seeds the plan tables with the owner catalog. Runs inside migration 4 for
 * existing databases and is reused by tests and scripts/e2e.ts.
 */
import type { DatabaseSync } from 'node:sqlite';
import { CatalogRepo } from '../repoCatalog.js';
import { OWNER_CATALOG_DATA, OWNER_WEEKLY_TEMPLATE } from './ownerCatalog.js';

/**
 * Inserts the owner catalog (skipping tracks already present, such as the
 * built-in Quran track), records the import, and makes sure the stored
 * settings carry the owner weekly template: added only when the stored JSON
 * has no weeklyTemplate key.
 */
export function seedOwnerPlan(db: DatabaseSync, nowIso = new Date().toISOString()): void {
  const present = new Set((db.prepare('SELECT id FROM plan_tracks').all() as { id: string }[]).map((r) => r.id));
  new CatalogRepo(db).insertAll(
    {
      tracks: OWNER_CATALOG_DATA.tracks.filter((t) => !present.has(t.id)),
      modules: OWNER_CATALOG_DATA.modules,
      library: OWNER_CATALOG_DATA.library,
    },
    nowIso,
  );
  db.prepare(
    `INSERT INTO plan_imports (imported_at, mode, pack_name, pack_json, summary_json) VALUES (?, 'seed', 'Owner plan (migrated)', ?, '{}')`,
  ).run(nowIso, JSON.stringify(OWNER_CATALOG_DATA));

  const row = db.prepare('SELECT json FROM settings WHERE id = 1').get() as { json: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO settings (id, json, updated_at) VALUES (1, ?, ?)').run(
      JSON.stringify({ weeklyTemplate: OWNER_WEEKLY_TEMPLATE }),
      nowIso,
    );
    return;
  }
  const json = JSON.parse(row.json) as Record<string, unknown>;
  if (json && typeof json === 'object' && !('weeklyTemplate' in json)) {
    json.weeklyTemplate = OWNER_WEEKLY_TEMPLATE;
    db.prepare('UPDATE settings SET json = ?, updated_at = ? WHERE id = 1').run(JSON.stringify(json), nowIso);
  }
}
