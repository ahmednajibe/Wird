/**
 * Icon renderer (no new dependencies; playwright-core drives local Edge).
 *
 *   node scripts/gen-icons.mjs            -> finals (committed outputs)
 *   node scripts/gen-icons.mjs --concepts -> concept previews
 *
 * Finals: renders assets/brand/wird.svg (and wird-small.svg for 16/24 px) to
 * assets/brand/png/wird-<size>.png, writes the multi-size ICO
 * assets/brand/wird.ico, and a preview sheet build/brand-preview/
 * final-contact.png (256/64/32/24/16 px, master vs small, light and dark).
 *
 * --concepts: rasterizes every assets/brand/concepts/*.svg at 16/32/64/256 px
 * into build/brand-preview/<name>-<size>.png plus build/brand-preview/
 * contact.png.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const conceptsDir = join(root, 'assets', 'brand', 'concepts');
const brandDir = join(root, 'assets', 'brand');
const pngDir = join(brandDir, 'png');
const outDir = join(root, 'build', 'brand-preview');
const LIGHT_BG = '#F2F5F9';
const DARK_BG = '#05192D';

const SMALL_SIZES = new Set([16, 24]);
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 24, 32, 48, 64, 256];
const CONCEPT_SIZES = [16, 32, 64, 256];
const SHEET_SIZES = [256, 64, 32, 24, 16];

/** Injects width/height so the viewBox SVG fills exactly `size` px. */
function sizedSvg(src, size) {
  return src.replace('<svg', `<svg width="${size}" height="${size}"`);
}

async function renderPng(page, src, size, file) {
  await page.setContent(`<!doctype html><body style="margin:0">${sizedSvg(src, size)}</body>`);
  await page.locator('svg').screenshot({ path: file, omitBackground: true });
  console.log(`wrote ${file}`);
}

/** Contact sheet: rows = size, columns = one entry per {label, src}. */
async function renderSheet(page, entries, sizes, file) {
  const rows = (textColor) =>
    sizes
      .map(
        (size) => `
      <div style="display:flex;align-items:center;gap:40px;padding:14px 0">
        <div style="width:56px;color:${textColor};font:600 18px/1 system-ui">${size}px</div>
        ${entries
          .map(
            ({ label, src }) => `
          <div style="text-align:center">
            ${sizedSvg(src, size)}
            <div style="color:${textColor};font:500 13px/1.6 system-ui;margin-top:8px">${label}</div>
          </div>`,
          )
          .join('')}
      </div>`,
      )
      .join('');
  const sheet = `<!doctype html><body style="margin:0;font-family:system-ui">
    <section style="background:${LIGHT_BG};padding:36px 48px">${rows('#0B1F33')}</section>
    <section style="background:${DARK_BG};padding:36px 48px">${rows('#E6EDF5')}</section>
  </body>`;
  await page.setViewportSize({ width: 1400, height: 2400 });
  await page.setContent(sheet);
  await page.locator('body').screenshot({ path: file });
  console.log(`wrote ${file}`);
}

/** Writes a multi-size ICO: ICONDIR + ICONDIRENTRY records + PNG payloads. */
function writeIco(entries, file) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dirSize = 6 + entries.length * 16;
  let offset = dirSize;
  const dirs = entries.map(({ size, png }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    d.writeUInt8(size === 256 ? 0 : size, 1); // height
    d.writeUInt8(0, 2); // palette
    d.writeUInt8(0, 3); // reserved
    d.writeUInt16LE(1, 4); // planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(png.length, 8); // payload size
    d.writeUInt32LE(offset, 12); // payload offset
    offset += png.length;
    return d;
  });
  writeFileSync(file, Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]));
  console.log(`wrote ${file}`);
}

async function finalsMode() {
  const master = readFileSync(join(brandDir, 'wird.svg'), 'utf8');
  const small = readFileSync(join(brandDir, 'wird-small.svg'), 'utf8');
  const srcFor = (size) => (SMALL_SIZES.has(size) ? small : master);

  mkdirSync(pngDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
    const pngs = new Map();
    for (const size of PNG_SIZES) {
      const file = join(pngDir, `wird-${size}.png`);
      await renderPng(page, srcFor(size), size, file);
      pngs.set(size, readFileSync(file));
    }
    writeIco(
      ICO_SIZES.map((size) => ({ size, png: pngs.get(size) })),
      join(brandDir, 'wird.ico'),
    );
    await renderSheet(
      page,
      [
        { label: 'wird', src: master },
        { label: 'wird-small', src: small },
      ],
      SHEET_SIZES,
      join(outDir, 'final-contact.png'),
    );
  } finally {
    await browser.close();
  }
}

async function conceptsMode() {
  const files = readdirSync(conceptsDir).filter((f) => f.endsWith('.svg')).sort();
  if (files.length === 0) {
    console.error(`No .svg files in ${conceptsDir}`);
    process.exit(1);
  }
  const svgs = files.map((f) => ({ name: basename(f, '.svg'), src: readFileSync(join(conceptsDir, f), 'utf8') }));

  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
    for (const { name, src } of svgs) {
      for (const size of CONCEPT_SIZES) {
        await renderPng(page, src, size, join(outDir, `${name}-${size}.png`));
      }
    }
    await renderSheet(
      page,
      svgs.map(({ name, src }) => ({ label: name.replace(/^wird-/, '').toUpperCase(), src })),
      [256, 64, 32, 16],
      join(outDir, 'contact.png'),
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[2] === '--concepts') {
  await conceptsMode();
} else if (process.argv[2] === undefined) {
  await finalsMode();
} else {
  console.error('Usage: node scripts/gen-icons.mjs [--concepts]');
  process.exit(1);
}
