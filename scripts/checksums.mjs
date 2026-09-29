/**
 * Writes build/release/SHA256SUMS.txt: sha256 of every file in build/release
 * (except SHA256SUMS.txt itself), one "<hex>  <name>" line each, sorted.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'build', 'release');
const outFile = join(releaseDir, 'SHA256SUMS.txt');

const lines = readdirSync(releaseDir)
  .filter((name) => name !== 'SHA256SUMS.txt' && statSync(join(releaseDir, name)).isFile())
  .sort()
  .map((name) => {
    const hex = createHash('sha256').update(readFileSync(join(releaseDir, name))).digest('hex');
    return `${hex}  ${name}`;
  });

writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`wrote ${outFile} (${lines.length} entries)`);
