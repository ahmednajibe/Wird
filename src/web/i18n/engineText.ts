/**
 * Client-side Arabic for the human text the engine writes in English: task
 * titles and descriptions (planner.ts shapeTask, quran.ts sessions), fasting
 * reasons, Hijri labels, day names and the baseline explanation. The API
 * output is pinned by golden snapshots, so these pure functions translate the
 * fixed engine templates on the client. User data (module titles, phase ids,
 * stream titles, resource names/urls/notes, drills, track labels) always
 * passes through unchanged, and unknown text passes through unchanged too.
 * For 'en' every function returns the server string unchanged.
 *
 * Bidi: Latin user data inside Arabic sentences is wrapped in FSI..PDI
 * (U+2068/U+2069); numbers and durations in LRI..PDI (U+2066/U+2069) so
 * punctuation does not jump in RTL text.
 */
import { toUtcNoon } from '../../shared/dates.js';
import { getSurah, pageContents, QURAN_PAGES, SURAHS } from '../../shared/quranData.js';
import type { BaselineExplanation } from '../../shared/streak.js';
import type { HijriDate, IsoDate } from '../../shared/types.js';

export type Lang = 'en' | 'ar';

const LRI = String.fromCharCode(0x2066);
const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);
const lri = (s: string): string => `${LRI}${s}${PDI}`;
/** Wraps user data inside an Arabic sentence so its direction is isolated. */
export const isolate = (s: string): string => `${FSI}${s}${PDI}`;

// ---------------------------------------------------------------- Hijri

const HIJRI_MONTHS_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

/** "25 Ramadan 1448 AH" -> "25 رمضان 1448 هـ". */
export function hijriLabel(h: Pick<HijriDate, 'day' | 'month' | 'year' | 'label' | 'monthName'>, lang: Lang): string {
  if (lang === 'en') return h.label;
  return `${h.day} ${HIJRI_MONTHS_AR[h.month - 1] ?? h.monthName} ${h.year} هـ`;
}

// ------------------------------------------------------------- day names

const DAY_LOCALE: Record<Lang, string> = { en: 'en-GB', ar: 'ar-EG-u-nu-latn' };

const dayFmtCache = new Map<string, Intl.DateTimeFormat>();
function dayFmt(lang: Lang, width: 'long' | 'short'): Intl.DateTimeFormat {
  const key = `${lang}-${width}`;
  let f = dayFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(DAY_LOCALE[lang], { timeZone: 'UTC', weekday: width });
    dayFmtCache.set(key, f);
  }
  return f;
}

/** Full weekday name ("Sunday" / "الأحد"), computed from the date. */
export function dayName(date: IsoDate, lang: Lang): string {
  return dayFmt(lang, 'long').format(toUtcNoon(date));
}

/** Short weekday name for the week strip ("SUN" / "أحد"). */
export function dayNameShort(date: IsoDate, lang: Lang): string {
  const s = dayFmt(lang, 'short').format(toUtcNoon(date));
  return lang === 'en' ? s.toUpperCase() : s;
}

// -------------------------------------------------------- fasting reasons

/**
 * Arabic mirrors calendar.ts fastingInfo: reasons are built from the codes
 * plus the Hijri day, in the same order the engine produced them.
 */
export function fastingReasons(
  fasting: { codes: string[]; reasons: string[] },
  hijri: Pick<HijriDate, 'day' | 'month'>,
  lang: Lang,
): string[] {
  if (lang === 'en') return fasting.reasons;
  const month = HIJRI_MONTHS_AR[hijri.month - 1] ?? '';
  return fasting.codes.map((code, i) => {
    switch (code) {
      case 'monday':
        return 'الاثنين';
      case 'thursday':
        return 'الخميس';
      case 'white-day':
        return `الأيام البيض (${hijri.day} ${month})`;
      case 'ramadan':
        return `رمضان (اليوم ${hijri.day})`;
      case 'dhul-hijjah-first-nine':
        return `العشر الأوائل من ذي الحجة (اليوم ${hijri.day})`;
      case 'override-on':
        return 'صيام يدوي';
      case 'override-off':
        return 'بلا صيام (يدوي)';
      case 'eid-al-fitr':
        return 'ليس يوم صيام: عيد الفطر';
      case 'eid-al-adha':
        return 'ليس يوم صيام: عيد الأضحى';
      case 'tashreeq':
        return `ليس يوم صيام: أيام التشريق (${hijri.day} ذو الحجة)`;
      default:
        return fasting.reasons[i] ?? code;
    }
  });
}

