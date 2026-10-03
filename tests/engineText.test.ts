/**
 * engineText: the client-side Arabic for engine-written text. Collects real
 * generated tasks from several weeks (fasting Mondays/Thursdays, White Days,
 * Ramadan, Dhu al-Hijjah, Eid/Tashreeq) and asserts the Arabic output keeps
 * user data verbatim while no English engine phrase survives. English output
 * must be byte-identical to the server strings.
 */
import { describe, expect, it } from 'vitest';
import type { BaselineExplanation } from '../src/shared/streak.js';
import { makeTestApp } from './helpers.js';
import {
  baselineItems,
  dayName,
  dayNameShort,
  fastingReasons,
  hijriLabel,
  isolate,
  localizeTaskDescription,
  localizeTaskTitle,
  taskTitleParts,
} from '../src/web/i18n/engineText.js';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// App start date -> week starts to request (weeks start on Sunday). Covers
// White Days (2027-01-21..23), Ramadan 1448 (from 2027-02-08), Eid al-Fitr
// (2027-03-09), Dhu al-Hijjah first nine (from 2027-05-07), Eid al-Adha
// (2027-05-16) and Tashreeq (2027-05-17..19). Verified with toHijri.
const WINDOWS: [string, string[]][] = [
  ['2027-01-17', ['2027-01-17', '2027-01-24', '2027-01-31', '2027-02-07', '2027-02-14']],
  ['2027-03-07', ['2027-03-07', '2027-03-14']],
  ['2027-05-02', ['2027-05-02', '2027-05-09', '2027-05-16']],
];

const EN_PHRASES = [
  'Deep study',
  'Light study',
  'Consolidate',
  'Build:',
  'Open practice',
  'session',
  'Memorize page',
  'Review ',
  'Fasting day',
  'Counts toward',
  'Remaining before',
  'Expected to finish',
  'Start with 10 minutes',
  'Listen to a reciter',
  'Near (most recent)',
  'Full cycle',
  'Resources:',
];

const ISOLATES = /[⁦-⁩]/g; // U+2066..U+2069 bidi isolates
const LATIN = /[a-zA-Z]/;
const AR_INDIC_DIGITS = /[٠-٩]/;

