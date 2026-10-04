/**
 * Generates THIRD_PARTY_NOTICES.txt for the release artifacts. Covers the
 * Node.js runtime embedded in the SEA executables, the Tanzil Quran metadata,
 * and every npm package whose code ships in the bundles: all non-dev packages
 * from package-lock.json plus EXTRA (build-time packages whose compiled code
 * lands in dist/web: Tailwind emits its preflight CSS into the stylesheet and
 * Vite injects small runtime helpers into the bundle).
 *
 * Run directly (node scripts/gen-notices.mjs) to write
 * build/notices/THIRD_PARTY_NOTICES.txt; the packaging scripts call
 * generateNotices() before staging.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXTRA = ['tailwindcss', 'vite'];
const LICENSE_FILE_RE = /^(licen[cs]e|copying|notice)(\..*)?$/i;
const RULE = '='.repeat(72);

const lf = (text) => text.replace(/\r\n/g, '\n');

function licenseField(license) {
  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && typeof license.type === 'string') return license.type;
  if (Array.isArray(license)) return license.map(licenseField).join(', ');
  return 'not specified';
}

function packageUrl(pj) {
  if (typeof pj.homepage === 'string') return ['Homepage', pj.homepage];
  const repo = pj.repository;
  const url = typeof repo === 'string' ? repo : repo && typeof repo === 'object' ? repo.url : null;
  return url ? ['Repository', url] : null;
}

/**
 * @param {{ root: string, outFile?: string }} opts
 * @returns {{ packages: number, warnings: string[] }}
 */
export function generateNotices({ root, outFile = join(root, 'build', 'notices', 'THIRD_PARTY_NOTICES.txt') }) {
  const warnings = [];
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const out = [
    `Wird ${version}, Copyright (c) 2026 Ahmed Najibe, MIT license (see LICENSE.txt). Wird includes the third-party components listed below, each under its own license.`,
    '',
  ];

  // Node.js runtime, embedded in the single-executable artifacts. The official
  // distributions keep LICENSE next to node.exe on Windows and one level up
  // from bin/node on POSIX (which is also how actions/setup-node lays it out).
  const execDir = dirname(process.execPath);
  const nodeLicense = [join(execDir, 'LICENSE'), join(execDir, '..', 'LICENSE')].find((p) => existsSync(p));
  if (!nodeLicense) {
    throw new Error(
      `Node.js LICENSE not found at ${join(execDir, 'LICENSE')} or ${join(execDir, '..', 'LICENSE')}; ` +
        'a release must not ship without the Node.js license text.',
    );
  }
  out.push(
    RULE,
    'Node.js',
    RULE,
    '',
    `Node.js ${process.version}. Included in the wird / wird.exe executables.`,
    'License: MIT',
    'Homepage: https://nodejs.org/',
    '',
    lf(readFileSync(nodeLicense, 'utf8')).trim(),
    '',
  );

  // Tanzil Quran metadata, generated into src/shared/quranData.generated.ts.
  const generated = readFileSync(join(root, 'src', 'shared', 'quranData.generated.ts'), 'utf8');
  const attribution = generated
    .split('\n')
    .map((line) => line.match(/^\/\/\s*(Quran metadata:.*)$/)?.[1])
    .find(Boolean);
  out.push(
    RULE,
    'Quran metadata (Tanzil.net)',
    RULE,
    '',
    'Quran metadata (ayah counts, surah names, page and juz boundaries) from Tanzil.net, https://tanzil.net, licensed under Creative Commons Attribution 3.0, https://creativecommons.org/licenses/by/3.0/',
  );
  if (attribution) out.push(`Source attribution: ${attribution}`);
  out.push('', RULE, 'npm packages', RULE, '');

  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entries = [];
  const seen = new Set();
  for (const [key, meta] of Object.entries(lock.packages)) {
    if (key === '') continue;
    const name = key.split('node_modules/').pop();
    if (meta.dev && !EXTRA.includes(name)) continue;
    const id = `${name}@${meta.version}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const dir = join(root, key);
    const pjFile = join(dir, 'package.json');
    if (!existsSync(pjFile)) {
      warnings.push(`${id}: in package-lock.json but not installed, skipped.`);
      continue;
    }
    const pj = JSON.parse(readFileSync(pjFile, 'utf8'));
    const license = licenseField(pj.license);
    const lines = [`${pj.name ?? name}@${pj.version ?? meta.version}`, `License: ${license}`];
    const url = packageUrl(pj);
    if (url) lines.push(`${url[0]}: ${url[1]}`);
    const texts = [
      ...new Set(
        readdirSync(dir)
          .filter((f) => LICENSE_FILE_RE.test(f))
          .sort()
          .map((f) => lf(readFileSync(join(dir, f), 'utf8')).trim()),
      ),
    ];
    if (texts.length === 0) {
      lines.push('', `No license file in the package; license: ${license}`);
      warnings.push(`${id}: no license file in the package.`);
    } else {
      lines.push('', ...texts);
    }
    entries.push({ name: pj.name ?? name, version: pj.version ?? meta.version, lines });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  out.push(entries.map((e) => e.lines.join('\n')).join(`\n${RULE}\n`), '');

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, out.join('\n'));
  for (const w of warnings) console.warn(`warning: ${w}`);
  return { packages: entries.length, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { packages } = generateNotices({ root });
  console.log(`wrote build/notices/THIRD_PARTY_NOTICES.txt (${packages} packages)`);
}
