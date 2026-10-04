/**
 * Linux release packaging. Requires `npm run build:sea` first (on Linux, so
 * build/sea/wird is a Linux binary). Writes only under build/release/:
 *   - Wird-<ver>-linux-x64.tar.gz
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNotices } from './gen-notices.mjs';

if (process.platform !== 'linux') {
  console.error('package:linux must run on Linux (it packages the Linux SEA binary at build/sea/wird).');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'build', 'release');
const stageDir = join(releaseDir, 'stage');
const binFile = join(root, 'build', 'sea', 'wird');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(binFile)) {
  console.error('build/sea/wird is missing; run `npm run build:sea` first.');
  process.exit(1);
}
mkdirSync(releaseDir, { recursive: true });

const stageApp = join(stageDir, `Wird-${version}-linux-x64`);
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageApp, { recursive: true });

generateNotices({ root });
copyFileSync(binFile, join(stageApp, 'wird'));
chmodSync(join(stageApp, 'wird'), 0o755);
copyFileSync(join(root, 'LICENSE'), join(stageApp, 'LICENSE.txt'));
copyFileSync(join(root, 'build', 'notices', 'THIRD_PARTY_NOTICES.txt'), join(stageApp, 'THIRD_PARTY_NOTICES.txt'));
for (const f of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) {
  const p = join(stageApp, f);
  if (!existsSync(p) || statSync(p).size === 0) {
    console.error(`${f} is missing or empty in the staged folder.`);
    process.exit(1);
  }
}
copyFileSync(join(root, 'assets', 'brand', 'png', 'wird-256.png'), join(stageApp, 'wird.png'));
copyFileSync(join(root, 'packaging', 'linux', 'wird.desktop'), join(stageApp, 'wird.desktop'));
copyFileSync(
  join(root, 'packaging', 'linux', 'install-desktop-entry.sh'),
  join(stageApp, 'install-desktop-entry.sh'),
);
chmodSync(join(stageApp, 'install-desktop-entry.sh'), 0o755);
writeFileSync(
  join(stageApp, 'README.txt'),
  [
    'Wird - a local-first daily learning and Quran tracker.',
    '',
    'How to run:',
    '  Extract this archive, then run ./wird in a terminal. Wird opens in your',
    '  browser; keep the terminal window open while you use it, close it to quit.',
    '',
    'Your data:',
    '  Stored in ~/.local/share/wird (or $XDG_DATA_HOME/wird if set).',
    '',
    'Menu entry (optional):',
    '  Run ./install-desktop-entry.sh to add Wird to your app menu.',
    '  ./install-desktop-entry.sh --uninstall removes it again.',
    '',
    'License: MIT, see LICENSE.txt. Third-party notices: THIRD_PARTY_NOTICES.txt.',
    '',
    'Releases: https://github.com/ahmednajibe/Wird/releases',
    '',
  ].join('\n'),
);

// Relative paths: GNU tar parses an absolute archive name with a drive
// letter as a remote host.
const tarName = `Wird-${version}-linux-x64.tar.gz`;
const tarFile = join(releaseDir, tarName);
execFileSync('tar', ['-czf', tarName, '-C', 'stage', `Wird-${version}-linux-x64`], {
  cwd: releaseDir,
  stdio: 'inherit',
});
rmSync(stageDir, { recursive: true, force: true });
console.log(`wrote ${tarFile}`);