/** Plan-data strings kept verbatim inside Arabic text (titles, drills, resources...). */
function userData(catalog: Json): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() !== '') out.add(v);
  };
  for (const t of catalog.data.tracks as Json[]) {
    push(t.label);
    push(t.shortLabel);
    for (const s of (t.streams ?? []) as Json[]) {
      push(s.label);
      push(s.shortLabel);
      push(s.warmupTitle);
      push(s.lightTitle);
      push(s.defaultDrills);
    }
  }
  for (const m of catalog.data.modules as Json[]) {
    push(m.title);
    push(m.phase?.id);
    push(m.phase?.title);
    push(m.note);
    push(m.warmupDrills);
    for (const r of (m.resources ?? []) as Json[]) {
      push(r.name);
      push(r.url);
      push(r.note);
    }
  }
  for (const r of (catalog.data.library ?? []) as Json[]) {
    push(r.name);
    push(r.url);
    push(r.note);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

describe('engineText', () => {
  it('Arabic covers every engine template across 10 weeks and the Quran sessions', async () => {
    const days: Json[] = [];
    const tasks: Json[] = [];
    let catalog: Json | null = null;
    let expl: Json | null = null;
    for (const [today, starts] of WINDOWS) {
      const ctx = makeTestApp(today);
      try {
        for (const start of starts) {
          const week = (await (await ctx.app.request(`/api/week?start=${start}`)).json()) as Json;
          days.push(...(week.days as Json[]));
          tasks.push(...(week.days as Json[]).flatMap((d) => d.tasks as Json[]));
        }
        // Completing today's memorize session makes later sessions reviews.
        if (today === '2027-01-17') {
          const dash = (await (await ctx.app.request('/api/dashboard')).json()) as Json;
          const qt = (dash.tasks as Json[]).find((t) => t.track === 'quran');
          const res = await ctx.app.request(`/api/tasks/${qt!.id}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actualMinutes: 40 }),
          });
          expect(res.status).toBe(200);
          const week = (await (await ctx.app.request(`/api/week?start=${starts[0]}`)).json()) as Json;
          tasks.push(...(week.days as Json[]).flatMap((d) => d.tasks as Json[]));
        }
        const quran = (await (await ctx.app.request('/api/quran')).json()) as Json;
        tasks.push(quran.nextSession);
        catalog ??= (await (await ctx.app.request('/api/catalog')).json()) as Json;
        expl ??= ((await (await ctx.app.request('/api/dashboard')).json()) as Json).baseline.explanation;
      } finally {
        ctx.cleanup();
      }
    }

    expect(days.length).toBe(10 * 7);
    const generated = tasks.filter((t) => t.source === undefined || t.source === 'generated');
    expect(generated.length).toBeGreaterThan(50);

    const data = userData(catalog!);
    const moduleTitles = new Set((catalog!.data.modules as Json[]).map((m) => m.title as string));
    const seenTitles = new Set<string>();
    for (const task of generated) {
      expect(localizeTaskTitle(task.title, 'en')).toBe(task.title);
      expect(localizeTaskDescription(task.description, 'en')).toBe(task.description);
      seenTitles.add(task.title);
      const en = `${task.title}\n${task.description ?? ''}`;
      const ar = `${localizeTaskTitle(task.title, 'ar')}\n${localizeTaskDescription(task.description ?? '', 'ar', { page: task.quranPages?.[0] ?? task.pages?.[0] })}`.replace(
        ISOLATES,
        '',
      );
      // Module titles are user data: they must survive verbatim.
      for (const title of moduleTitles) {
        if (en.includes(title)) expect(ar, task.title).toContain(title);
      }
      // No English engine phrase may remain once user data is scrubbed.
      let scrubbed = ar;
      for (const u of data) scrubbed = scrubbed.split(u).join('');
      for (const phrase of EN_PHRASES) expect(scrubbed, task.title).not.toContain(phrase);
    }
    // Both planner shapes and Quran session shapes were exercised.
    expect([...seenTitles].some((t) => t.includes('Memorize page'))).toBe(true);
    expect([...seenTitles].some((t) => /^Review \d+ page/.test(t))).toBe(true);
    expect([...seenTitles].some((t) => t.includes('(session'))).toBe(true);

    // Day-level server strings: en identical, ar has no Latin or Arabic-Indic digits.
    let fastingDays = 0;
    const codes = new Set<string>();
    for (const d of days) {
      expect(dayName(d.date, 'en')).toBe(d.dayName);
      expect(dayNameShort(d.date, 'en')).toBe(d.dayName.slice(0, 3).toUpperCase());
      expect(hijriLabel(d.hijri, 'en')).toBe(d.hijri.label);
      expect(fastingReasons(d.fasting, d.hijri, 'en')).toEqual(d.fasting.reasons);
      const h = hijriLabel(d.hijri, 'ar');
      expect(h, d.date).toMatch(/ هـ$/);
      expect(h).not.toMatch(LATIN);
      expect(h).not.toMatch(AR_INDIC_DIGITS);
      const dn = dayName(d.date, 'ar');
      expect(dn).not.toMatch(LATIN);
      expect(dn).not.toMatch(AR_INDIC_DIGITS);
      for (const r of fastingReasons(d.fasting, d.hijri, 'ar')) {
        expect(r, `${d.date} ${d.fasting.codes}`).not.toMatch(LATIN);
        expect(r).not.toMatch(AR_INDIC_DIGITS);
      }
      if (d.fasting.isFasting) fastingDays++;
      for (const c of d.fasting.codes as string[]) codes.add(c);
    }
    expect(fastingDays).toBeGreaterThan(0);
    for (const c of ['monday', 'thursday', 'white-day', 'ramadan', 'dhul-hijjah-first-nine', 'eid-al-fitr', 'eid-al-adha', 'tashreeq']) {
      expect(codes.has(c), c).toBe(true);
    }

    // The baseline list: every engine number appears in both languages, and no
    // item has nested brackets or Arabic-Indic digits.
    const be = expl as unknown as BaselineExplanation;
    for (const lang of ['en', 'ar'] as const) {
      const items = baselineItems(be, lang, { quranEnabled: true, warmup: 'Drawing warm-up' });
      const flat = items.map((it) => (it.kind === 'formula' ? `${it.label} ${it.formula}` : it.parts.map((p) => p.text).join('')));
      const all = flat.join('\n');
      const nums: (string | number)[] = [
        be.normalWeekPlannedPoints,
        be.avgDailyPlannedPoints.toFixed(2),
        be.factor,
        be.fastingFactor,
        be.normal,
        be.fasting,
        be.quranReserveMinutes,
        be.effectiveReviewCapMinutes,
      ];
      for (const n of nums) expect(all, `${lang} items missing ${n}`).toContain(String(n));
      expect(all).not.toMatch(AR_INDIC_DIGITS);
      for (const item of flat) {
        expect(item, item).not.toContain('((');
        expect(item, item).not.toContain('))');
      }
      expect(all, lang).toContain(lang === 'en' ? 'Daily goal' : 'الهدف اليومي');
    }
  });

  it('taskTitleParts splits titles and reassembles to localizeTaskTitle', () => {
    const join = (p: ReturnType<typeof taskTitleParts>) => (p.prefix === '' ? `${p.subject}${p.suffix}` : `${p.prefix} ${p.subject}${p.suffix}`);
    const titles = [
      'Deep study: Module X (session 3)',
      'Light study: Module X (session 7)',
      'Consolidate: Module X (session 1)',
      'Build: Module X (session 2)',
      'Light practice: Module X (session 4)',
      'Light practice: open practice (session 4)',
      'Open practice: Animation (session 5)',
      'Open practice (light): Animation (session 6)',
      'Warm-up, 20 min (session 8)',
      'Drawing warm-up, 15 min (session 9)',
      'Memorize page 604',
      'Review 1 page',
      'Review 5 pages',
      'user text that matches nothing',
    ];
    for (const lang of ['en', 'ar'] as const) {
      for (const title of titles) {
        expect(join(taskTitleParts(title, lang)), `${lang}: ${title}`).toBe(localizeTaskTitle(title, lang));
      }
    }

    expect(taskTitleParts('Deep study: Module X (session 3)', 'en')).toEqual({ prefix: 'Deep study:', subject: 'Module X', suffix: ' (session 3)' });
    expect(taskTitleParts('Deep study: Module X (session 3)', 'ar')).toEqual({ prefix: 'دراسة معمقة:', subject: isolate('Module X'), suffix: ' (الجلسة 3)' });
    expect(taskTitleParts('Warm-up, 20 min (session 8)', 'ar')).toEqual({ prefix: '', subject: 'الإحماء، 20 دقيقة', suffix: ' (الجلسة 8)' });
    expect(taskTitleParts('Memorize page 604', 'en')).toEqual({ prefix: '', subject: 'Memorize page 604', suffix: '' });
    expect(taskTitleParts('Review 5 pages', 'ar')).toEqual({ prefix: '', subject: 'مراجعة 5 صفحات', suffix: '' });
    expect(taskTitleParts('user text that matches nothing', 'ar')).toEqual({ prefix: '', subject: 'user text that matches nothing', suffix: '' });
  });

  it('translates each fixed title and description template', () => {
    // Titles (planner.ts shapeTask + quran.ts).
    expect(localizeTaskTitle('Deep study: Module X (session 3)', 'ar')).toBe(`دراسة معمقة: ${isolate('Module X')} (الجلسة 3)`);
    expect(localizeTaskTitle('Light study: Module X (session 7)', 'ar')).toBe(`دراسة خفيفة: ${isolate('Module X')} (الجلسة 7)`);
    expect(localizeTaskTitle('Consolidate: Module X (session 1)', 'ar')).toBe(`ترسيخ: ${isolate('Module X')} (الجلسة 1)`);
    expect(localizeTaskTitle('Build: Module X (session 2)', 'ar')).toBe(`بناء: ${isolate('Module X')} (الجلسة 2)`);
    expect(localizeTaskTitle('Light practice: Module X (session 4)', 'ar')).toBe(`تطبيق خفيف: ${isolate('Module X')} (الجلسة 4)`);
    expect(localizeTaskTitle('Light practice: open practice (session 4)', 'ar')).toBe('تطبيق خفيف: تطبيق مفتوح (الجلسة 4)');
    expect(localizeTaskTitle('Open practice: Animation (session 5)', 'ar')).toBe(`تطبيق مفتوح: ${isolate('Animation')} (الجلسة 5)`);
    expect(localizeTaskTitle('Open practice (light): Animation (session 6)', 'ar')).toBe(`تطبيق مفتوح (خفيف): ${isolate('Animation')} (الجلسة 6)`);
    expect(localizeTaskTitle('Warm-up, 20 min (session 8)', 'ar')).toBe('الإحماء، 20 دقيقة (الجلسة 8)');
    expect(localizeTaskTitle('Drawing warm-up, 15 min (session 9)', 'ar')).toBe(`${isolate('Drawing warm-up')}، 15 دقيقة (الجلسة 9)`);
    expect(localizeTaskTitle('Memorize page 604', 'ar')).toBe('حفظ الصفحة 604');
    expect(localizeTaskTitle('Review 1 page', 'ar')).toBe('مراجعة 1 صفحة');
    expect(localizeTaskTitle('Review 5 pages', 'ar')).toBe('مراجعة 5 صفحات');
    expect(localizeTaskTitle('user text that matches nothing', 'ar')).toBe('user text that matches nothing');

    // Descriptions: the parameterized planner.ts fragments.
    const desc =
      'A1 Foundations. Resources: Book <https://x.test> [owned, paid, note z]; Site. Remaining before this session: about 1 h 30 min. Expected to finish this module in this session, then start: Next Mod. Note: user note. Start with 10 minutes of warm-up: Short warm-up drills.';
    expect(localizeTaskDescription(desc, 'ar')).toBe(
      `A1 Foundations. الموارد: ${isolate('Book <https://x.test> [متوفر لديك، مدفوع، note z]')}؛ ${isolate('Site')}. ` +
        'المتبقي قبل هذه الجلسة: نحو ⁦1 س 30 د⁩. ' +
        `يُتوقع إنهاء هذه الوحدة في هذه الجلسة، ثم تبدأ: ${isolate('Next Mod')}. ` +
        `ملاحظة: ${isolate('user note.')}` +
        ` ابدأ بعشر دقائق من الإحماء: ${isolate('تمارين إحماء قصيرة.')}`,
    );
    expect(localizeTaskDescription('Fasting day: relaxed pace. Watch or read and take notes; skip heavy exercises. F2 Front-end. Remaining before this session: about 45 min.', 'ar')).toBe(
      'يوم صيام: إيقاع مريح. شاهد أو اقرأ ودوّن ملاحظات، وتجنّب التمارين الثقيلة. F2 Front-end. المتبقي قبل هذه الجلسة: نحو ⁦45 دقيقة⁩.',
    );
    expect(
      localizeTaskDescription('Short warm-up drills. Counts toward: Drawabox 250 Box Challenge.', 'ar'),
    ).toBe(`تمارين إحماء قصيرة. تُحسب ضمن: ${isolate('Drawabox 250 Box Challenge')}.`);

    // Quran descriptions.
    const mem = localizeTaskDescription(
      "An-Naba 31-40, An-Nazi'at 1-15 (Juz 30). Listen to a reciter, repeat line by line, then recite the whole page from memory.",
      'ar',
    );
    expect(mem).not.toMatch(LATIN);
    expect(mem).toContain('(الجزء 30)');
    const rev = localizeTaskDescription('Review all memorized pages: 604.', 'ar');
    expect(rev).not.toMatch(LATIN);
    const nearFar = localizeTaskDescription('Near (most recent): 600-604. Far (oldest reviewed): 582. Full cycle every 4 review sessions.', 'ar');
    expect(nearFar).not.toMatch(LATIN);
    expect(nearFar).toContain('جلسات مراجعة');
  });

  it('localizes hijri labels, day names and fasting reasons', () => {
    expect(hijriLabel({ day: 1, month: 9, year: 1448, monthName: 'Ramadan', label: '1 Ramadan 1448 AH' }, 'en')).toBe('1 Ramadan 1448 AH');
    expect(hijriLabel({ day: 1, month: 9, year: 1448, monthName: 'Ramadan', label: '1 Ramadan 1448 AH' }, 'ar')).toBe('1 رمضان 1448 هـ');
    expect(dayName('2027-02-08', 'en')).toBe('Monday');
    expect(dayNameShort('2027-02-08', 'en')).toBe('MON');
    expect(dayName('2027-02-08', 'ar')).toBe('الاثنين');
    expect(
      fastingReasons(
        { codes: ['monday', 'white-day'], reasons: ['Monday', 'White Day (14 Rajab)'] },
        { day: 14, month: 7 },
        'ar',
      ),
    ).toEqual(['الاثنين', 'الأيام البيض (14 رجب)']);
    expect(
      fastingReasons(
        { codes: ['dhul-hijjah-first-nine'], reasons: ['First days of Dhu al-Hijjah (day 3)'] },
        { day: 3, month: 12 },
        'ar',
      ),
    ).toEqual(['العشر الأوائل من ذي الحجة (اليوم 3)']);
    expect(
      fastingReasons({ codes: ['tashreeq'], reasons: ['Not a fasting day: Day of Tashreeq (12 Dhu al-Hijjah)'] }, { day: 12, month: 12 }, 'ar'),
    ).toEqual(['ليس يوم صيام: أيام التشريق (12 ذو الحجة)']);
  });
});
