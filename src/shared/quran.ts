/**
 * Quran memorization engine: order, alternation, review selection, projection.
 * Pure functions; the state is derived from completed Quran tasks.
 */
import { juzOfPage, QURAN_PAGES, surahLabelForPage } from './quranData.js';
import type { Settings } from './settings.js';
import type { IsoDate, QuranPageState, QuranSessionPlan, QuranSessionType, Task } from './types.js';

export type MemorizationOrder = Settings['quran']['memorizationOrder'];
export type QuranSettings = Settings['quran'];

export interface QuranState {
  /** Index i holds page i+1. */
  pages: QuranPageState[];
  /** Type of the last completed generated (planned) Quran session. */
  lastCompletedSessionType: QuranSessionType | null;
  /** Actual minutes of completed generated memorize sessions, oldest first. */
  memorizeActualMinutes: number[];
  /** Next memorization sequence number. */
  nextSeq: number;
}

const orderCache = new Map<MemorizationOrder, number[]>();

export function memorizationOrder(order: MemorizationOrder): number[] {
  const cached = orderCache.get(order);
  if (cached) return cached;
  let pages: number[];
  if (order === 'forward') {
    pages = Array.from({ length: QURAN_PAGES }, (_, i) => i + 1);
  } else {
    pages = [];
    for (let p = 604; p >= 582; p--) pages.push(p); // Juz 30, An-Nas page first
    for (let p = 562; p <= 581; p++) pages.push(p); // Juz 29, Al-Mulk first
    for (let p = 1; p <= 561; p++) pages.push(p);
  }
  orderCache.set(order, pages);
  return pages;
}

export function emptyQuranState(): QuranState {
  return {
    pages: Array.from({ length: QURAN_PAGES }, (_, i) => ({
      page: i + 1,
      memorizedDate: null,
      memorizedSeq: null,
      lastReviewed: null,
    })),
    lastCompletedSessionType: null,
    memorizeActualMinutes: [],
    nextSeq: 1,
  };
}

export function cloneQuranState(s: QuranState): QuranState {
  return {
    pages: s.pages.map((p) => ({ ...p })),
    lastCompletedSessionType: s.lastCompletedSessionType,
    memorizeActualMinutes: [...s.memorizeActualMinutes],
    nextSeq: s.nextSeq,
  };
}

function pageState(s: QuranState, page: number): QuranPageState {
  const p = s.pages[page - 1];
  if (!p) throw new Error(`Invalid page ${page}`);
  return p;
}

export function memorizedPages(s: QuranState): QuranPageState[] {
  return s.pages.filter((p) => p.memorizedDate !== null);
}

export function memorizedCount(s: QuranState): number {
  let n = 0;
  for (const p of s.pages) if (p.memorizedDate !== null) n++;
  return n;
}

/** Next `count` unmemorized pages following the configured order. */
export function nextPages(s: QuranState, order: MemorizationOrder, count = 1): number[] {
  const out: number[] = [];
  for (const page of memorizationOrder(order)) {
    if (pageState(s, page).memorizedDate === null) {
      out.push(page);
      if (out.length >= count) break;
    }
  }
  return out;
}

export function nextPage(s: QuranState, order: MemorizationOrder): number | null {
  return nextPages(s, order, 1)[0] ?? null;
}

/**
 * Alternation by the last completed session (not calendar parity), so a missed
 * day does not break the pattern.
 */
export function nextSessionType(s: QuranState): QuranSessionType {
  const count = memorizedCount(s);
  if (count === 0) return 'memorize';
  if (count >= QURAN_PAGES) return 'review';
  return s.lastCompletedSessionType === 'memorize' ? 'review' : 'memorize';
}

/** Planned memorize minutes: rolling average of actual minutes once enough sessions exist. */
export function plannedMemorizeMinutes(s: QuranState, q: QuranSettings): number {
  const recent = s.memorizeActualMinutes.slice(-q.rollingWindow);
  if (recent.length < q.rollingMinSessions) return q.memorizeMinutes;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.max(5, Math.round(avg / 5) * 5);
}

export interface ReviewSelection {
  pages: number[];
  near: number[];
  far: number[];
  minutes: number;
  capPages: number;
  farPerSession: number;
  /** Review sessions needed to cover every memorized page at least once. */
  cycleLength: number;
  reviewAll: boolean;
}

function bySeqDesc(a: QuranPageState, b: QuranPageState): number {
  return (b.memorizedSeq ?? 0) - (a.memorizedSeq ?? 0);
}

export function reviewCapPages(q: QuranSettings): number {
  return Math.floor(q.reviewCapMinutes / q.minutesPerReviewPage);
}

export function reviewMinutesFor(pageCount: number, q: QuranSettings): number {
  return Math.min(q.reviewCapMinutes, Math.max(q.reviewMinMinutes, pageCount * q.minutesPerReviewPage));
}

