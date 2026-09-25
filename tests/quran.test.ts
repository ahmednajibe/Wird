import { describe, expect, it } from 'vitest';
import { addDays } from '../src/shared/dates.js';
import {
  applySession,
  buildSession,
  deriveQuranState,
  emptyQuranState,
  memorizationOrder,
  memorizedCount,
  nextSessionType,
  plannedMemorizeMinutes,
  projectSessions,
  selectReviewPages,
  type QuranState,
} from '../src/shared/quran.js';
import { juzOfPage, juzStartPage, SURAHS, surahsOnPage } from '../src/shared/quranData.js';
import { DEFAULT_SETTINGS } from '../src/shared/settings.js';
import type { Task } from '../src/shared/types.js';

const S = DEFAULT_SETTINGS;
const Q = S.quran;

function memorizeN(n: number, startDate = '2026-01-01'): QuranState {
  let s = emptyQuranState();
  const order = memorizationOrder(Q.memorizationOrder);
  for (let i = 0; i < n; i++) {
    s = applySession(s, { type: 'memorize', pages: [order[i] as number] }, addDays(startDate, i));
  }
  return s;
}

let nextId = 1;
function quranTask(p: Partial<Task> & Pick<Task, 'type' | 'completedDate'>): Task {
  const id = nextId++;
  return {
    id,
    date: p.completedDate ?? '2026-01-01',
    track: 'quran',
    stream: 'main',
    intensity: 'normal',
    title: '',
    description: '',
    plannedMinutes: 40,
    actualMinutes: null,
    source: 'generated',
    status: 'completed',
    completedAt: `${p.completedDate}T05:00:00.000Z`,
    moduleId: null,
    slotKey: 'quran',
    sortOrder: 0,
    quranPages: [],
    pagesCount: null,
    offCurriculum: false,
    points: null,
    ...p,
  };
}

describe('quran data', () => {
  it('has 114 surahs with ascending start pages', () => {
    expect(SURAHS).toHaveLength(114);
    for (let i = 1; i < SURAHS.length; i++) {
      expect((SURAHS[i] as { startPage: number }).startPage).toBeGreaterThanOrEqual(
        (SURAHS[i - 1] as { startPage: number }).startPage,
      );
    }
    expect(SURAHS[66]?.nameEn).toBe('Al-Mulk');
    expect(SURAHS[66]?.startPage).toBe(562);
  });

  it('surahsOnPage(604) = Al-Ikhlas, Al-Falaq, An-Nas', () => {
    expect(surahsOnPage(604).map((s) => s.nameEn)).toEqual(['Al-Ikhlas', 'Al-Falaq', 'An-Nas']);
    expect(surahsOnPage(1).map((s) => s.nameEn)).toEqual(['Al-Fatihah']);
  });

  it('juz boundaries', () => {
    expect(juzStartPage(1)).toBe(1);
    expect(juzStartPage(2)).toBe(22);
    expect(juzStartPage(30)).toBe(582);
    expect(juzOfPage(1)).toBe(1);
    expect(juzOfPage(21)).toBe(1);
    expect(juzOfPage(22)).toBe(2);
    expect(juzOfPage(581)).toBe(29);
    expect(juzOfPage(582)).toBe(30);
    expect(juzOfPage(604)).toBe(30);
  });
});

describe('memorization order', () => {
  it('juz 30 backwards, then juz 29 forwards, then from page 1', () => {
    const o = memorizationOrder('juz30-29-then-forward');
    expect(o).toHaveLength(604);
    expect(new Set(o).size).toBe(604);
    expect(o.slice(0, 3)).toEqual([604, 603, 602]);
    const i583 = o.indexOf(583);
    expect(o.slice(i583, i583 + 3)).toEqual([583, 582, 562]);
    expect(o[o.indexOf(581) + 1]).toBe(1);
    expect(o[o.length - 1]).toBe(561);
  });

  it('forward option', () => {
    const o = memorizationOrder('forward');
    expect(o[0]).toBe(1);
    expect(o[603]).toBe(604);
  });
});

