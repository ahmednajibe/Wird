import { describe, expect, it } from 'vitest';
import { addDays } from '../src/shared/dates.js';
import {
  applySession,
  buildSession,
  deriveQuranState,
  emptyQuranState,
  memorizeSessionFor,
  memorizationOrder,
  memorizedCount,
  nextSessionType,
  plannedMemorizeMinutes,
  projectSessions,
  selectReviewPages,
  type QuranState,
} from '../src/shared/quran.js';
import {
  juzOfPage,
  juzStartPage,
  pageContents,
  pageContentsLabel,
  pageOfAyah,
  QURAN_ATTRIBUTION,
  QURAN_AYAHS,
  SURAH_START_PAGES,
  SURAHS,
  surahsOnPage,
} from '../src/shared/quranData.js';
import { JUZ_STARTS, PAGE_STARTS, SURAH_AYAH_COUNTS, SURAH_NAMES_AR } from '../src/shared/quranData.generated.js';
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
    sessionNo: null,
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
  it('reviews all memorized pages when count <= 13 (40 min cap / 3 min per page)', () => {
    const s = memorizeN(13);
    const sel = selectReviewPages(s, Q);
    expect(sel.reviewAll).toBe(true);
    expect(sel.pages).toHaveLength(13);
    expect(sel.minutes).toBe(39);
    const small = selectReviewPages(memorizeN(2), Q);
    expect(small.pages).toHaveLength(2);
    expect(small.minutes).toBe(10); // clamped to the 10-minute minimum
  });

  it('uses 5 near pages + 8 far pages (oldest reviewed first) when count > 13', () => {
    const s = memorizeN(20);
    const order = memorizationOrder(Q.memorizationOrder);
    const sel = selectReviewPages(s, Q);
    expect(sel.reviewAll).toBe(false);
    expect(sel.capPages).toBe(13);
    expect(sel.near).toEqual(order.slice(15, 20).reverse());
    expect(sel.far).toHaveLength(8);
    expect(sel.far).toEqual(order.slice(0, 8)); // never reviewed, earliest memorized first
    expect(sel.minutes).toBe(39);
    expect(sel.cycleLength).toBe(2); // ceil((20 - 5) / 8)
  });

  it('review sessions never exceed the daily Quran reservation R (memorize session length)', () => {
    const s = memorizeN(40);
    // A larger review cap setting is clamped to R = 40.
    const wide = selectReviewPages(s, { ...Q, reviewCapMinutes: 90 });
    expect(wide.capPages).toBe(13);
    expect(wide.minutes).toBeLessThanOrEqual(40);
    // A shorter memorize session (R = 30) shrinks the review too.
    const short = selectReviewPages(s, { ...Q, memorizeMinutes: 30, reviewCapMinutes: 90 });
    expect(short.capPages).toBe(10);
    expect(short.minutes).toBe(30);
    expect(buildSession(applySession(s, { type: 'memorize', pages: [] }, '2026-06-01'), { ...S, quran: { ...Q, memorizeMinutes: 30 } }).minutes).toBeLessThanOrEqual(30);
  });

  it('repeated reviews cover every memorized page within the cycle length', () => {
    for (const n of [16, 23, 40, 77]) {
      let s = memorizeN(n);
      const cycle = selectReviewPages(s, Q).cycleLength;
      expect(cycle).toBe(Math.ceil((n - 5) / 8));
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

describe('exact page data (Tanzil)', () => {
  const key = (s: number, a: number): number => s * 1000 + a;
  const pageOfStart = (s: number, a: number): number => {
    let page = 1;
    PAGE_STARTS.forEach(([ps, pa], i) => {
      if (key(ps, pa) <= key(s, a)) page = i + 1;
    });
    return page;
  };

  it('has 604 pages, 114 surahs and 30 juz', () => {
    expect(PAGE_STARTS).toHaveLength(604);
    expect(SURAH_AYAH_COUNTS).toHaveLength(114);
    expect(JUZ_STARTS).toHaveLength(30);
  });

  it('surah start pages derived from Tanzil equal the given 114-entry list', () => {
    const derived = SURAHS.map((s) => pageOfStart(s.number, 1));
    expect(derived).toEqual([...SURAH_START_PAGES]);
    expect(SURAH_START_PAGES).toHaveLength(114);
  });

  it('pageContents(604) = Al-Ikhlas 1-4, Al-Falaq 1-5, An-Nas 1-6', () => {
    expect(pageContents(604)).toEqual([
      { surah: 112, fromAyah: 1, toAyah: 4 },
      { surah: 113, fromAyah: 1, toAyah: 5 },
      { surah: 114, fromAyah: 1, toAyah: 6 },
    ]);
    expect(pageContentsLabel(604)).toBe('Al-Ikhlas 1-4, Al-Falaq 1-5, An-Nas 1-6');
  });

  it('pageContents(1) = Al-Fatihah 1-7', () => {
    expect(pageContents(1)).toEqual([{ surah: 1, fromAyah: 1, toAyah: 7 }]);
  });

  it('page 583 content and the memorize task description', () => {
    console.log('Page 583:', pageContentsLabel(583));
    expect(pageContentsLabel(583)).toBe("An-Naba 31-40, An-Nazi'at 1-15");
    const s = memorizeSessionFor(583, 40);
    expect(s.title).toBe('Memorize page 583');
    expect(s.description.startsWith("An-Naba 31-40, An-Nazi'at 1-15 (Juz 30)")).toBe(true);
  });

  it('all pages together cover every ayah exactly once (6236)', () => {
    let total = 0;
    const perSurah = new Array<number>(115).fill(0);
    for (let p = 1; p <= 604; p++) {
      for (const seg of pageContents(p)) {
        expect(seg.toAyah).toBeGreaterThanOrEqual(seg.fromAyah);
        const n = seg.toAyah - seg.fromAyah + 1;
        total += n;
        perSurah[seg.surah] = (perSurah[seg.surah] ?? 0) + n;
      }
    }
    expect(total).toBe(6236);
    expect(total).toBe(QURAN_AYAHS);
    SURAHS.forEach((s) => expect(perSurah[s.number]).toBe(s.ayahCount));
  });

  it('juz starts from Tanzil match juzOfPage / juzStartPage', () => {
    // Page-level juz numbering uses 20*(n-1)+2. Tanzil's juz start ayah lies on
    // that page (sometimes mid-page, e.g. juz 4 at 3:93), except for juz 7 (5:82) and juz 11 (9:93) whose first ayah is
    // the last ayah of the preceding page.
    const lastAyahExceptions: number[] = [];
    JUZ_STARTS.forEach(([s, a], i) => {
      const juz = i + 1;
      const startPage = juzStartPage(juz);
      const page = pageOfAyah(s, a);
      expect(page).toBe(pageOfStart(s, a));
      expect(juzOfPage(startPage), `juz ${juz}`).toBe(juz);
      if (startPage > 1) expect(juzOfPage(startPage - 1)).toBe(juz - 1);
      if (page !== startPage) {
        expect(page).toBe(startPage - 1);
        const segs = pageContents(page);
        expect(segs[segs.length - 1]).toMatchObject({ surah: s, toAyah: a });
        lastAyahExceptions.push(juz);
      }
    });
    expect(lastAyahExceptions).toEqual([7, 11]);
  });


  it('Arabic names come from Tanzil', () => {
    expect(SURAHS.map((s) => s.nameAr)).toEqual([...SURAH_NAMES_AR]);
    expect(SURAHS[0]?.nameAr).toBe('الفاتحة');
    expect(QURAN_ATTRIBUTION).toBe('Quran metadata: Tanzil.net (CC BY 3.0)');
  });
});
