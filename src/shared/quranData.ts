/**
 * Madani mushaf (604 pages) reference data.
 */

export const QURAN_PAGES = 604;
export const QURAN_JUZ = 30;

export interface SurahInfo {
  number: number;
  nameEn: string;
  nameAr: string;
  startPage: number;
}

const START_PAGES: readonly number[] = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350,
  359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507,
  511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551, 553, 554, 556, 558, 560, 562, 564, 566, 568,
  570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596,
  596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604,
];

const NAMES: readonly [string, string][] = [
  ['Al-Fatihah', 'الفاتحة'],
  ['Al-Baqarah', 'البقرة'],
  ["Ali 'Imran", 'آل عمران'],
  ['An-Nisa', 'النساء'],
  ["Al-Ma'idah", 'المائدة'],
  ["Al-An'am", 'الأنعام'],
  ["Al-A'raf", 'الأعراف'],
  ['Al-Anfal', 'الأنفال'],
  ['At-Tawbah', 'التوبة'],
  ['Yunus', 'يونس'],
  ['Hud', 'هود'],
  ['Yusuf', 'يوسف'],
  ["Ar-Ra'd", 'الرعد'],
  ['Ibrahim', 'إبراهيم'],
  ['Al-Hijr', 'الحجر'],
  ['An-Nahl', 'النحل'],
  ['Al-Isra', 'الإسراء'],
  ['Al-Kahf', 'الكهف'],
  ['Maryam', 'مريم'],
  ['Taha', 'طه'],
  ['Al-Anbya', 'الأنبياء'],
  ['Al-Hajj', 'الحج'],
  ["Al-Mu'minun", 'المؤمنون'],
  ['An-Nur', 'النور'],
  ['Al-Furqan', 'الفرقان'],
  ["Ash-Shu'ara", 'الشعراء'],
  ['An-Naml', 'النمل'],
  ['Al-Qasas', 'القصص'],
  ["Al-'Ankabut", 'العنكبوت'],
  ['Ar-Rum', 'الروم'],
  ['Luqman', 'لقمان'],
  ['As-Sajdah', 'السجدة'],
  ['Al-Ahzab', 'الأحزاب'],
  ['Saba', 'سبأ'],
  ['Fatir', 'فاطر'],
  ['Ya-Sin', 'يس'],
  ['As-Saffat', 'الصافات'],
  ['Sad', 'ص'],
  ['Az-Zumar', 'الزمر'],
  ['Ghafir', 'غافر'],
  ['Fussilat', 'فصلت'],
  ['Ash-Shuraa', 'الشورى'],
  ['Az-Zukhruf', 'الزخرف'],
  ['Ad-Dukhan', 'الدخان'],
  ['Al-Jathiyah', 'الجاثية'],
  ['Al-Ahqaf', 'الأحقاف'],
  ['Muhammad', 'محمد'],
  ['Al-Fath', 'الفتح'],
  ['Al-Hujurat', 'الحجرات'],
  ['Qaf', 'ق'],
  ['Adh-Dhariyat', 'الذاريات'],
  ['At-Tur', 'الطور'],
  ['An-Najm', 'النجم'],
  ['Al-Qamar', 'القمر'],
  ['Ar-Rahman', 'الرحمن'],
  ["Al-Waqi'ah", 'الواقعة'],
  ['Al-Hadid', 'الحديد'],
  ['Al-Mujadila', 'المجادلة'],
  ['Al-Hashr', 'الحشر'],
  ['Al-Mumtahanah', 'الممتحنة'],
  ['As-Saf', 'الصف'],
  ["Al-Jumu'ah", 'الجمعة'],
  ['Al-Munafiqun', 'المنافقون'],
  ['At-Taghabun', 'التغابن'],
  ['At-Talaq', 'الطلاق'],
  ['At-Tahrim', 'التحريم'],
  ['Al-Mulk', 'الملك'],
  ['Al-Qalam', 'القلم'],
  ['Al-Haqqah', 'الحاقة'],
  ["Al-Ma'arij", 'المعارج'],
  ['Nuh', 'نوح'],
  ['Al-Jinn', 'الجن'],
  ['Al-Muzzammil', 'المزمل'],
  ['Al-Muddaththir', 'المدثر'],
  ['Al-Qiyamah', 'القيامة'],
  ['Al-Insan', 'الإنسان'],
  ['Al-Mursalat', 'المرسلات'],
  ['An-Naba', 'النبأ'],
  ["An-Nazi'at", 'النازعات'],
  ["'Abasa", 'عبس'],
  ['At-Takwir', 'التكوير'],
  ['Al-Infitar', 'الانفطار'],
  ['Al-Mutaffifin', 'المطففين'],
  ['Al-Inshiqaq', 'الانشقاق'],
  ['Al-Buruj', 'البروج'],
  ['At-Tariq', 'الطارق'],
  ["Al-A'la", 'الأعلى'],
  ['Al-Ghashiyah', 'الغاشية'],
  ['Al-Fajr', 'الفجر'],
  ['Al-Balad', 'البلد'],
  ['Ash-Shams', 'الشمس'],
  ['Al-Layl', 'الليل'],
  ['Ad-Duhaa', 'الضحى'],
  ['Ash-Sharh', 'الشرح'],
  ['At-Tin', 'التين'],
  ["Al-'Alaq", 'العلق'],
  ['Al-Qadr', 'القدر'],
  ['Al-Bayyinah', 'البينة'],
  ['Az-Zalzalah', 'الزلزلة'],
  ["Al-'Adiyat", 'العاديات'],
  ["Al-Qari'ah", 'القارعة'],
  ['At-Takathur', 'التكاثر'],
  ["Al-'Asr", 'العصر'],
  ['Al-Humazah', 'الهمزة'],
  ['Al-Fil', 'الفيل'],
  ['Quraysh', 'قريش'],
  ["Al-Ma'un", 'الماعون'],
  ['Al-Kawthar', 'الكوثر'],
  ['Al-Kafirun', 'الكافرون'],
  ['An-Nasr', 'النصر'],
  ['Al-Masad', 'المسد'],
  ['Al-Ikhlas', 'الإخلاص'],
  ['Al-Falaq', 'الفلق'],
  ['An-Nas', 'الناس'],
];

