/**
 * Madani mushaf (604 pages) reference data.
 * Exact page/ayah data is generated from Tanzil metadata into
 * quranData.generated.ts (Quran metadata: Tanzil.net, CC BY 3.0).
 */
import { JUZ_STARTS, PAGE_STARTS, QURAN_ATTRIBUTION, SURAH_AYAH_COUNTS, SURAH_NAMES_AR } from './quranData.generated.js';

export { QURAN_ATTRIBUTION };

export const QURAN_PAGES = 604;
export const QURAN_JUZ = 30;
export const QURAN_AYAHS = 6236;

export interface SurahInfo {
  number: number;
  nameEn: string;
  nameAr: string;
  startPage: number;
  ayahCount: number;
}

/** Surah start pages (Madani mushaf), surah 1..114. Verified against Tanzil in tests. */
export const SURAH_START_PAGES: readonly number[] = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350,
  359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507,
  511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568,
  570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596,
  596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604,
];

/** English transliterations, surah 1..114. */
const NAMES_EN: readonly string[] = [
  "Al-Fatihah",
  "Al-Baqarah",
  "Ali 'Imran",
  "An-Nisa",
  "Al-Ma'idah",
  "Al-An'am",
  "Al-A'raf",
  "Al-Anfal",
  "At-Tawbah",
  "Yunus",
  "Hud",
  "Yusuf",
  "Ar-Ra'd",
  "Ibrahim",
  "Al-Hijr",
  "An-Nahl",
  "Al-Isra",
  "Al-Kahf",
  "Maryam",
  "Taha",
  "Al-Anbya",
  "Al-Hajj",
  "Al-Mu'minun",
  "An-Nur",
  "Al-Furqan",
  "Ash-Shu'ara",
  "An-Naml",
  "Al-Qasas",
  "Al-'Ankabut",
  "Ar-Rum",
  "Luqman",
  "As-Sajdah",
  "Al-Ahzab",
  "Saba",
  "Fatir",
  "Ya-Sin",
  "As-Saffat",
  "Sad",
  "Az-Zumar",
  "Ghafir",
  "Fussilat",
  "Ash-Shuraa",
  "Az-Zukhruf",
  "Ad-Dukhan",
  "Al-Jathiyah",
  "Al-Ahqaf",
  "Muhammad",
  "Al-Fath",
  "Al-Hujurat",
  "Qaf",
  "Adh-Dhariyat",
  "At-Tur",
  "An-Najm",
  "Al-Qamar",
  "Ar-Rahman",
  "Al-Waqi'ah",
  "Al-Hadid",
  "Al-Mujadila",
  "Al-Hashr",
  "Al-Mumtahanah",
  "As-Saf",
  "Al-Jumu'ah",
  "Al-Munafiqun",
  "At-Taghabun",
  "At-Talaq",
  "At-Tahrim",
  "Al-Mulk",
  "Al-Qalam",
  "Al-Haqqah",
  "Al-Ma'arij",
  "Nuh",
  "Al-Jinn",
  "Al-Muzzammil",
  "Al-Muddaththir",
  "Al-Qiyamah",
  "Al-Insan",
  "Al-Mursalat",
  "An-Naba",
  "An-Nazi'at",
  "'Abasa",
  "At-Takwir",
  "Al-Infitar",
  "Al-Mutaffifin",
  "Al-Inshiqaq",
  "Al-Buruj",
  "At-Tariq",
  "Al-A'la",
  "Al-Ghashiyah",
  "Al-Fajr",
  "Al-Balad",
  "Ash-Shams",
  "Al-Layl",
  "Ad-Duhaa",
  "Ash-Sharh",
  "At-Tin",
  "Al-'Alaq",
  "Al-Qadr",
  "Al-Bayyinah",
  "Az-Zalzalah",
  "Al-'Adiyat",
  "Al-Qari'ah",
  "At-Takathur",
  "Al-'Asr",
  "Al-Humazah",
  "Al-Fil",
  "Quraysh",
  "Al-Ma'un",
  "Al-Kawthar",
  "Al-Kafirun",
  "An-Nasr",
  "Al-Masad",
  "Al-Ikhlas",
  "Al-Falaq",
  "An-Nas",
];

