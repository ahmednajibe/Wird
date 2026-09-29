/**
 * Builds the Wird single executable (SEA):
 *   src/server/desktop.ts -> esbuild CJS bundle -> SEA blob -> injected node.exe
 * Everything is written under build/sea/. Run via `npm run build:sea` so
 * dist/web is always fresh.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { inject } from 'postject';
import * as resedit from 'resedit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build', 'sea');
const distWeb = join(root, 'dist', 'web');
const bundleFile = join(outDir, 'wird.cjs');
const blobFile = join(outDir, 'sea-prep.blob');
const exeFile = join(outDir, process.platform === 'win32' ? 'wird.exe' : 'wird');
const configFile = join(outDir, 'sea-config.json');

const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
if (process.version !== `v${nvmrc}`) {
  console.error(`build:sea must run on Node ${nvmrc} (this is ${process.version}); the blob must match the binary.`);
  process.exit(1);
}
if (!existsSync(join(distWeb, 'index.html'))) {
  console.error('dist/web/index.html is missing; run `npm run build` first.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

/** Replaces the copied Node icon and version info with Wird's branding. */
function stampWindowsMetadata(exeFile, icoFile, version) {
  const exe = resedit.NtExecutable.from(readFileSync(exeFile), { ignoreCert: true });
  const res = resedit.NtExecutableResource.from(exe);

  const iconFile = resedit.Data.IconFile.from(readFileSync(icoFile));
  const group = resedit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  resedit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    group?.id ?? 1,
    group?.lang ?? 1033,
    iconFile.icons.map((i) => i.data),
  );

  const [major, minor, patch] = version.split('.').map(Number);
  const translation = { lang: 1033, codepage: 1200 };
  for (const vi of resedit.Resource.VersionInfo.fromEntries(res.entries)) {
    vi.setStringValues(translation, {
      ProductName: 'Wird',
      FileDescription: 'Wird',
      CompanyName: 'Wird',
      LegalCopyright: 'Wird contributors',
      OriginalFilename: 'wird.exe',
      InternalName: 'wird',
      FileVersion: `${version}.0`,
      ProductVersion: `${version}.0`,
    });
    vi.setFileVersion(major, minor, patch, 0);
    vi.setProductVersion(major, minor, patch, 0);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exe);
  writeFileSync(exeFile, Buffer.from(exe.generate()));
  console.log('Stamped icon and version info');
}

// 1. Bundle the desktop entry point into a single CJS file.
await build({
  entryPoints: [join(root, 'src', 'server', 'desktop.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: bundleFile,
  minify: false,
  legalComments: 'none',
  define: { __WIRD_VERSION__: JSON.stringify(version) },
  logLevel: 'warning',
});
console.log(`Bundled ${relative(root, bundleFile)}`);

// 2. SEA config: embed the SPA (as 'web/<rel>') and PLAN_PROMPT.md.
/** @returns {string[]} relative paths of every file under dir, forward slashes. */
function walk(dir, base = dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split('\\').join('/'));
  }
  return out;
}
const assets = { 'PLAN_PROMPT.md': join(root, 'PLAN_PROMPT.md') };
for (const rel of walk(distWeb)) assets[`web/${rel}`] = join(distWeb, rel);

const config = {
  main: bundleFile,
  output: blobFile,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  assets,
};
writeFileSync(configFile, JSON.stringify(config, null, 2));
console.log(`SEA config: ${Object.keys(assets).length} assets`);

// 3. Generate the blob with the same Node binary that will host it.
execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' });

// 4. Copy the runtime and inject the blob.
cpSync(process.execPath, exeFile);

if (process.platform === 'darwin') {
  execFileSync('codesign', ['--remove-signature', exeFile], { stdio: 'inherit' });
}
await inject(exeFile, 'NODE_SEA_BLOB', readFileSync(blobFile), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  machoSegmentName: 'NODE_SEA',
});
// Windows metadata (icon, version info, product name). Stamped AFTER the blob
// injection: postject fails to parse the relocation table of a
// resedit-rewritten binary ('Relocation corrupted'), and the SEA blob lives in
// its own section, so the order does not affect either payload.
if (process.platform === 'win32') {
  stampWindowsMetadata(exeFile, join(root, 'assets', 'brand', 'wird.ico'), version);
}
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--sign', '-', exeFile], { stdio: 'inherit' });
}
if (process.platform !== 'win32') chmodSync(exeFile, 0o755);

const size = (statSync(exeFile).size / 1024 / 1024).toFixed(1);
console.log(`Built ${exeFile} (${size} MB)`);
