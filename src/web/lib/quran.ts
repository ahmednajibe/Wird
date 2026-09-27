import { formatPages } from '../../shared/quran.js';
import { getSurah, juzOfPage, pageContents, type PageSegment } from '../../shared/quranData.js';

export interface SegmentView extends PageSegment {
  nameEn: string;
  nameAr: string;
  ayahs: string;
}

export function segmentView(seg: PageSegment): SegmentView {
  const s = getSurah(seg.surah);
  return {
    ...seg,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    ayahs: seg.fromAyah === seg.toAyah ? `${seg.fromAyah}` : `${seg.fromAyah}-${seg.toAyah}`,
  };
}

export function pageSegments(page: number): SegmentView[] {
  return pageContents(page).map(segmentView);
}

/** Merged segments over several pages (adjacent runs of the same surah are joined). */
export function pagesSegments(pages: number[]): SegmentView[] {
  const sorted = [...pages].sort((a, b) => a - b);
  const out: PageSegment[] = [];
  for (const p of sorted) {
    for (const seg of pageContents(p)) {
      const last = out[out.length - 1];
      if (last && last.surah === seg.surah && seg.fromAyah === last.toAyah + 1) last.toAyah = seg.toAyah;
      else out.push({ ...seg });
    }
  }
  return out.map(segmentView);
}

/** Distinct surahs across pages. */
export function surahsOfPages(pages: number[]): { nameEn: string; nameAr: string; number: number }[] {
  const seen = new Map<number, { nameEn: string; nameAr: string; number: number }>();
  for (const p of pages) {
    for (const seg of pageContents(p)) {
      if (!seen.has(seg.surah)) {
        const s = getSurah(seg.surah);
        seen.set(seg.surah, { nameEn: s.nameEn, nameAr: s.nameAr, number: s.number });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

export { formatPages, juzOfPage };