export const SURAHS: readonly SurahInfo[] = NAMES_EN.map((nameEn, i) => ({
  number: i + 1,
  nameEn,
  nameAr: SURAH_NAMES_AR[i] ?? '',
  startPage: SURAH_START_PAGES[i] ?? 0,
  ayahCount: SURAH_AYAH_COUNTS[i] ?? 0,
}));

export function assertPage(page: number): void {
  if (!Number.isInteger(page) || page < 1 || page > QURAN_PAGES) throw new Error(`Invalid mushaf page ${page}`);
}

export function getSurah(number: number): SurahInfo {
  const s = SURAHS[number - 1];
  if (!s) throw new Error(`Invalid surah ${number}`);
  return s;
}

/** A contiguous run of ayahs of one surah on a page. */
export interface PageSegment {
  surah: number;
  fromAyah: number;
  toAyah: number;
}

function pageStart(page: number): readonly [number, number] {
  const s = PAGE_STARTS[page - 1];
  if (!s) throw new Error(`Invalid mushaf page ${page}`);
  return s;
}

function previousAyah(surah: number, ayah: number): [number, number] {
  if (ayah > 1) return [surah, ayah - 1];
  return [surah - 1, getSurah(surah - 1).ayahCount];
}

const contentsCache = new Map<number, PageSegment[]>();

/** Exact contents of a page: from its first ayah to just before the next page's first ayah. */
export function pageContents(page: number): PageSegment[] {
  assertPage(page);
  const cached = contentsCache.get(page);
  if (cached) return cached;
  const [fromSurah, fromAyah] = pageStart(page);
  const [toSurah, toAyah] =
    page === QURAN_PAGES ? [114, getSurah(114).ayahCount] : previousAyah(...(pageStart(page + 1) as [number, number]));
  const segments: PageSegment[] = [];
  for (let s = fromSurah; s <= toSurah; s++) {
    segments.push({
      surah: s,
      fromAyah: s === fromSurah ? fromAyah : 1,
      toAyah: s === toSurah ? toAyah : getSurah(s).ayahCount,
    });
  }
  contentsCache.set(page, segments);
  return segments;
}

/** Page on which a given ayah appears. */
export function pageOfAyah(surah: number, ayah: number): number {
  let lo = 1;
  let hi = QURAN_PAGES;
  const key = (s: number, a: number): number => s * 1000 + a;
  const target = key(surah, ayah);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const [s, a] = pageStart(mid);
    if (key(s, a) <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function surahsOnPage(page: number): SurahInfo[] {
  return pageContents(page).map((seg) => getSurah(seg.surah));
}

export function formatSegment(seg: PageSegment): string {
  const name = getSurah(seg.surah).nameEn;
  return seg.fromAyah === seg.toAyah ? `${name} ${seg.fromAyah}` : `${name} ${seg.fromAyah}-${seg.toAyah}`;
}

/** "An-Naba 31-40, An-Nazi'at 1-15" */
export function pageContentsLabel(page: number): string {
  return pageContents(page).map(formatSegment).join(', ');
}

export function juzStartPage(juz: number): number {
  if (!Number.isInteger(juz) || juz < 1 || juz > QURAN_JUZ) throw new Error(`Invalid juz ${juz}`);
  return juz === 1 ? 1 : 20 * (juz - 1) + 2;
}

export function juzOfPage(page: number): number {
  assertPage(page);
  if (page < juzStartPage(2)) return 1;
  return Math.min(QURAN_JUZ, Math.floor((page - 2) / 20) + 1);
}

export const JUZ: readonly { number: number; startPage: number; endPage: number; start: { surah: number; ayah: number } }[] =
  Array.from({ length: QURAN_JUZ }, (_, i) => {
    const [surah, ayah] = JUZ_STARTS[i] ?? [1, 1];
    return {
      number: i + 1,
      startPage: juzStartPage(i + 1),
      endPage: i + 1 === QURAN_JUZ ? QURAN_PAGES : juzStartPage(i + 2) - 1,
      start: { surah, ayah },
    };
  });

/** "Al-Ikhlas, Al-Falaq, An-Nas" */
export function surahLabelForPage(page: number): string {
  return surahsOnPage(page)
    .map((s) => s.nameEn)
    .join(', ');
}
