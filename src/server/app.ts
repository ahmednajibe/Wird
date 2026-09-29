/**
 * Hono application factory: mounts the API and (when present) the built web UI.
 */
import { extname, join, resolve } from 'node:path';
import { Hono } from 'hono';
import { diskAssets, type AssetSource } from './assets.js';
import { openDb, type Db } from './db.js';
import { ApiError } from './errors.js';
import { apiRoutes } from './routes.js';
import { localOnly } from './security.js';
import { LearningService, systemClock, type Clock } from './service.js';

export interface AppOptions {
  db?: Db;
  dbPath?: string;
  clock?: Clock;
  /** Directory with the built SPA (defaults to dist/web under cwd). */
  webDir?: string;
  /** Asset source for the SPA and docs (defaults to disk under webDir + cwd). */
  assets?: AssetSource;
  /** Reported by /api/health (defaults to the npm package version). */
  version?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function createApp(options: AppOptions = {}): { app: Hono; service: LearningService; db: Db } {
  const dbPath = options.dbPath ?? (options.db ? null : join(process.cwd(), 'data', 'learning.db'));
  const db = options.db ?? openDb(dbPath as string);
  const service = new LearningService(db, options.clock ?? systemClock, dbPath);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) }, err.status);
    }
    console.error(err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.use('*', localOnly());

  const version = options.version ?? process.env.npm_package_version ?? 'dev';
  const assets =
    options.assets ??
    diskAssets({ webDir: resolve(options.webDir ?? join(process.cwd(), 'dist', 'web')), rootDir: process.cwd() });

  app.route('/api', apiRoutes(service, { assets, version }));
  app.all('/api/*', (c) => c.json({ error: `Not found: ${c.req.method} ${c.req.path}` }, 404));

  app.get('*', (c) => {
    const index = assets.read('web/index.html');
    if (index === null) {
      return c.text('Wird is running, but the web UI has not been built yet (expected dist/web).', 404);
    }
    let rel: string;
    try {
      rel = decodeURIComponent(c.req.path);
    } catch {
      return c.text('Bad request', 400);
    }
    const file = rel === '/' ? null : assets.read(`web/${rel.replace(/^\/+/, '')}`);
    if (file !== null) {
      const type = MIME[extname(rel).toLowerCase()] ?? 'application/octet-stream';
      const immutable = rel.startsWith('/assets/');
      return c.body(file, 200, {
        'Content-Type': type,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
    }
    // SPA fallback
    return c.body(index, 200, { 'Content-Type': MIME['.html'] as string, 'Cache-Control': 'no-cache' });
  });

  return { app, service, db };
}