// --------------------------------------------------------- Arabic plurals

const arPlural = new Intl.PluralRules('ar');
const AR_MINUTES: Record<Intl.LDMLPluralRule, string> = { zero: 'دقيقة', one: 'دقيقة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' };
const AR_HOURS: Record<Intl.LDMLPluralRule, string> = { zero: 'ساعة', one: 'ساعة', two: 'ساعتان', few: 'ساعات', many: 'ساعة', other: 'ساعة' };
const AR_PAGES: Record<Intl.LDMLPluralRule, string> = { zero: 'صفحة', one: 'صفحة', two: 'صفحتان', few: 'صفحات', many: 'صفحة', other: 'صفحة' };
const AR_SESSIONS: Record<Intl.LDMLPluralRule, string> = { zero: 'جلسة', one: 'جلسة', two: 'جلستان', few: 'جلسات', many: 'جلسة', other: 'جلسة' };

/** Same output shape as lib/format.ts durationParts in Arabic (pure, lang-explicit). */
function arDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (m < 60) return `${m} ${AR_MINUTES[arPlural.select(m)]}`;
  if (r === 0) return `${h} ${AR_HOURS[arPlural.select(h)]}`;
  return `${h} س ${r} د`;
}

/** Parses planner.ts formatDuration output ("45 min", "1 h", "1 h 30 min"). */
function parseDuration(dur: string): number | null {
  const m = /^(\d+) min$/.exec(dur) ?? /^(\d+) h(?: (\d+) min)?$/.exec(dur);
  if (!m) return null;
  return dur.includes('h') ? Number(m[1]) * 60 + Number(m[2] ?? 0) : Number(m[1]);
}

// ------------------------------------------------------------- surah names

/**
 * Rebuilds the pageContentsLabel surah list in Arabic. When the mushaf page
 * is known (from the task's quranPages) the exact segments are reused;
 * otherwise the English surah names are matched against SURAHS.
 */
function arSurahRanges(enRanges: string, page?: number): string {
  if (page !== undefined && Number.isInteger(page) && page >= 1 && page <= QURAN_PAGES) {
    try {
      return pageContents(page)
        .map((seg) => {
          const name = getSurah(seg.surah).nameAr;
          return seg.fromAyah === seg.toAyah ? `${name} ${seg.fromAyah}` : `${name} ${seg.fromAyah}-${seg.toAyah}`;
        })
        .join('، ');
    } catch {
      /* fall through to name matching */
    }
  }
  const out: string[] = [];
  for (const part of enRanges.split(', ')) {
    const m = /^(.*) (\d+)(?:-(\d+))?$/.exec(part);
    const surah = m ? SURAHS.find((s) => s.nameEn === m[1]) : undefined;
    if (!m || !surah) return enRanges;
    out.push(m[3] ? `${surah.nameAr} ${m[2]}-${m[3]}` : `${surah.nameAr} ${m[2]}`);
  }
  return out.join('، ');
}

// ------------------------------------------------------------------ titles

/** Fixed title prefixes from planner.ts shapeTask. */
const TITLE_PREFIX_AR: Record<string, string> = {
  'Deep study': 'دراسة معمقة',
  'Light study': 'دراسة خفيفة',
  Consolidate: 'ترسيخ',
  Build: 'بناء',
  'Light practice': 'تطبيق خفيف',
  'Open practice': 'تطبيق مفتوح',
  'Open practice (light)': 'تطبيق مفتوح (خفيف)',
};

/**
 * Arabic for a generated task title. Engine template words are translated;
 * plan data (module titles, lightTitle/warmupTitle, track labels) is kept
 * verbatim inside isolates. Unknown shapes pass through unchanged.
 */
