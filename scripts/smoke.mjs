/**
 * Release smoke test: run a Wird executable (or `node wird.cjs`) against a
 * throwaway data dir and assert the HTTP surface answers correctly.
 *
 *   node scripts/smoke.mjs [--cwd DIR] <command> [args...]
 *
 * Never touches the real data folder: LEARNING_DB_PATH is stripped from the
 * child's environment and LEARNING_DATA_DIR points at a fresh mkdtemp dir.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
let cwd = process.cwd();
if (argv[0] === '--cwd') {
  cwd = resolve(argv[1]);
  argv.splice(0, 2);
}
if (argv.length === 0) {
  console.error('usage: node scripts/smoke.mjs [--cwd DIR] <command> [args...]');
  process.exit(1);
}
const [command, ...args] = argv;

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.once('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

// Minimal example pack: first ```json block after the "Minimal example"
// heading in PLAN_PROMPT.md.
function minimalPack() {
  const md = readFileSync(join(root, 'PLAN_PROMPT.md'), 'utf8');
  const heading = md.indexOf('Minimal example');
  if (heading < 0) throw new Error('could not find "Minimal example" in PLAN_PROMPT.md');
  const start = md.indexOf('```json', heading);
  const end = md.indexOf('```', start + 7);
  if (start < 0 || end < 0) throw new Error('could not extract the minimal example JSON block');
  return JSON.parse(md.slice(start + 7, end));
}

const port = await freePort();
const dataDir = mkdtempSync(join(tmpdir(), 'wird-smoke-'));

const env = { ...process.env };
delete env.LEARNING_DB_PATH;
env.LEARNING_DATA_DIR = dataDir;
env.PORT = String(port);

let out = '';
const child = spawn(command, [...args, '--no-browser'], {
  cwd,
  env,
  detached: process.platform !== 'win32',
  windowsHide: true,
});
child.stdout.on('data', (d) => (out += d));
child.stderr.on('data', (d) => (out += d));
let childExited = false;
child.once('exit', () => (childExited = true));

function killChild() {
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        process.kill(child.pid, 'SIGTERM');
      }
    }
  } catch {
    /* already gone */
  }
}

async function waitExit(ms) {
  const t0 = Date.now();
  while (!childExited && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
}

const norm = (p) => {
  const s = resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};

async function get(pathname) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return { status: res.status, body: await res.text() };
}

const checks = [];
function check(name, ok, detail = '') {
  if (!ok) throw new Error(`${name} failed ${detail}`);
  checks.push(`PASS ${name}`);
}

let error = null;
try {
  // Poll /api/health for up to 30 s.
  let health = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (childExited) break;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) {
        health = await res.json();
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (childExited) throw new Error('child exited before /api/health answered');
  check('/api/health answers', !!health, '(no response within 30 s)');
  check('health app', health.app === 'wird', `(got ${JSON.stringify(health.app)})`);
  check('health version', health.version === version, `(got ${health.version}, want ${version})`);
  check(
    'health dataDir',
    typeof health.dataDir === 'string' && norm(health.dataDir) === norm(dataDir),
    `(got ${health.dataDir}, want ${dataDir})`,
  );

  const index = await get('/');
  check('GET /', index.status === 200 && index.body.includes('<title>Wird</title>'), `(status ${index.status})`);

  const prompt = await get('/api/plan-prompt');
  check('GET /api/plan-prompt', prompt.status === 200 && prompt.body.trim().length > 0, `(status ${prompt.status})`);

  const pack = minimalPack();
  const preview = await fetch(`http://127.0.0.1:${port}/api/import/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pack, mode: 'fresh' }),
  });
  const previewBody = await preview.json().catch(() => ({}));
  check('POST /api/import/preview', preview.status === 200 && previewBody.ok === true, `(status ${preview.status}, body ${JSON.stringify(previewBody).slice(0, 300)})`);

  check('startup banner', out.includes('Wird is running at'), '');
} catch (e) {
  error = e;
} finally {
  killChild();
  await waitExit(10000);
  rmSync(dataDir, { recursive: true, force: true });
}

if (error) {
  console.error(`FAIL: ${error.message}`);
  if (out.trim()) console.error(`--- child output ---\n${out.trim()}\n--------------------`);
  process.exit(1);
}
for (const line of checks) console.log(line);
console.log(`smoke OK on port ${port}`);
process.exit(0);
