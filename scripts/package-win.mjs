/**
 * Windows release packaging. Requires `npm run build:sea` first.
 * Writes only under build/release/:
 *   - Wird-<ver>-win-x64-portable.zip (Wird\wird.exe + portable marker + README)
 *   - Wird-<ver>-win-x64-setup.exe   (Inno Setup, per-user, no admin)
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateNotices } from './gen-notices.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'build', 'release');
const stageDir = join(releaseDir, 'stage');
const exeFile = join(root, 'build', 'sea', 'wird.exe');
const issFile = join(root, 'packaging', 'windows', 'wird.iss');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

if (!existsSync(exeFile)) {
  console.error('build/sea/wird.exe is missing; run `npm run build:sea` first.');
  process.exit(1);
}
mkdirSync(releaseDir, { recursive: true });

// License texts shipped in every artifact.
const licenseFile = join(root, 'LICENSE');
const noticesFile = join(root, 'build', 'notices', 'THIRD_PARTY_NOTICES.txt');
generateNotices({ root, outFile: noticesFile });

// 1. Portable zip: Wird\wird.exe + `portable` marker + README.txt.
const stageApp = join(stageDir, 'Wird');
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stageApp, { recursive: true });
copyFileSync(exeFile, join(stageApp, 'wird.exe'));
copyFileSync(licenseFile, join(stageApp, 'LICENSE.txt'));
copyFileSync(noticesFile, join(stageApp, 'THIRD_PARTY_NOTICES.txt'));
for (const f of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) {
  const p = join(stageApp, f);
  if (!existsSync(p) || statSync(p).size === 0) {
    console.error(`${f} is missing or empty in the staged folder.`);
    process.exit(1);
  }
}
writeFileSync(join(stageApp, 'portable'), '');
writeFileSync(
  join(stageApp, 'README.txt'),
  [
    'Wird - a local-first daily learning and Quran tracker.',
    '',
    'How to run:',
    '  Double-click wird.exe. A small window opens the app in your browser;',
    '  keep it open while you use Wird, close it to quit.',
    '',
    'Your data:',
    '  The empty file named "portable" next to wird.exe keeps your data in the',
    '  "data" folder inside this Wird folder. Delete that file (or use the',
    '  installer instead) and Wird keeps your data in %LOCALAPPDATA%\\Wird.',
    '',
    'Windows SmartScreen may warn about an unrecognized app. Click',
    '"More info", then "Run anyway".',
    '',
    'License: MIT, see LICENSE.txt. Third-party notices: THIRD_PARTY_NOTICES.txt.',
    '',
    'Releases: https://github.com/ahmednajibe/Wird/releases',
    '',
  ].join('\r\n'),
);
const zipFile = join(releaseDir, `Wird-${version}-win-x64-portable.zip`);
execFileSync(
  'powershell',
  ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${stageApp}' -DestinationPath '${zipFile}' -Force`],
  { stdio: 'inherit' },
);
rmSync(stageDir, { recursive: true, force: true });
console.log(`wrote ${zipFile}`);

// 2. Installer via Inno Setup 6.
const candidates = [
  process.env.ISCC,
  join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
].filter(Boolean);
const iscc = candidates.find((p) => existsSync(p));
if (!iscc) {
  console.error('Inno Setup 6 (ISCC.exe) not found. Install it (winget install JRSoftware.InnoSetup) or set ISCC.');
  process.exit(1);
}
execFileSync(
  iscc,
  [
    `/DAppVersion=${version}`,
    `/DSourceExe=${resolve(exeFile)}`,
    `/DSourceLicense=${resolve(licenseFile)}`,
    `/DSourceNotices=${resolve(noticesFile)}`,
    `/O${resolve(releaseDir)}`,
    issFile,
  ],
  { stdio: 'inherit' },
);
console.log('Packaging done.');
