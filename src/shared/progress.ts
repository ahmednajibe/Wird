/**
 * Curriculum progress. Credits flow into the target module and overflow into
 * the following modules of the same track/stream once a module is full, so
 * that a long session that finishes a module also starts the next one.
 * The same ledger is used for real progress and for planning simulations.
 */
import { streamKey, type Catalog } from './catalog.js';
import type { CurriculumModule, StreamId, TaskType, TrackId } from './types.js';

/** Fraction of minutes credited toward a module by task type. */
export const CREDIT_RATE: Record<TaskType, number> = {
  learn: 1,
  build: 1,
  practice: 1,
  review: 0.5,
  'quran-memorize': 0,
  'quran-review': 0,
};

export function creditMinutes(type: TaskType, minutes: number): number {
  return minutes * CREDIT_RATE[type];
}

export interface ModuleStateRecord {
  moduleId: string;
  manualComplete: boolean;
  completedAt: string | null;
  /** Credits recorded before this instant are ignored for this module. */
  resetAt: string | null;
}

export interface CreditEvent {
  moduleId: string;
  /** Already credit-weighted minutes. */
  minutes: number;
  /** ISO timestamp used for ordering and reset handling. */
  at: string;
}

export interface ModuleProgress {
  moduleId: string;
  estMinutes: number;
  creditedMinutes: number;
  remainingMinutes: number;
  completed: boolean;
  manualComplete: boolean;
  percent: number;
}

export class ModuleLedger {
  private readonly credited = new Map<string, number>();
  private readonly manual = new Set<string>();
  private readonly resetAt = new Map<string, string>();

  constructor(
    readonly catalog: Catalog,
    states: readonly ModuleStateRecord[] = [],
  ) {
    for (const s of states) {
      if (s.manualComplete) this.manual.add(s.moduleId);
      if (s.resetAt) this.resetAt.set(s.moduleId, s.resetAt);
    }
  }

  clone(): ModuleLedger {
    const c = new ModuleLedger(this.catalog);
    for (const [k, v] of this.credited) c.credited.set(k, v);
    for (const k of this.manual) c.manual.add(k);
    for (const [k, v] of this.resetAt) c.resetAt.set(k, v);
    return c;
  }

  creditedOf(id: string): number {
    return this.credited.get(id) ?? 0;
  }

  isComplete(id: string): boolean {
    if (this.manual.has(id)) return true;
    const m = this.catalog.module(id);
    return m !== undefined && this.creditedOf(id) >= m.estMinutes;
  }

  remainingOf(id: string): number {
    const m = this.catalog.module(id);
    if (!m || this.isComplete(id)) return 0;
    return Math.max(0, m.estMinutes - this.creditedOf(id));
  }

  current(track: TrackId, stream: StreamId): CurriculumModule | null {
    for (const m of this.catalog.modulesFor(track, stream)) if (!this.isComplete(m.id)) return m;
    return null;
  }

  /** The module after `id` in the same stream that is not yet complete. */
  nextAfter(id: string): CurriculumModule | null {
    const m = this.catalog.module(id);
    if (!m) return null;
    const list = this.catalog.modulesFor(m.track, m.stream);
    const idx = list.findIndex((x) => x.id === id);
    for (let i = idx + 1; i < list.length; i++) {
      const cand = list[i];
      if (cand && !this.isComplete(cand.id)) return cand;
    }
    return null;
  }

  /**
   * Adds credit to `moduleId`, overflowing into later modules. `at` enables
   * reset semantics (credits older than a module reset are dropped).
   */
  apply(moduleId: string, minutes: number, at?: string): void {
    if (minutes <= 0) return;
    const target = this.catalog.module(moduleId);
    if (!target) return;
    const resetTarget = this.resetAt.get(moduleId);
    if (at !== undefined && resetTarget !== undefined && at < resetTarget) return;
    const list = this.catalog.modulesFor(target.track, target.stream);
    let left = minutes;
    let lastCredited: string | null = null;
    for (let i = list.findIndex((x) => x.id === moduleId); i < list.length && left > 0; i++) {
      const m = list[i];
      if (!m) break;
      const r = this.resetAt.get(m.id);
      if (at !== undefined && r !== undefined && at < r) break;
      if (this.isComplete(m.id)) continue;
      const take = Math.min(left, m.estMinutes - this.creditedOf(m.id));
      this.credited.set(m.id, this.creditedOf(m.id) + take);
      lastCredited = m.id;
      left -= take;
    }
    if (left > 0) {
      const sink = lastCredited ?? moduleId;
      this.credited.set(sink, this.creditedOf(sink) + left);
    }
  }

  progress(id: string): ModuleProgress {
    const m = this.catalog.module(id);
    if (!m) throw new Error(`Unknown module ${id}`);
    const credited = this.creditedOf(id);
    const completed = this.isComplete(id);
    return {
      moduleId: id,
      estMinutes: m.estMinutes,
      creditedMinutes: Math.round(credited * 10) / 10,
      remainingMinutes: completed ? 0 : Math.max(0, Math.round((m.estMinutes - credited) * 10) / 10),
      completed,
      manualComplete: this.manual.has(id),
      percent: completed ? 100 : Math.min(100, Math.round((credited / m.estMinutes) * 1000) / 10),
    };
  }

  remainingForStream(track: TrackId, stream: StreamId): number {
    return this.catalog.modulesFor(track, stream).reduce((sum, m) => sum + this.remainingOf(m.id), 0);
  }
}

export function buildLedger(
  catalog: Catalog,
  states: readonly ModuleStateRecord[],
  events: readonly CreditEvent[],
): ModuleLedger {
  const ledger = new ModuleLedger(catalog, states);
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const e of sorted) ledger.apply(e.moduleId, e.minutes, e.at);
  return ledger;
}

export function allStreamKeys(catalog: Catalog): string[] {
  return [...new Set(catalog.activeModules().map((m) => streamKey(m.track, m.stream)))];
}
