/**
 * scripts/gen-notices.mjs: THIRD_PARTY_NOTICES.txt must cover the Node.js
 * runtime, the Tanzil Quran metadata, and every shipped npm package (runtime
 * deps plus the EXTRA build-time packages), and nothing else.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface GenerateNoticesResult {
  packages: number;
  warnings: string[];
}
type GenerateNotices = (opts: { root: string; outFile?: string }) => GenerateNoticesResult;

const root = join(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'notices-test-'));
const outFile = join(dir, 'THIRD_PARTY_NOTICES.txt');

let text = '';
let result: GenerateNoticesResult = { packages: 0, warnings: [] };

beforeAll(async () => {
  const url = new URL('../scripts/gen-notices.mjs', import.meta.url).href;
  const { generateNotices } = (await import(url)) as { generateNotices: GenerateNotices };
  result = generateNotices({ root, outFile });
  text = readFileSync(outFile, 'utf8');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('gen-notices', () => {
  it('writes the header and the Node.js runtime section', () => {
    expect(text).toContain('MIT');
    expect(text).toContain('Copyright (c) 2026 Ahmed Najibe');
    expect(text).toContain('Node.js');
    expect(text).toContain(process.version);
    expect(text).toContain('Included in the wird / wird.exe executables.');
  });

  it('writes the Tanzil attribution with the CC BY 3.0 license URL', () => {
    expect(text).toContain('Tanzil.net');
    expect(text).toContain('https://creativecommons.org/licenses/by/3.0/');
  });

  it('lists every runtime package plus the EXTRA build-time packages', () => {
    expect(result.packages).toBeGreaterThan(0);
    for (const entry of ['react@', 'hono@', 'zod@', '@fontsource/amiri@', 'tailwindcss@', 'vite@']) {
      expect(text).toContain(entry);
    }
    expect(text).toContain('SIL Open Font License');
  });

  it('omits every dev dependency that is not in EXTRA', () => {
    const EXTRA = ['tailwindcss', 'vite'];
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { dev?: boolean; version?: string }>;
    };
    const lines = text.split('\n');
    for (const [key, meta] of Object.entries(lock.packages)) {
      if (key === '' || !meta.dev) continue;
      const name = key.split('node_modules/').pop() as string;
      if (EXTRA.includes(name)) continue;
      expect(
        lines.some((line) => line.startsWith(`${name}@`)),
        `dev package ${name} must not appear`,
      ).toBe(false);
    }
    expect(text).not.toContain('vitest@');
    expect(text).not.toContain('typescript@');
  });

  it('uses LF line endings and no em or en dashes in its own lines', () => {
    expect(text).not.toContain('\r');
    const ownLines = text.split('\n').filter(
      (line) =>
        line.startsWith('Wird ') ||
        line.startsWith('License:') ||
        line.startsWith('No license file') ||
        line.startsWith('Homepage:') ||
        line.startsWith('Repository:') ||
        line.includes(process.version) ||
        line.includes('creativecommons.org/licenses/by/3.0') ||
        /^=+$/.test(line) ||
        /^(Node\.js|Quran metadata \(Tanzil\.net\)|npm packages)$/.test(line),
    );
    expect(ownLines.length).toBeGreaterThan(0);
    for (const line of ownLines) {
      expect(line).not.toMatch(/[–—]/);
    }
  });
});