export function localizeTaskTitle(title: string, lang: Lang): string {
  if (lang === 'en') return title;

  // quran.ts: "Memorize page N", "Review N page(s)".
  let m = /^Memorize page (\d+)$/.exec(title);
  if (m) return `حفظ الصفحة ${m[1]}`;
  m = /^Review (\d+) pages?$/.exec(title);
  if (m) return `مراجعة ${m[1]} ${AR_PAGES[arPlural.select(Number(m[1]))]}`;

  // planner.ts: every study title ends with " (session N)".
  const sm = / \(session (\d+)\)$/.exec(title);
  if (!sm) return title;
  const head = title.slice(0, sm.index);
  const suffix = ` (الجلسة ${sm[1]})`;

  // Warm-up slot: "<warmupTitle>, <chunk> min".
  const w = /^(.*), (\d+) min$/.exec(head);
  if (w) {
    const warm = w[1] === 'Warm-up' ? 'الإحماء' : isolate(w[1] ?? '');
    return `${warm}، ${w[2]} دقيقة${suffix}`;
  }

  // "<prefix>: <module title>" (module may be the default "open practice").
  const colon = head.indexOf(': ');
  if (colon >= 0) {
    const prefix = head.slice(0, colon);
    const subject = head.slice(colon + 2);
    const arSubject = subject === 'open practice' ? 'تطبيق مفتوح' : isolate(subject);
    const arPrefix = TITLE_PREFIX_AR[prefix];
    if (arPrefix) return `${arPrefix}: ${arSubject}${suffix}`;
    return `${isolate(`${prefix}:`)} ${arSubject}${suffix}`;
  }

  return `${isolate(head)}${suffix}`;
}

// ------------------------------------------------------------- descriptions

/** planner.ts resourceLine(): "a <url> [owned, paid, note]; b". */
function arResourceList(list: string): string {
  return list
    .split('; ')
    .map((item) =>
      isolate(
        item.replace(
          /\[([^\]]*)\]/,
          (_all, flags: string) => `[${flags.split(', ').map((f) => (f === 'owned' ? 'متوفر لديك' : f === 'paid' ? 'مدفوع' : f)).join('، ')}]`,
        ),
      ),
    )
    .join('؛ ');
}

/**
 * Arabic for a generated task description. The fixed sentences of planner.ts
 * shapeTask and quran.ts are replaced; embedded user data (module titles,
 * resource lines, notes, drills) is kept verbatim inside isolates.
 * `ctx.page` is the mushaf page when the task carries one (quranPages[0]);
 * it makes the surah-list rebuild exact.
 */
export function localizeTaskDescription(description: string, lang: Lang, ctx: { page?: number } = {}): string {
  if (lang === 'en') return description;
  let s = description;

  // quran.ts memorizeSessionFor: "<surah ranges> (Juz N). Listen to a reciter, ..."
  const qm = /^(.*) \(Juz (\d+)\)\. Listen to a reciter, repeat line by line, then recite the whole page from memory\.$/.exec(s);
  if (qm) {
    return `${arSurahRanges(qm[1] ?? '', ctx.page)} (الجزء ${qm[2]}). استمع إلى قارئ، وكرر وراءه سطرًا بسطر، ثم اقرأ الصفحة كاملة غيبًا.`;
  }

  // quran.ts buildSession review descriptions.
  let m = /^Review all memorized pages: (.+)\.$/.exec(s);
  if (m) return `راجع كل الصفحات المحفوظة: ${m[1] === 'none' ? 'لا شيء' : lri(m[1] ?? '')}.`;
  m = /^Near \(most recent\): (.+)\. Far \(oldest reviewed\): (.+)\. Full cycle every (\d+) review sessions\.$/.exec(s);
  if (m) {
    return `القريبة (المحفوظة أخيرًا): ${lri(m[1] ?? '')}. البعيدة (الأقدم مراجعة): ${lri(m[2] ?? '')}. دورة كاملة كل ${m[3]} ${AR_SESSIONS[arPlural.select(Number(m[3]))]} مراجعة.`;
  }

  // planner.ts shapeTask: fixed leading sentences.
  s = s.replace('Fasting day: short, relaxed drills. ', 'يوم صيام: تمارين قصيرة مريحة. ');
  s = s.replace('Fasting day: relaxed pace. Watch or read and take notes; skip heavy exercises. ', 'يوم صيام: إيقاع مريح. شاهد أو اقرأ ودوّن ملاحظات، وتجنّب التمارين الثقيلة. ');
  s = s.replace('Fasting day: re-read your notes and redo one small exercise. ', 'يوم صيام: أعد قراءة ملاحظاتك وأعد حلّ تمرين صغير واحد. ');
  s = s.replace(
    'All scheduled modules in this stream are complete. Consolidate, polish portfolio pieces, or pick a new resource.',
    'اكتملت كل الوحدات المجدولة في هذا الفرع. راجع أو حسّن قطع معرض أعمالك، أو اختر موردًا جديدًا.',
  );
  // drillsFor() fallback text.
  s = s.replace('Short warm-up drills.', 'تمارين إحماء قصيرة.');

  // planner.ts: parameterized fragments (user data kept verbatim).
  s = s.replace(/ Counts toward: (.+)\.$/, (_all, x: string) => ` تُحسب ضمن: ${isolate(x)}.`);
  s = s.replace(/ Resources: (.+?)\.(?= Remaining before this session:|$)/, (_all, list: string) => ` الموارد: ${arResourceList(list)}.`);
  s = s.replace(/ Remaining before this session: about ([^.]+)\./, (_all, dur: string) => {
    const n = parseDuration(dur);
    return n === null ? _all : ` المتبقي قبل هذه الجلسة: نحو ${lri(arDuration(n))}.`;
  });
  s = s.replace(
    / Expected to finish this module in this session, then start: (.+?)\.(?= Note:| Start with 10 minutes|$)/,
    (_all, x: string) => ` يُتوقع إنهاء هذه الوحدة في هذه الجلسة، ثم تبدأ: ${isolate(x)}.`,
  );
  s = s.replace(/ Note: (.+?)(?= Start with 10 minutes|$)/, (_all, x: string) => ` ملاحظة: ${isolate(x)}`);
  s = s.replace(/ Start with 10 minutes of warm-up: (.*)$/, (_all, x: string) => ` ابدأ بعشر دقائق من الإحماء: ${isolate(x)}`);
  return s;
}

