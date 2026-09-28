/**
 * Daily backups via VACUUM INTO, keeping the most recent `keep` files,
 * plus one-shot snapshots (pre-migration, pre-import, pre-reset).
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.js';

const FILE_RE = /^learning-\d{4}-\d{2}-\d{2}\.db$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYYMMDD-HHMMSS' in local time. */
export function backupStamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** Writes `<dir>/<prefix>-YYYYMMDD-HHMMSS.db` via VACUUM INTO and returns its path. Adds -2, -3 ... on same-second collisions. */
export function snapshotDb(db: Db, dir: string, prefix: string, now: Date = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const stamp = backupStamp(now);
  let file = join(dir, `${prefix}-${stamp}.db`);
  for (let i = 2; existsSync(file); i++) file = join(dir, `${prefix}-${stamp}-${i}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  return file;
}

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
