/**
 * Linux release packaging. Requires `npm run build:sea` first (on Linux, so
 * build/sea/wird is a Linux binary). Writes only under build/release/:
 *   - Wird-<ver>-linux-x64.tar.gz
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

copyFileSync(binFile, join(stageApp, 'wird'));
chmodSync(join(stageApp, 'wird'), 0o755);
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
    'Releases: https://github.com/ahmednajibe/Wird/releases',
    '',
  ].join('\n'),
);

const tarFile = join(releaseDir, `Wird-${version}-linux-x64.tar.gz`);
execFileSync('tar', ['-czf', tarFile, '-C', stageDir, `Wird-${version}-linux-x64`], {
  stdio: 'inherit',
});
rmSync(stageDir, { recursive: true, force: true });
console.log(`wrote ${tarFile}`);