// ---------------------------------------------------------- baseline text

type BaselineExpl = Pick<
  BaselineExplanation,
  | 'text'
  | 'normalWeekPlannedPoints'
  | 'avgDailyPlannedPoints'
  | 'factor'
  | 'fastingFactor'
  | 'normal'
  | 'fasting'
  | 'quranReserveMinutes'
  | 'effectiveReviewCapMinutes'
>;

export interface BaselineContext {
  /** settings.quran.enabled. */
  quranEnabled?: boolean;
  /**
   * Whether the weekly template has a warm-up slot: pass the stream's
   * warmupTitle (null when the slot exists without a title), false or omit
   * when there is no warm-up slot.
   */
  warmup?: string | null | false;
}

/** The "How this plan is calculated" paragraph; Arabic composes it from the numbers. */
export function baselineExplanation(expl: BaselineExpl, lang: Lang, ctx: BaselineContext = {}): string {
  if (lang === 'en') return expl.text;
  const avg = expl.avgDailyPlannedPoints.toFixed(2);
  const habits: string[] = [];
  if (ctx.quranEnabled) habits.push('جلسة قرآن اليوم');
  if (ctx.warmup !== undefined && ctx.warmup !== false) habits.push(ctx.warmup ? `الإحماء (${isolate(ctx.warmup)})` : 'الإحماء');
  const clause =
    habits.length === 2
      ? `أداء العادتين اليوميتين الأساسيتين فقط (${habits[0]} و${habits[1]}) يجب أن يحافظ على السلسلة`
      : habits.length === 1
        ? `أداء العادة اليومية (${habits[0]}) وحدها يجب أن يحافظ على السلسلة`
        : 'أداء جزء يسير من خطتك كل يوم يجب أن يحافظ على السلسلة';
  return (
    `أسبوع عادي (صيام الاثنين والخميس) يخطط ${lri(String(expl.normalWeekPlannedPoints))} نقطة، أي ${lri(avg)} نقطة في اليوم. ` +
    `الهدف اليومي = ${lri(`round(${expl.factor} x ${avg}) = ${expl.normal}`)}. ` +
    `هدف يوم الصيام = ${lri(`round(${expl.normal} x ${expl.fastingFactor}) = ${expl.fasting}`)}. أيام الراحة (الوقت المتاح 0) بلا هدف وتتخطاها السلسلة. ` +
    `لماذا هذا المعامل: في يوم خامل، ${clause}. ` +
    `كل يوم يحجز ${lri(String(expl.quranReserveMinutes))} دقيقة للقرآن (طول جلسة الحفظ)، وتتقاسم مسارات الدراسة الباقي، فوقت المسار لا يعتمد أبدًا على جلسة قرآن ذلك اليوم. ` +
    `جلسات المراجعة محدودة عند ${lri(String(expl.effectiveReviewCapMinutes))} دقيقة (سقف المراجعة، لا يتجاوز الحجز أبدًا)؛ الجزء غير المستخدم من الحجز احتياطي اختياري لا يُخطط ولا يُحتسب. ` +
    `الأيام الماضية تحتفظ بالهدف الذي كان ساريًا فيها، وتغييرات الإعدادات اللاحقة لا تؤثر فيها أبدًا.`
  );
}