describe('alternation', () => {
  it('starts with memorize, then alternates by the last completed session', () => {
    expect(nextSessionType(emptyQuranState())).toBe('memorize');
    let s = applySession(emptyQuranState(), { type: 'memorize', pages: [604] }, '2026-01-01');
    expect(nextSessionType(s)).toBe('review');
    s = applySession(s, { type: 'review', pages: [604] }, '2026-01-02');
    expect(nextSessionType(s)).toBe('memorize');
  });

  it('a missed day does not break the pattern (not calendar parity)', () => {
    // Memorized on day 1, missed days 2 and 3: the next session is still review.
    const state = deriveQuranState([quranTask({ type: 'quran-memorize', completedDate: '2026-01-01', quranPages: [604] })]);
    expect(nextSessionType(state)).toBe('review');
    const projected = projectSessions(state, S, [
      { date: '2026-01-04', active: true },
      { date: '2026-01-05', active: true },
      { date: '2026-01-06', active: true },
    ]);
    expect([...projected.values()].map((x) => x.type)).toEqual(['review', 'memorize', 'review']);
    expect(projected.get('2026-01-05')?.pages).toEqual([603]);
  });

  it('manual extra pages do not change the alternation', () => {
    const state = deriveQuranState([
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-01', quranPages: [604] }),
      quranTask({ type: 'quran-review', completedDate: '2026-01-02', quranPages: [604] }),
      quranTask({ type: 'quran-memorize', source: 'manual', completedDate: '2026-01-02', quranPages: [603, 602], pagesCount: 2 }),
    ]);
    expect(memorizedCount(state)).toBe(3);
    expect(nextSessionType(state)).toBe('memorize');
    expect(buildSession(state, S).pages).toEqual([601]);
  });

  it('uses the rolling average of actual memorize minutes once 3 sessions exist', () => {
    const two = deriveQuranState([
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-01', quranPages: [604], actualMinutes: 30 }),
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-03', quranPages: [603], actualMinutes: 30 }),
    ]);
    expect(plannedMemorizeMinutes(two, Q)).toBe(40);
    const three = deriveQuranState([
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-01', quranPages: [604], actualMinutes: 30 }),
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-03', quranPages: [603], actualMinutes: 30 }),
      quranTask({ type: 'quran-memorize', completedDate: '2026-01-05', quranPages: [602], actualMinutes: 200 }), // capped at 80
    ]);
    expect(plannedMemorizeMinutes(three, Q)).toBe(45); // (30+30+80)/3 = 46.7 -> nearest 5
  });
});

describe('review selection', () => {
  it('reviews all memorized pages when count <= 15', () => {
    const s = memorizeN(15);
    const sel = selectReviewPages(s, Q);
    expect(sel.reviewAll).toBe(true);
    expect(sel.pages).toHaveLength(15);
    expect(sel.minutes).toBe(45);
    const small = selectReviewPages(memorizeN(2), Q);
    expect(small.pages).toHaveLength(2);
    expect(small.minutes).toBe(10); // clamped to the 10-minute minimum
  });

  it('uses 5 near pages + 10 far pages (oldest reviewed first) when count > 15', () => {
    const s = memorizeN(20);
    const order = memorizationOrder(Q.memorizationOrder);
    const sel = selectReviewPages(s, Q);
    expect(sel.reviewAll).toBe(false);
    expect(sel.capPages).toBe(15);
    expect(sel.near).toEqual(order.slice(15, 20).reverse());
    expect(sel.far).toHaveLength(10);
    expect(sel.far).toEqual(order.slice(0, 10)); // never reviewed, earliest memorized first
    expect(sel.minutes).toBe(45);
    expect(sel.cycleLength).toBe(2); // ceil((20 - 5) / 10)
  });

  it('repeated reviews cover every memorized page within the cycle length', () => {
    for (const n of [16, 23, 40, 77]) {
      let s = memorizeN(n);
      const cycle = selectReviewPages(s, Q).cycleLength;
      expect(cycle).toBe(Math.ceil((n - 5) / 10));
      const seen = new Set<number>();
      for (let i = 0; i < cycle; i++) {
        const sel = selectReviewPages(s, Q);
        sel.pages.forEach((p) => seen.add(p));
        s = applySession(s, { type: 'review', pages: sel.pages }, addDays('2026-06-01', i));
      }
      expect(seen.size, `n=${n}`).toBe(n);
      // And the cycle repeats: the next cycle again covers everything.
      const seen2 = new Set<number>();
      for (let i = 0; i < cycle; i++) {
        const sel = selectReviewPages(s, Q);
        sel.pages.forEach((p) => seen2.add(p));
        s = applySession(s, { type: 'review', pages: sel.pages }, addDays('2026-07-01', i));
      }
      expect(seen2.size).toBe(n);
    }
  });
});
