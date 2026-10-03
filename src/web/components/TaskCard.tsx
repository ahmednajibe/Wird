import {
  ArrowBendUpRight,
  ArrowCounterClockwise,
  ArrowSquareOut,
  BookOpenText,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  Lightning,
  SkipForward,
  Timer,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isQuranType } from '../../shared/types.js';
import type { ResourceView, TaskView } from '../client/types';
import { useI18n } from '../i18n';
import { localizeTaskDescription, localizeTaskTitle } from '../i18n/engineText';
import { cn, formatMinutes } from '../lib/format';
import { formatPages } from '../lib/quran';
import { INTENSITY_KEYS, useTrackMeta, useTypeLabel } from '../lib/tracks';
import { QuranSegments } from './QuranSegments';
import { Button, IconButton } from './ui/Button';
import { Chip, ExternalLink, trackTone } from './ui/primitives';

const URL_RE = /(https?:\/\/[^\s)]+)/g;

/** Plain text with clickable URLs (opened in a new tab). */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <ExternalLink key={i} href={p} className="break-all text-accent-ink underline">
            {p}
          </ExternalLink>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function AccessBadge({ access }: { access: ResourceView['access'] }) {
  const { t } = useI18n();
  if (access === 'owned') return <Chip tone="accent">{t('access.owned')}</Chip>;
  if (access === 'paid') return <Chip tone="warn">{t('access.paid')}</Chip>;
  return <Chip>{t('access.free')}</Chip>;
}

