/**
 * Asset access from the SEA binary. The keys are the same logical paths as
 * diskAssets: 'web/<rel>' for the built SPA and 'PLAN_PROMPT.md'.
 */
import { getAsset, isSea } from 'node:sea';
import { normalizeAssetPath, type AssetSource } from './assets.js';

/** True when running inside the single-executable build. */
export function isPackaged(): boolean {
  return isSea();
}

export function embeddedAssets(): AssetSource {
  return {
    read(path) {
      const norm = normalizeAssetPath(path);
      if (!norm) return null;
      try {
        return new Uint8Array(getAsset(norm));
      } catch {
        return null;
      }
    },
  };
}
