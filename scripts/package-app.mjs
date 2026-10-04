/**
 * Cross-platform "app" artifact: the bundled server + web assets without a
 * binary. Runs as `node wird.cjs` on any Node 24.20.0 install (used by the
 * macOS install script, which downloads its own Node runtime).
 * Writes only under build/release/:
 *   - Wird-<ver>-app.tar.gz (wird.cjs + dist/web/ + PLAN_PROMPT.md + README.txt)
 */
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNotices } from './gen-notices.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'build', 'release');
const stageDir = join(releaseDir, 'stage');
const bundleFile = join(root, 'build', 'sea', 'wird.cjs');
const webDir = join(root, 'dist', 'web');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(bundleFile)) {
  console.error('build/sea/wird.cjs is missing; run `npm run build:sea` first.');
  process.exit(1);
}
if (!existsSync(join(webDir, 'index.html'))) {
  console.error('dist/web/index.html is missing; run `npm run build` first.');
  process.exit(1);
}
mkdirSync(releaseDir, { recursive: true });

const stageApp = join(stageDir, `Wird-${version}-app`);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageApp, { recursive: true });

copyFileSync(bundleFile, join(stageApp, 'wird.cjs'));
cpSync(webDir, join(stageApp, 'dist', 'web'), { recursive: true });
copyFileSync(join(root, 'PLAN_PROMPT.md'), join(stageApp, 'PLAN_PROMPT.md'));
generateNotices({ root });
copyFileSync(join(root, 'LICENSE'), join(stageApp, 'LICENSE.txt'));
copyFileSync(join(root, 'build', 'notices', 'THIRD_PARTY_NOTICES.txt'), join(stageApp, 'THIRD_PARTY_NOTICES.txt'));
for (const f of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) {
  const p = join(stageApp, f);
  if (!existsSync(p) || statSync(p).size === 0) {
    console.error(`${f} is missing or empty in the staged folder.`);
    process.exit(1);
  }
}
writeFileSync(
  join(stageApp, 'README.txt'),
  [
    'Wird - a local-first daily learning and Quran tracker.',
    '',
    'How to run:',
    '  node wird.cjs',
    '  (requires Node.js 24.20.0 or newer)',
    '',
    'Your data:',
    '  Stored in your per-user data folder (~/.local/share/wird on Linux,',
    '  ~/Library/Application Support/Wird on macOS, %LOCALAPPDATA%\\Wird on',
    '  Windows).',
    '',
    'License: MIT, see LICENSE.txt. Third-party notices: THIRD_PARTY_NOTICES.txt.',
    '',
    'Releases: https://github.com/ahmednajibe/Wird/releases',
    '',
  ].join('\n'),
);

// Relative paths: GNU tar parses a "D:\..." archive name as a remote host.
const tarName = `Wird-${version}-app.tar.gz`;
const tarFile = join(releaseDir, tarName);
execFileSync('tar', ['-czf', tarName, '-C', 'stage', `Wird-${version}-app`], {
  cwd: releaseDir,
  stdio: 'inherit',
});
rmSync(stageDir, { recursive: true, force: true });
console.log(`wrote ${tarFile}`);