export function ResourceLinks({ resources }: { resources: ResourceView[] }) {
  if (resources.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {resources.map((r) => (
        <li key={r.url ?? r.name} className="flex flex-wrap items-center gap-2 text-sm">
          {r.url ? (
            <ExternalLink href={r.url} className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent-ink">
              <bdi dir="auto">{r.name}</bdi>
              <ArrowSquareOut size={13} aria-hidden className="text-muted" />
            </ExternalLink>
          ) : (
            <span className="font-medium text-ink" dir="auto">
              {r.name}
            </span>
          )}
          <AccessBadge access={r.access} />
          {r.note && (
            <span className="text-xs text-muted" dir="auto">
              {r.note}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActualMinutesPopover({
  planned,
  onConfirm,
  onClose,
}: {
  planned: number;
  onConfirm: (minutes: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(planned));
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 600;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      className="absolute top-full end-0 z-20 mt-2 w-64 rounded-2xl border border-line-strong bg-surface p-3.5 shadow-pop"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(n);
        }}
      >
        <label htmlFor={id} className="label">
          {t('popover.minutes')}
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={1}
            max={600}
            inputMode="numeric"
            autoFocus
            className="field num"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid}
          />
          <Button type="submit" variant="primary" size="sm" disabled={!valid} icon={Check}>
            {t('popover.done')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">{valid ? t('popover.planned', { min: planned }) : t('popover.range')}</p>
      </form>
    </motion.div>
  );
}

export interface TaskActions {
  onComplete: (task: TaskView, actualMinutes: number | null, anchor: Element | null) => void;
  onUndo: (task: TaskView) => void;
  onSkip: (task: TaskView) => void;
  onDelete: (task: TaskView) => void;
}

function Meta({ icon: I, children, className }: { icon: typeof Clock; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted', className)}>
      <I size={14} aria-hidden />
      {children}
    </span>
  );
}

export function TaskCard({
  task,
  resources,
  actions,
  pending,
}: {
  task: TaskView;
  resources: ResourceView[];
  actions: TaskActions;
  pending?: boolean;
}) {
  const isQuran = isQuranType(task.type);
  const done = task.status === 'completed';
  const skipped = task.status === 'skipped';
  const missed = task.status === 'missed';
  const rolled = task.status === 'rolled';
  const closed = done || skipped || rolled;
  const [open, setOpen] = useState(isQuran && !closed);
  const [popover, setPopover] = useState(false);
  const checkRef = useRef<HTMLButtonElement>(null);
  const trackMeta = useTrackMeta();
  const typeLabel = useTypeLabel();
  const { t, tn, tRich, tnRich, lang } = useI18n();
  const m = trackMeta(task.track, task.stream);
  // Engine-written text is localized on the client; manual titles are user text.
  const generated = task.source === 'generated';
  const title = generated ? localizeTaskTitle(task.title, lang) : task.title;
  const description = generated ? localizeTaskDescription(task.description, lang, { page: task.quranPages[0] }) : task.description;
  const points = done ? (task.earnedPoints ?? 0) : task.plannedPoints;
  const detailParts = [
    typeLabel(task.track, task.type),
    ...(!isQuran ? [t(INTENSITY_KEYS[task.intensity]).toLowerCase()] : []),
    ...(task.source === 'manual' ? [t('task.addedByYou')] : []),
    ...(task.offCurriculum ? [t('task.offCurriculum')] : []),
  ];
  const hasDetails = detailParts.length > 0 || Boolean(task.description) || resources.length > 0 || (isQuran && task.quranPages.length > 0);
  const TrackIcon = m.icon;

  const checkButton = (
    <motion.button
      ref={checkRef}
      type="button"
      aria-label={done ? t('task.ariaUndo', { title }) : t('task.ariaComplete', { title })}
      data-testid="task-check"
      disabled={pending || skipped || rolled}
      onClick={() => (done ? actions.onUndo(task) : actions.onComplete(task, null, checkRef.current))}
      whileTap={{ scale: 0.9 }}
      className={cn(
        'group relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed',
        done ? 'border-accent bg-accent text-on-accent' : isQuran ? 'border-amber/60 text-amber-ink hover:bg-amber/12' : 'border-line-strong text-muted hover:border-accent hover:text-accent-ink',
        (skipped || rolled) && 'border-dashed opacity-60',
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
            <Check size={18} weight="bold" aria-hidden />
          </motion.span>
        ) : rolled ? (
          <ArrowBendUpRight key="rolled" size={16} className="rtl:-scale-x-100" aria-hidden />
        ) : skipped ? (
          <SkipForward key="skip" size={16} className="rtl:-scale-x-100" aria-hidden />
        ) : (
          <Check key="todo" size={16} weight="bold" aria-hidden className="opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </AnimatePresence>
    </motion.button>
  );

  if (closed) {
    return (
      <article
        data-testid="task-card"
        data-track={task.track}
        data-status={task.status}
        className={cn(
          'card relative overflow-visible opacity-80 transition-colors',
          isQuran && 'border-amber/35 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--amber)_10%,var(--surface))_0%,var(--surface)_55%)]',
        )}
      >
        {isQuran && <span aria-hidden className="absolute inset-y-3 start-0 w-1 rounded-e-full bg-amber" />}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
          {checkButton}
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-md font-semibold tracking-tight text-muted line-through decoration-1">{title}</h3>
            {done && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-ink" data-testid="task-points">
                <Lightning size={13} weight="fill" aria-hidden />
                {tRich('task.earned', {
                  points: (
                    <bdi dir="ltr">
                      <span className="num">+{points}</span>
                    </bdi>
                  ),
                })}
              </span>
            )}
            {rolled && (
              <span className="inline-flex items-center gap-1 text-xs text-subtle">
                <ArrowBendUpRight size={13} className="rtl:-scale-x-100" aria-hidden />
                <span data-testid="task-rolled" title={t('task.movedTitle')}>
                  {t('task.moved')}
                </span>
              </span>
            )}
            {skipped && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <SkipForward size={13} className="rtl:-scale-x-100" aria-hidden />
                {t('task.skipped')}
              </span>
            )}
          </div>
          {(!rolled || task.source === 'manual') && (
            <div className="flex items-center gap-1.5">
              {!rolled && (
                <Button size="sm" variant="secondary" icon={ArrowCounterClockwise} disabled={pending} onClick={() => actions.onUndo(task)} data-testid="task-undo">
                  {t('task.undo')}
                </Button>
              )}
              {task.source === 'manual' && (
                <Button size="sm" variant="ghost" icon={Trash} disabled={pending} onClick={() => actions.onDelete(task)} className="hover:text-danger">
                  {t('task.delete')}
                </Button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      data-testid="task-card"
      data-track={task.track}
      data-status={task.status}
      className={cn(
        'card relative overflow-visible transition-colors',
        isQuran && 'border-amber/35 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--amber)_10%,var(--surface))_0%,var(--surface)_55%)]',
      )}
    >
      {isQuran && <span aria-hidden className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-amber" />}
      <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
        <div className="mt-0.5">{checkButton}</div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={trackTone(m.theme)} icon={TrackIcon}>
              <bdi dir="auto">{m.label}</bdi>
            </Chip>
          </div>
          <h3 className="mt-2 text-md font-semibold tracking-tight text-ink sm:text-base">{title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Meta icon={Clock}>{formatMinutes(task.plannedMinutes)}</Meta>
            {isQuran && task.quranPages.length > 0 && (
              <Meta icon={BookOpenText}>{tnRich('task.quranPages', task.quranPages.length, { pages: <span className="num">{formatPages(task.quranPages)}</span> })}</Meta>
            )}
            {isQuran && task.quranPages.length === 0 && task.pagesCount ? <Meta icon={BookOpenText}>{tn('task.pageCount', task.pagesCount)}</Meta> : null}
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink" data-testid="task-points">
              <Lightning size={14} weight="fill" aria-hidden className="text-accent-ink" />
              {tnRich('common.points', points, { count: <span className="num">{points}</span> })}
            </span>
            {missed && (
              <Meta icon={WarningCircle} className="text-warn">
                {t('task.missed')}
              </Meta>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && hasDetails && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
              >
                <p className="text-xs text-muted">{detailParts.join(', ')}</p>
                {isQuran && task.quranPages.length > 0 && <QuranSegments pages={task.quranPages} />}
                {task.description && (
                  <p className="text-sm leading-relaxed text-muted">
                    <Linkified text={description} />
                  </p>
                )}
                {resources.length > 0 && (
                  <div>
                    <div className="label mb-1.5">{t('task.resources')}</div>
                    <ResourceLinks resources={resources} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative flex items-center gap-1">
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle}
                disabled={pending}
                onClick={(e) => actions.onComplete(task, null, e.currentTarget)}
                data-testid="task-complete"
              >
                {t('task.complete')}
              </Button>
              <IconButton icon={Timer} size="sm" label={t('popover.completeLabel')} onClick={() => setPopover((v) => !v)} aria-expanded={popover} />
              <AnimatePresence>
                {popover && (
                  <ActualMinutesPopover
                    planned={task.plannedMinutes}
                    onClose={() => setPopover(false)}
                    onConfirm={(min) => {
                      setPopover(false);
                      actions.onComplete(task, min, checkRef.current);
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
            {task.source === 'generated' && task.status === 'pending' && (
              <Button
                size="sm"
                variant="ghost"
                icon={SkipForward}
                rtlFlipIcon
                disabled={pending}
                onClick={() => actions.onSkip(task)}
                title={isQuran ? t('task.skipQuran') : t('task.skipStudy')}
                data-testid="task-skip"
              >
                {t('task.skip')}
              </Button>
            )}
            {task.source === 'manual' && (
              <Button size="sm" variant="ghost" icon={Trash} disabled={pending} onClick={() => actions.onDelete(task)} className="hover:text-danger">
                {t('task.delete')}
              </Button>
            )}
            {hasDetails && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="ms-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink"
              >
                {open ? t('task.hideDetails') : t('task.details')}
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="inline-flex">
                  <CaretDown size={13} aria-hidden />
                </motion.span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