export function selectReviewPages(s: QuranState, q: QuranSettings): ReviewSelection {
  const memorized = memorizedPages(s);
  const capPages = reviewCapPages(q);
  const nearCount = Math.min(q.nearPages, capPages);
  const farPerSession = Math.max(1, capPages - nearCount);

  if (memorized.length <= capPages) {
    const pages = memorized.map((p) => p.page).sort((a, b) => a - b);
    return {
      pages,
      near: pages,
      far: [],
      minutes: memorized.length === 0 ? 0 : reviewMinutesFor(pages.length, q),
      capPages,
      farPerSession,
      cycleLength: memorized.length === 0 ? 0 : 1,
      reviewAll: true,
    };
  }

  const sorted = [...memorized].sort(bySeqDesc);
  const nearStates = sorted.slice(0, nearCount);
  const nearSet = new Set(nearStates.map((p) => p.page));
  const farCandidates = memorized
    .filter((p) => !nearSet.has(p.page))
    .sort((a, b) => {
      if (a.lastReviewed !== b.lastReviewed) {
        if (a.lastReviewed === null) return -1;
        if (b.lastReviewed === null) return 1;
        return a.lastReviewed < b.lastReviewed ? -1 : 1;
      }
      return (a.memorizedSeq ?? 0) - (b.memorizedSeq ?? 0);
    });
  const far = farCandidates.slice(0, farPerSession).map((p) => p.page);
  const near = nearStates.map((p) => p.page);
  const pages = [...near, ...far];
  return {
    pages,
    near,
    far,
    minutes: reviewMinutesFor(pages.length, q),
    capPages,
    farPerSession,
    cycleLength: Math.ceil((memorized.length - nearCount) / farPerSession),
    reviewAll: false,
  };
}

/** "600-604, 582, 590-591" in the given order, grouping consecutive runs. */
export function formatPages(pages: number[]): string {
  if (pages.length === 0) return 'none';
  const sorted = [...pages].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0] as number;
  let prev = start;
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur !== undefined && cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (cur !== undefined) {
      start = cur;
      prev = cur;
    }
  }
  return parts.join(', ');
}

export function memorizeSessionFor(page: number, minutes: number): QuranSessionPlan {
  return {
    type: 'memorize',
    pages: [page],
    minutes,
    title: `Memorize page ${page}`,
    description: `${surahLabelForPage(page)} (Juz ${juzOfPage(page)}). Listen to a reciter, repeat line by line, then recite the whole page from memory.`,
  };
}

/** The session that should happen next given the state. */
export function buildSession(s: QuranState, settings: Settings): QuranSessionPlan {
  const q = settings.quran;
  const type = nextSessionType(s);
  if (type === 'memorize') {
    const page = nextPage(s, q.memorizationOrder);
    if (page !== null) return memorizeSessionFor(page, plannedMemorizeMinutes(s, q));
  }
  const sel = selectReviewPages(s, q);
  const desc = sel.reviewAll
    ? `Review all memorized pages: ${formatPages(sel.pages)}.`
    : `Near (most recent): ${formatPages(sel.near)}. Far (oldest reviewed): ${formatPages(sel.far)}. Full cycle every ${sel.cycleLength} review sessions.`;
  return {
    type: 'review',
    pages: sel.pages,
    minutes: sel.minutes,
    title: `Review ${sel.pages.length} page${sel.pages.length === 1 ? '' : 's'}`,
    description: desc,
  };
}

/** Applies a completed session (returns a new state). */
export function applySession(
  s: QuranState,
  session: Pick<QuranSessionPlan, 'type' | 'pages'>,
  date: IsoDate,
  opts: { affectsAlternation: boolean; actualMinutes?: number | null } = { affectsAlternation: true },
): QuranState {
  const next = cloneQuranState(s);
  if (session.type === 'memorize') {
    for (const page of session.pages) {
      const p = pageState(next, page);
      if (p.memorizedDate === null) {
        p.memorizedDate = date;
        p.memorizedSeq = next.nextSeq++;
      }
    }
    if (opts.affectsAlternation && opts.actualMinutes !== undefined && opts.actualMinutes !== null) {
      next.memorizeActualMinutes.push(opts.actualMinutes);
    }
  } else {
    for (const page of session.pages) {
      const p = pageState(next, page);
      if (p.memorizedDate !== null && (p.lastReviewed === null || p.lastReviewed < date)) p.lastReviewed = date;
    }
  }
  if (opts.affectsAlternation) next.lastCompletedSessionType = session.type;
  return next;
}

/**
 * Projects sessions for consecutive days, assuming each projected session is
 * completed. Days with `active: false` (rest days or already-handled days) get
 * no session and do not advance the state.
 */
export function projectSessions(
  s: QuranState,
  settings: Settings,
  days: { date: IsoDate; active: boolean }[],
): Map<IsoDate, QuranSessionPlan> {
  const out = new Map<IsoDate, QuranSessionPlan>();
  let state = s;
  for (const d of days) {
    if (!d.active) continue;
    const session = buildSession(state, settings);
    out.set(d.date, session);
    state = applySession(state, session, d.date, { affectsAlternation: true });
  }
  return out;
}

/**
 * Derives the Quran state from completed Quran tasks. Generated tasks drive
 * the alternation; manual tasks (extra pages, extra review) do not.
 */
export function deriveQuranState(tasks: readonly Task[]): QuranState {
  const done = tasks
    .filter((t) => t.track === 'quran' && t.status === 'completed' && t.completedDate !== null)
    .sort((a, b) => {
      const ka = `${a.completedDate}|${a.completedAt ?? ''}`;
      const kb = `${b.completedDate}|${b.completedAt ?? ''}`;
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.id - b.id;
    });
  let state = emptyQuranState();
  for (const t of done) {
    const type: QuranSessionType = t.type === 'quran-memorize' ? 'memorize' : 'review';
    const generated = t.source === 'generated';
    const actual =
      generated && type === 'memorize' && t.actualMinutes !== null
        ? Math.min(t.actualMinutes, t.plannedMinutes * 2)
        : null;
    state = applySession(state, { type, pages: t.quranPages }, t.completedDate as IsoDate, {
      affectsAlternation: generated,
      actualMinutes: actual,
    });
  }
  return state;
}

export interface QuranProjection {
  memorized: number;
  remaining: number;
  plannedPagesPerWeek: number;
  plannedCompletionDate: IsoDate | null;
  actualPagesPerWeek: number | null;
  actualCompletionDate: IsoDate | null;
  daysOfData: number;
}
