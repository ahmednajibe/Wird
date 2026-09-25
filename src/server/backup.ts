/**
 * Daily backups via VACUUM INTO, keeping the most recent `keep` files.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.js';

const FILE_RE = /^learning-\d{4}-\d{2}-\d{2}\.db$/;

export interface BackupResult {
  created: string | null;
  removed: string[];
}

export function backupIfDue(db: Db, dir: string, date: string, keep = 30): BackupResult {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `learning-${date}.db`);
  let created: string | null = null;
  if (!existsSync(file)) {
    db.prepare('VACUUM INTO ?').run(file);
    created = file;
  }
  const files = readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort();
  const removed: string[] = [];
  while (files.length > keep) {
    const oldest = files.shift();
    if (!oldest) break;
    rmSync(join(dir, oldest), { force: true });
    removed.push(oldest);
  }
  return { created, removed };
}
