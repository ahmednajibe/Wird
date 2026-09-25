/**
 * Server entry point: binds to 127.0.0.1:4545 (local only).
 */
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { backupIfDue } from './backup.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4545);
const dataDir = join(process.cwd(), 'data');

const { app, service, db } = createApp({ dbPath: join(dataDir, 'learning.db') });

function runBackup(): void {
  try {
    const result = backupIfDue(db, join(dataDir, 'backups'), service.today());
    if (result.created) console.log(`Backup written: ${result.created}`);
    for (const f of result.removed) console.log(`Old backup removed: ${f}`);
  } catch (err) {
    console.error('Backup failed:', err);
  }
}

runBackup();
// Checked hourly; a backup is only written once per Cairo calendar day.
const backupTimer = setInterval(runBackup, 60 * 60 * 1000);
backupTimer.unref();

const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`Learning tracker listening on http://${HOST}:${info.port} (today in Cairo: ${service.today()})`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