export const SURAHS: readonly SurahInfo[] = NAMES.map(([nameEn, nameAr], i) => ({
  number: i + 1,
  nameEn,
  nameAr,
  startPage: START_PAGES[i] ?? 0,
}));

/**
 * Last page of a surah. Page data is start-page only, so this is an
 * approximation: a surah runs until the page before the next surah starts, or
 * shares the page when the next surah starts on the same page it started on.
 */
export function surahEndPage(number: number): number {
  const cur = SURAHS[number - 1];
  if (!cur) throw new Error(`Invalid surah ${number}`);
  const next = SURAHS[number];
  if (!next) return QURAN_PAGES;
  return Math.max(cur.startPage, next.startPage - 1);
}

export function assertPage(page: number): void {
  if (!Number.isInteger(page) || page < 1 || page > QURAN_PAGES) throw new Error(`Invalid mushaf page ${page}`);
}

export function surahsOnPage(page: number): SurahInfo[] {
  assertPage(page);
  return SURAHS.filter((s) => s.startPage <= page && surahEndPage(s.number) >= page);
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

export const JUZ: readonly { number: number; startPage: number; endPage: number }[] = Array.from(
  { length: QURAN_JUZ },
  (_, i) => ({
    number: i + 1,
    startPage: juzStartPage(i + 1),
    endPage: i + 1 === QURAN_JUZ ? QURAN_PAGES : juzStartPage(i + 2) - 1,
  }),
);

/** "Al-Ikhlas, Al-Falaq, An-Nas" */
export function surahLabelForPage(page: number): string {
  return surahsOnPage(page)
    .map((s) => s.nameEn)
    .join(', ');
}
