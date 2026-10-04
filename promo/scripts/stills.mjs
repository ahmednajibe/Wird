// Render a few frames of the promo as PNGs for a quick visual check.
// Usage: node scripts/stills.mjs 60 150 306 ...   (frames of WirdPromo)
//        node scripts/stills.mjs --comp scene-week 40 120
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let comp = 'WirdPromo';
const ci = args.indexOf('--comp');
if (ci >= 0) {
  comp = args[ci + 1];
  args.splice(ci, 2);
}
const frames = args.map(Number);

const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
const composition = await selectComposition({ serveUrl, id: comp });
for (const frame of frames) {
  const output = path.join(root, 'out', `still-${comp}-${frame}.png`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: 'png' });
  console.log(output);
}
