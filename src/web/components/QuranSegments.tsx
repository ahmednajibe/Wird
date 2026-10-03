import { useI18n } from '../i18n';
import { cn } from '../lib/format';
import { pageSegments, pagesSegments, type SegmentView } from '../lib/quran';

export function SegmentRow({ seg, className }: { seg: SegmentView; className?: string }) {
  const { t } = useI18n();
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className="font-medium text-ink">{seg.nameEn}</span>
      <span className="arabic text-[17px] leading-none text-amber-ink" lang="ar" dir="rtl">
        {seg.nameAr}
      </span>
      <span className="num text-xs text-muted">{t(seg.fromAyah === seg.toAyah ? 'quran.ayah' : 'quran.ayahs', { range: seg.ayahs })}</span>
    </span>
  );
}

/** Surah/ayah segments of one page or several pages (merged). */
export function QuranSegments({ pages, className, max = 6 }: { pages: number[]; className?: string; max?: number }) {
  const { tn } = useI18n();
  if (pages.length === 0) return null;
  const segs = pages.length === 1 ? pageSegments(pages[0] as number) : pagesSegments(pages);
  const shown = segs.slice(0, max);
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {shown.map((s) => (
        <li key={`${s.surah}-${s.fromAyah}`} className="text-sm">
          <SegmentRow seg={s} />
        </li>
      ))}
      {segs.length > shown.length && <li className="text-xs text-muted">{tn('quran.more', segs.length - shown.length)}</li>}
    </ul>
  );
}
