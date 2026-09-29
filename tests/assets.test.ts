/**
 * Asset source: normalizeAssetPath + diskAssets ('web/…' under webDir,
 * everything else under rootDir, traversal and missing files -> null).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diskAssets, normalizeAssetPath } from '../src/server/assets.js';

const dir = mkdtempSync(join(tmpdir(), 'assets-test-'));
const webDir = join(dir, 'web');
mkdirSync(join(webDir, 'assets'), { recursive: true });
writeFileSync(join(webDir, 'index.html'), '<html>IDX</html>');
writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(dir, 'PLAN_PROMPT.md'), '# prompt');
const assets = diskAssets({ webDir, rootDir: dir });

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('normalizeAssetPath', () => {
  it('accepts simple forward-slash paths', () => {
    expect(normalizeAssetPath('web/index.html')).toBe('web/index.html');
    expect(normalizeAssetPath('PLAN_PROMPT.md')).toBe('PLAN_PROMPT.md');
    expect(normalizeAssetPath('web\\assets\\app.js')).toBe('web/assets/app.js');
  });
  it('rejects traversal and empty segments', () => {
    expect(normalizeAssetPath('../x')).toBeNull();
    expect(normalizeAssetPath('web/../x')).toBeNull();
    expect(normalizeAssetPath('web/../../etc/passwd')).toBeNull();
    expect(normalizeAssetPath('a/./b')).toBeNull();
    expect(normalizeAssetPath('web//x')).toBeNull();
    expect(normalizeAssetPath('/web/x')).toBeNull();
    expect(normalizeAssetPath('web/')).toBeNull();
  });
});

describe('diskAssets', () => {
  it('reads web files from webDir', () => {
    expect(assets.read('web/index.html')?.toString()).toBe('<html>IDX</html>');
    expect(assets.read('web/assets/app.js')?.toString()).toBe('console.log(1)');
  });
  it('reads other files from rootDir', () => {
    expect(assets.read('PLAN_PROMPT.md')?.toString()).toBe('# prompt');
  });
  it('returns null for missing paths', () => {
    expect(assets.read('web/missing.js')).toBeNull();
    expect(assets.read('nope.md')).toBeNull();
    expect(assets.read('web')).toBeNull();
  });
  it('returns null for traversal attempts', () => {
    expect(assets.read('web/../PLAN_PROMPT.md')).toBeNull();
    expect(assets.read('../x')).toBeNull();
    expect(assets.read('web/../../outside.txt')).toBeNull();
  });
});
