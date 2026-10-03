/**
 * English dictionary: flat dotted keys. A value is either a string with
 * {placeholders}, or a plural object { one, other } selected by
 * Intl.PluralRules. Arabic (ar.ts) must provide every key; plural keys
 * take the six CLDR forms there.
 */
export const en = {
  'nav.today': 'Today',
  'nav.plan': 'Plan',
  'nav.tracks': 'Tracks',
  'nav.quran': 'Quran',
  'nav.stats': 'Stats',
  'nav.settings': 'Settings',
  'nav.addTask': 'Add task',
  'nav.main': 'Main',

  'route.import': 'Import a plan',

  'app.planFallback': 'Your learning plan',
  'app.skipToContent': 'Skip to content',
  'app.localOnly': 'Local only, 127.0.0.1',
  'app.fab': 'Add',

  'theme.toLight': 'Switch to light theme',
  'theme.toDark': 'Switch to dark theme',
  'theme.system': 'System',
  'theme.dark': 'Dark',
  'theme.light': 'Light',

  'settings.appearance': 'Appearance',
  'settings.appearanceDesc': 'Saved on this device. System follows your OS setting.',
  'settings.theme': 'Theme',
  'settings.language': 'Language',

  'common.days': { one: 'day', other: 'days' },
  'common.cancel': 'Cancel',
  'common.streakDays': { one: '{count} day streak', other: '{count} days streak' },
  'common.points': { one: '{count} point', other: '{count} points' },
  'common.pointsWord': { one: 'point', other: 'points' },

  'sidebar.secured': 'Today is secured',
  'sidebar.open': 'Today is still open',
  'sidebar.level': 'Level {level}',
  'sidebar.levelPoints': '{into}/{total} points',

  'greeting.early': 'Up early',
  'greeting.morning': 'Good morning',
  'greeting.afternoon': 'Good afternoon',
  'greeting.evening': 'Good evening',

  'today.greeting': '{greeting}. Ready for today?',
  'today.tasks': "Today's tasks",
  'today.nothingPlanned': 'Nothing planned yet.',
  'today.doneCount': { one: '{done} of {count} task done', other: '{done} of {count} tasks done' },
  'today.restDay': 'Rest day',
  'today.noTasks': 'No tasks for today',
  'today.restEmptyBody': 'Nothing is planned. Enjoy the break, or log anything you do anyway.',
  'today.emptyBody': 'Log study or Quran work you did, and the points are added automatically.',
  'today.allDone': 'All done for today. Anything else you log is a bonus.',
  'today.doneMoved': 'Done and moved {count}',
  'today.addTask': 'Add a task',
  'today.noPlanTitle': 'No study plan yet',
  'today.noPlanBody': 'Import a plan to get study tracks and a weekly schedule. Quran tasks still show below if enabled.',

  'hero.ringLabel': '{points} points, goal {goal}',
  'hero.ringGoal': 'goal {goal}',
  'hero.pointsLabel': 'points',
  'hero.restTitle': 'Rest {word}',
  'hero.restWord': 'day',
  'hero.restBody': 'No goal today. The streak is paused, not broken.',
  'hero.securedTitle': 'Streak {word}',
  'hero.securedWord': 'secured',
  'hero.securedBody': 'Today counts. Everything else is a bonus.',
  'hero.toGo': { one: '{count} point to go{hint}', other: '{count} points to go{hint}' },
  'hero.reach': { one: 'Reach {count} point to keep your streak.', other: 'Reach {count} points to keep your streak.' },
  'hero.enoughQuran': 'The Quran session plus the warm-up is enough.',
  'hero.enoughCore': 'A light day of your core habits is enough.',
  'hero.longest': 'longest {n}{hint}',
  'hero.streakHint': 'Days in a row that reached their goal. Rest days pause the streak without breaking it. Days that are over never change.',
  'hero.level': 'Level {n}',
  'hero.levelProgress': 'Progress to next level',
  'hero.toLevel': { one: '{count} point to level {level}{hint}', other: '{count} points to level {level}{hint}' },
  'hero.levelHint':
    'Your level grows with every point you have ever earned. Each level takes a little more than the last. It is a long-term marker; the daily goal is what matters day to day.',
  'hero.goalHintRest': 'Rest days have no goal. Your streak is paused, not broken.',
  'hero.goalHint':
    "Your daily goal is a small share of a normal day's planned points, smaller on fasting days. Reach it and the day counts for your streak. Anything above it is a bonus.",

  'hint.restDays': 'rest days',
  'hint.dailyGoal': 'the daily goal',
  'hint.streak': 'the streak',
  'hint.levels': 'levels',
  'hint.capacity': 'planned and available time',
  'hint.about': 'About {topic}',

  'capacity.hint':
    "Planned is the time today's tasks need. The second number is the time you have today, set per weekday in Settings (less on fasting days). Unused Quran time is an optional buffer, never required.",
  'capacity.rest': 'Rest day, capacity set to 0 min{hint}',
  'capacity.line': '{planned} planned of {total} today{note}{hint}',
  'capacity.fastingNote': '({source} less {pct}% for fasting)',
  'capacity.customNote': '(custom, usually {base})',
  'buffer.line': 'Buffer: {min} min (optional catch-up or rest)',

  'fasting.day': 'Fasting day',
  'fasting.eid': 'Eid: not a fasting day',
  'fasting.tashreeq': 'Tashreeq: not a fasting day',
  'fasting.overrideOff': 'Not fasting (manual override)',

  'week.title': 'This week',
  'week.sub': 'Earned vs planned points',
  'week.notStartedTitle': 'Not started: tracking began after this day',
  'week.notStarted': 'Not started',
  'week.dayNotStartedAria': '{day} {date}: not started',
  'week.dayAria': '{day} {date}: {earned} of {planned} points',
  'week.countedSuffix': ', counted',
  'week.fastingSuffix': ', fasting',
  'week.countedTitle': 'Counted toward the streak',

  'intro.title': 'How Wird works',
  'intro.dismiss': 'Got it',
  'intro.step1': 'Do the tasks below. They are sized to fit the time you have today.',
  'intro.step2': 'Each finished task earns points. Wird works them out from the minutes and the kind of work, so there is nothing to enter.',
  'intro.step3': 'Reach the daily goal and the day counts for your streak. The goal is small on purpose: a light day still counts.',

  'skeleton.loading': 'Loading today',

  'task.ariaComplete': 'Complete {title}',
  'task.ariaUndo': 'Undo {title}',
  'task.earned': '{points} earned',
  'task.moved': 'Moved forward',
  'task.movedTitle': 'This session moved to the next slot of the same track. No points, not missed.',
  'task.skipped': 'Skipped',
  'task.undo': 'Undo',
  'task.delete': 'Delete',
  'task.complete': 'Complete',
  'task.skip': 'Skip',
  'task.skipQuran': 'Skip this Quran session',
  'task.skipStudy': 'Move this session to the next slot of the same track',
  'task.details': 'Details',
  'task.hideDetails': 'Hide details',
  'task.missed': 'Missed',
  'task.addedByYou': 'added by you',
  'task.offCurriculum': 'off-curriculum',
  'task.resources': 'Resources',
  'task.quranPages': { one: 'Page {pages}', other: 'Pages {pages}' },
  'task.pageCount': { one: '{count} page', other: '{count} pages' },

  'popover.minutes': 'Actual minutes',
  'popover.done': 'Done',
  'popover.planned': 'Planned {min} min. Points follow the real time.',
  'popover.range': 'Use 1 to 600 minutes.',
  'popover.completeLabel': 'Complete with actual minutes',

  'type.learn': 'Learn',
  'type.practice': 'Practice',
  'type.build': 'Build',
  'type.review': 'Review',
  'type.quran-memorize': 'Memorize',
  'type.quran-review': 'Review',

  'intensity.deep': 'Deep focus',
  'intensity.normal': 'Normal',
  'intensity.light': 'Light',

  'access.owned': 'Owned',
  'access.paid': 'Paid',
  'access.free': 'Free',

  'quran.ayah': 'ayah {range}',
  'quran.ayahs': 'ayahs {range}',
  'quran.more': { one: 'and {count} more', other: 'and {count} more' },

  'addTask.desc': 'Log study or Quran work you did outside the plan, or add it for later today.',
  'addTask.logTask': 'Log task',
  'addTask.addToToday': 'Add to today',
  'addTask.track': 'Track',
  'addTask.noTracks': 'No tracks yet. {link} or turn Quran on in Settings.',
  'addTask.stream': 'Stream',
  'addTask.streamAria': '{track} stream',
  'addTask.titleLabel': 'Title',
  'addTask.phQuran': 'Extra page with my teacher',
  'addTask.phStudy': 'Watched a lecture on attention',
  'addTask.errTitle': 'Give the task a short title.',
  'addTask.type': 'Type',
  'addTask.typeAria': 'Task type',
  'addTask.minutes': 'Minutes',
  'addTask.errMinutes': 'Minutes must be a whole number from 1 to 600.',
  'addTask.pages': 'Pages memorized',
  'addTask.errPages': 'Pages must be from 1 to 20.',
  'addTask.offCurr': 'Off-curriculum',
  'addTask.offCurrDesc': 'Not part of the current module. Counts at 0.85x and does not move module progress.',
  'addTask.alreadyDone': 'Already done',
  'addTask.doneOn': 'Points are added right away.',
  'addTask.doneOff': 'Adds a pending task to today.',
  'addTask.calculating': 'Calculating...',
  'addTask.enterMinutes': 'Enter valid minutes to see points',
  'addTask.pointsAuto': 'Points are calculated automatically.',
  'addTask.how': 'How?',
  'addTask.toastLogged': { one: 'Logged: +{count} point', other: 'Logged: +{count} points' },
  'addTask.toastAdded': 'Task added to today',
  'addTask.toastAddedBody': '{title}. Worth {points} points when completed.',
  'addTask.toastSecuredBody': 'Today counts: {points} of {goal} points.',

  'toast.streakSecured': 'Streak secured',
  'toast.streakSecuredBody': '{points} of {goal} points. Today counts, streak is now {days} {daysWord}.',
  'toast.errComplete': 'Could not complete the task',
  'toast.errUndo': 'Could not undo',
  'toast.errSkip': 'Could not skip',
  'toast.deleted': 'Task deleted',
  'toast.errDelete': 'Could not delete',
  'toast.dismiss': 'Dismiss',

  'dialog.close': 'Close',
  'error.title': 'Could not load this',
  'error.retry': 'Try again',

  'notFound.title': 'This page does not exist',
  'notFound.body': 'The link may be old. Head back to today and keep your streak going.',
  'notFound.cta': 'Go to Today',
} as const;

export type Dict = typeof en;
export type StringKey = { [K in keyof Dict]: Dict[K] extends string ? K : never }[keyof Dict];
export type PluralKey = { [K in keyof Dict]: Dict[K] extends { one: string } ? K : never }[keyof Dict];

// ar imports en only for the Dict type, so this value edge is one-way.
import { ar } from './ar.js';

const DICTS = { en, ar } as const;
type Lang = keyof typeof DICTS;
type Vars = Record<string, string | number>;

/** {name} placeholders; unknown names stay as literal text. */
export function fill(template: string, vars?: Vars): string {
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (vars && name in vars ? String(vars[name]) : m));
}

export function pluralForm(lang: Lang, key: PluralKey, count: number): string {
  const forms = DICTS[lang][key] as unknown as Record<string, string>;
  const select = new Intl.PluralRules(lang).select(count);
  return forms[select] ?? forms['other'] ?? '';
}

/** Plural lookup: picks the CLDR form for lang and fills {count} plus vars. */
export function tnFor(lang: Lang, key: PluralKey, count: number, vars?: Vars): string {
  return fill(pluralForm(lang, key, count), { ...vars, count });
}
