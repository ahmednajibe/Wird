/**
 * Asset access behind a small interface, so the packaged binary can serve the
 * SPA and docs from the SEA blob while the dev server reads them from disk.
 *
 * Logical paths: 'web/<rel>' for the built SPA ('web/index.html',
 * 'web/assets/app.js') and anything else ('PLAN_PROMPT.md') for repo-root
 * files.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';

export interface AssetSource {
  /** File contents, or null when the path is missing or not allowed. */
  read(path: string): Uint8Array<ArrayBuffer> | null;
}

/**
 * Normalizes a logical asset path to forward slashes, or returns null when it
 * contains '.', '..' or empty segments (callers never have to worry about
 * traversal themselves).
 */
export function normalizeAssetPath(rel: string): string | null {
  const parts = rel.replace(/\\/g, '/').split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return parts.join('/');
}

/** Reads 'web/…' from `webDir` and every other path from `rootDir`. */
export function diskAssets({ webDir, rootDir }: { webDir: string; rootDir: string }): AssetSource {
  return {
    read(logical) {
      const norm = normalizeAssetPath(logical);
      if (!norm) return null;
      const underWeb = norm === 'web' || norm.startsWith('web/');
      const root = underWeb ? webDir : rootDir;
      const sub = underWeb ? norm.slice(4) : norm;
      if (sub === '') return null;
      const target = normalize(join(root, sub));
      const inside = target === root || target.startsWith(root + sep);
      if (!inside || !existsSync(target) || !statSync(target).isFile()) return null;
      return readFileSync(target) as Uint8Array<ArrayBuffer>;
    },
  };
}
