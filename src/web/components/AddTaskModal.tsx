import { Lightning, Plus } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, ApiError } from '../client/client';
import { qk, useCatalog, useCreateTask, useScorePreview } from '../client/hooks';
import type { Dashboard, ManualTaskInput, ManualTaskType, TrackDef, TrackId } from '../client/types';
import { burstFrom, celebrate } from '../lib/confetti';
import { cn } from '../lib/format';
import { metaFor, typeLabel } from '../lib/tracks';
import { alreadyCelebrated, markCelebrated } from '../lib/useTaskActions';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { AnimatedNumber, Segmented, Switch } from './ui/primitives';
import { useToast } from './ui/Toast';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

const STUDY_TYPES: { value: ManualTaskType; label: string }[] = [
  { value: 'learn', label: 'Learn' },
  { value: 'practice', label: 'Practice' },
  { value: 'build', label: 'Build' },
  { value: 'review', label: 'Review' },
];
const QURAN_TYPES: { value: ManualTaskType; label: string }[] = [
  { value: 'memorize', label: 'Memorize' },
  { value: 'review', label: 'Review' },
];

export function AddTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateTask();
  const catalog = useCatalog();
  const submitRef = useRef<HTMLButtonElement>(null);

  const [trackChoice, setTrackChoice] = useState<TrackId | null>(null);
  const [streamChoice, setStreamChoice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [type, setType] = useState<ManualTaskType>('learn');
  const [pages, setPages] = useState('1');
  const [offCurriculum, setOffCurriculum] = useState(false);
  const [done, setDone] = useState(true);
  const [showFormula, setShowFormula] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setTitle('');
      setErrors({});
      setShowFormula(false);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const all = catalog.data?.tracks ?? [];
  const quranDef = all.find((t) => t.kind === 'quran');
  const choices: TrackDef[] = [
    ...(catalog.data?.quranEnabled && quranDef && !quranDef.archived ? [quranDef] : []),
    ...all.filter((t) => t.kind === 'study' && !t.archived),
  ];
  const defaultTrack = choices.find((t) => t.kind === 'study') ?? choices[0];
  const track: TrackId = trackChoice && choices.some((t) => t.id === trackChoice) ? trackChoice : (defaultTrack?.id ?? '');
  const trackDef = choices.find((t) => t.id === track);
  const isQuran = trackDef?.kind === 'quran';
  const effectiveType: ManualTaskType = isQuran ? (type === 'review' ? 'review' : 'memorize') : type === 'memorize' ? 'learn' : type;
  const streams = trackDef?.streams.filter((s) => !s.archived) ?? [];
  const firstStream = streams[0]?.id;
  const stream = streams.length > 1 ? (streamChoice && streams.some((s) => s.id === streamChoice) ? streamChoice : firstStream) : undefined;

  const chooseTrack = (t: TrackId) => {
    setTrackChoice(t);
    setStreamChoice(null);
    const def = choices.find((x) => x.id === t);
    if (def?.kind === 'quran') setType((cur) => (cur === 'review' ? 'review' : 'memorize'));
    else setType((cur) => (cur === 'memorize' ? 'learn' : cur));
  };

  const minutesNum = Number(minutes);
  const pagesNum = Number(pages);
  const isQuranMemorize = Boolean(isQuran) && effectiveType === 'memorize';

  const input: ManualTaskInput | null = useMemo(() => {
    if (!track) return null;
    if (!Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > 600) return null;
    if (isQuranMemorize && (!Number.isInteger(pagesNum) || pagesNum < 1 || pagesNum > 20)) return null;
    return {
      track,
      ...(stream ? { stream } : {}),
      title: title.trim() || 'Preview',
      minutes: minutesNum,
      type: effectiveType,
      ...(isQuranMemorize ? { pagesCount: pagesNum } : {}),
      ...(!isQuran ? { offCurriculum } : {}),
    };
  }, [track, stream, title, minutesNum, pagesNum, effectiveType, offCurriculum, isQuranMemorize, isQuran]);

  const previewInput = useDebounced(input ? { ...input, title: 'Preview' } : null, 300);
  const preview = useScorePreview(previewInput);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the task a short title.';
    if (!Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > 600) e.minutes = 'Minutes must be a whole number from 1 to 600.';
    if (isQuranMemorize && (!Number.isInteger(pagesNum) || pagesNum < 1 || pagesNum > 20)) e.pagesCount = 'Pages must be from 1 to 20.';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0 || !input) return;
    const before = qc.getQueryData<Dashboard>(qk.dashboard);
    try {
      const task = await create.mutateAsync({ ...input, title: title.trim(), completed: done });
      const pts = task.earnedPoints ?? 0;
      if (done) {
        burstFrom(submitRef.current);
        toast({ title: `Logged: +${pts} points`, body: task.title });
        if (before && !before.capacity.isRestDay && !before.streak.todayCounts && before.pointsToday + pts >= before.baseline.value && !alreadyCelebrated(before.date)) {
          markCelebrated(before.date);
          window.setTimeout(() => {
            celebrate();
            toast({ tone: 'celebrate', title: 'Streak secured', body: `Today counts: ${before.pointsToday + pts} of ${before.baseline.value} points.` });
          }, 350);
        }
      } else {
        toast({ tone: 'info', title: 'Task added to today', body: `${task.title}. Worth ${task.plannedPoints} points when completed.` });
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.details.length > 0) {
        const map: Record<string, string> = {};
        for (const d of err.details) map[d.path || 'form'] = d.message;
        setErrors(map);
      } else {
        setErrors({ form: errorMessage(err) });
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a task"
      description="Log study or Quran work you did outside the plan, or add it for later today."
      labelledBy="add-task-title"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button ref={submitRef} type="submit" form="add-task-form" variant="primary" icon={Plus} loading={create.isPending} data-testid="add-task-submit">
            {done ? 'Log task' : 'Add to today'}
          </Button>
        </>
      }
    >
      <form id="add-task-form" onSubmit={submit} className="flex flex-col gap-5" data-testid="add-task-form" noValidate>
        <fieldset>
          <legend className="label mb-2">Track</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {choices.length === 0 && (
              <p className="col-span-full text-sm text-muted">
                No tracks yet.{' '}
                <Link to="/import" className="text-accent-ink underline underline-offset-2">
                  Import a plan
                </Link>{' '}
                or turn Quran on in Settings.
              </p>
            )}
            {choices.map((c) => {
              const m = metaFor(catalog.data, c.id);
              const active = track === c.id;
              const I = m.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseTrack(c.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex h-11 items-center justify-center gap-1.5 rounded-[10px] border px-2 text-sm font-medium whitespace-nowrap transition-colors',
                    active ? cn(m.border, m.soft, m.text) : 'border-line bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  <I size={17} aria-hidden />
                  {c.shortLabel}
                </button>
              );
            })}
          </div>
        </fieldset>

        {streams.length > 1 && (
          <div>
            <div className="label mb-2">Stream</div>
            <Segmented label={`${trackDef?.shortLabel ?? 'Track'} stream`} value={stream ?? firstStream ?? ''} onChange={setStreamChoice} options={streams.map((s) => ({ value: s.id, label: s.shortLabel }))} />
          </div>
        )}

        <div>
          <label htmlFor="task-title" className="label mb-2 block">
            Title
          </label>
          <input
            id="task-title"
            className="field"
            value={title}
            maxLength={200}
            placeholder={isQuran ? 'Extra page with my teacher' : 'Watched a lecture on attention'}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title && <p className="mt-1.5 text-xs text-danger">{errors.title}</p>}
        </div>

        <div>
          <div className="label mb-2">Type</div>
          <Segmented
            label="Task type"
            value={effectiveType}
            onChange={setType}
            options={
              isQuran ? QURAN_TYPES : STUDY_TYPES.map((t) => ({ ...t, label: typeLabel(trackDef, t.value) }))
            }
          />
          {errors.type && <p className="mt-1.5 text-xs text-danger">{errors.type}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-minutes" className="label mb-2 block">
              Minutes
            </label>
            <input
              id="task-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={600}
              className="field num"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              aria-invalid={Boolean(errors.minutes)}
            />
            {errors.minutes && <p className="mt-1.5 text-xs text-danger">{errors.minutes}</p>}
          </div>
          {isQuranMemorize && (
            <div>
              <label htmlFor="task-pages" className="label mb-2 block">
                Pages memorized
              </label>
              <input
                id="task-pages"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className="field num"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                aria-invalid={Boolean(errors.pagesCount)}
              />
              {errors.pagesCount && <p className="mt-1.5 text-xs text-danger">{errors.pagesCount}</p>}
            </div>
          )}
        </div>

        <div className="rounded-[10px] border border-line bg-surface-2/50 px-3 py-1">
          {!isQuran && (
            <Switch
              checked={offCurriculum}
              onChange={setOffCurriculum}
              label="Off-curriculum"
              description="Not part of the current module. Counts at 0.85x and does not move module progress."
            />
          )}
          <Switch
            checked={done}
            onChange={setDone}
            label="Already done"
            description={done ? 'Points are added right away.' : 'Adds a pending task to today.'}
          />
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-accent/25 bg-accent/8 p-4" data-testid="points-preview">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
            <Lightning size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <AnimatePresence mode="wait" initial={false}>
                {preview.data && input ? (
                  <motion.span key="pts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-baseline gap-1.5">
                    <AnimatedNumber value={preview.data.points} className="text-2xl font-semibold text-accent-ink" data-testid="preview-points" />
                    <span className="text-sm text-muted">points</span>
                  </motion.span>
                ) : (
                  <motion.span key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted">
                    {input ? 'Calculating...' : 'Enter valid minutes to see points'}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <p className="text-xs text-muted">
              Points are calculated automatically.{' '}
              {preview.data && input && (
                <button type="button" aria-expanded={showFormula} onClick={() => setShowFormula((v) => !v)} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                  How?
                </button>
              )}
            </p>
            {showFormula && preview.data && input && <p className="num mt-0.5 truncate text-[11px] text-subtle">{preview.data.formula}</p>}
          </div>
        </div>

        {errors.form && (
          <p role="alert" className="text-sm text-danger">
            {errors.form}
          </p>
        )}
      </form>
    </Dialog>
  );
}
