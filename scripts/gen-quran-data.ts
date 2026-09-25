/**
 * Generates src/shared/quranData.generated.ts from Tanzil's quran-data.js
 * (Tanzil.net, Creative Commons Attribution 3.0).
 *
 * Usage:
 *   curl -sSL -o scripts/.cache/quran-data.js https://tanzil.net/res/text/metadata/quran-data.js
 *   npm run gen:quran            (or: npx tsx scripts/gen-quran-data.ts [path/to/quran-data.js])
 *
 * The app never fetches this data at runtime; the generated file is committed.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = resolve(process.argv[2] ?? join(root, 'scripts', '.cache', 'quran-data.js'));
const output = join(root, 'src', 'shared', 'quranData.generated.ts');

if (!existsSync(input)) {
  console.error(`Missing ${input}. Download it first:\n  curl -sSL -o scripts/.cache/quran-data.js https://tanzil.net/res/text/metadata/quran-data.js`);
  process.exit(1);
}

type SuraRow = [number, number, number, number, string, string, string, string];
interface Tanzil {
  Sura: (SuraRow | [])[];
  Page: ([number, number] | [])[];
  Juz: ([number, number] | [])[];
}

const sandbox: { QuranData?: Tanzil } = {};
// The file declares `var QuranData = {}` and assigns properties; evaluate it in isolation.
runInNewContext(`${readFileSync(input, 'utf8')}\nthis.QuranData = QuranData;`, sandbox, { timeout: 2000 });
const data = sandbox.QuranData;
if (!data) throw new Error('QuranData not found in input');

const suras = data.Sura.slice(1, 115) as SuraRow[];
if (suras.length !== 114) throw new Error(`Expected 114 suras, got ${suras.length}`);
const ayahCounts = suras.map((s) => s[1]);
const namesAr = suras.map((s) => s[4]);
const totalAyahs = ayahCounts.reduce((a, b) => a + b, 0);
if (totalAyahs !== 6236) throw new Error(`Expected 6236 ayahs, got ${totalAyahs}`);

const pages = data.Page.slice(1, 605) as [number, number][];
if (pages.length !== 604) throw new Error(`Expected 604 pages, got ${pages.length}`);
const juz = data.Juz.slice(1, 31) as [number, number][];
if (juz.length !== 30) throw new Error(`Expected 30 juz, got ${juz.length}`);

const fmt = (rows: readonly (readonly number[])[], perLine: number): string => {
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += perLine) {
    lines.push('  ' + rows.slice(i, i + perLine).map((r) => `[${r.join(', ')}]`).join(', ') + ',');
  }
  return lines.join('\n');
};
const fmtNums = (nums: readonly number[], perLine: number): string => {
  const lines: string[] = [];
  for (let i = 0; i < nums.length; i += perLine) lines.push('  ' + nums.slice(i, i + perLine).join(', ') + ',');
  return lines.join('\n');
};

const out = `// GENERATED FILE - do not edit by hand. Regenerate with: npm run gen:quran
// Source: Tanzil Quran metadata (quran-data.js), https://tanzil.net
// Quran metadata: Tanzil.net (CC BY 3.0) - https://creativecommons.org/licenses/by/3.0/

export const QURAN_ATTRIBUTION = 'Quran metadata: Tanzil.net (CC BY 3.0)';

/** Number of ayahs per surah, index 0 = surah 1. Total ${totalAyahs}. */
export const SURAH_AYAH_COUNTS: readonly number[] = [
${fmtNums(ayahCounts, 20)}
];

/** Arabic surah names, index 0 = surah 1. */
export const SURAH_NAMES_AR: readonly string[] = [
${namesAr.map((n) => `  ${JSON.stringify(n)},`).join('\n')}
];

/** [surah, ayah] at the start of each Madani page, index 0 = page 1. */
export const PAGE_STARTS: readonly (readonly [number, number])[] = [
${fmt(pages, 10)}
];

/** [surah, ayah] at the start of each juz, index 0 = juz 1. */
export const JUZ_STARTS: readonly (readonly [number, number])[] = [
${fmt(juz, 10)}
];
`;

writeFileSync(output, out, 'utf8');
console.log(`Wrote ${output} (${pages.length} pages, ${suras.length} surahs, ${totalAyahs} ayahs, ${juz.length} juz)`);
