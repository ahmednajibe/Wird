import { ArrowCounterClockwise, CalendarCheck, CaretDown, CheckCircle, Flag, Path, Target } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { errorMessage } from '../client/client';
import { useCatalog, useModuleAction, useTracks } from '../client/hooks';
import type { StreamProjection, TrackModule, TrackStreamGroup } from '../client/types';
import { ResourceLinks } from '../components/TaskCard';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Card, Chip, EmptyState, ErrorState, PageHeader, ProgressBar, Segmented, Skeleton } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { cn, formatHours, formatMediumDate } from '../lib/format';
import { useTrackMeta } from '../lib/tracks';
import { ResourcesView } from './Resources';

function PhaseTimeline({ group, projection, color, onSelect }: { group: TrackStreamGroup; projection: StreamProjection | null; color: string; onSelect: (phaseId: string) => void }) {
  const currentPhase = group.phases.find((p) => p.modules.some((m) => m.isCurrent))?.id;
  return (
    <ol className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {group.phases.map((p, i) => {
        const pp = projection?.phases.find((x) => x.phaseId === p.id);
        const done = pp?.completed ?? p.modules.every((m) => m.progress.completed);
        const current = p.id === currentPhase;
        const credited = p.modules.reduce((a, m) => a + (m.progress.completed ? m.estMinutes : Math.min(m.progress.creditedMinutes, m.estMinutes)), 0);
        const est = p.modules.reduce((a, m) => a + m.estMinutes, 0);
        return (
          <li key={p.id} className="relative flex min-w-[180px] flex-1">
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'flex w-full flex-col gap-2 rounded-2xl border p-3 text-left transition-colors',
                current ? 'border-line-strong bg-surface-2' : 'border-line bg-surface-2/40 hover:bg-surface-2/80',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn('num inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', done ? 'text-on-accent' : 'text-ink')}
                  style={{ background: done ? color : 'var(--surface-3)' }}
                >
                  {done ? <CheckCircle size={14} weight="fill" aria-hidden /> : i + 1}
                </span>
                <span className="truncate text-sm font-semibold text-ink" title={p.title}>
                  {p.title}
                </span>
              </div>
              <ProgressBar value={credited} max={est} height={5} color={color} label={`${p.title} progress`} />
              <div className="flex justify-between text-[11px] text-muted">
                <span>{done ? 'Done' : current ? 'In progress' : 'Up next'}</span>
                <span className="num">{done ? '' : pp?.projectedCompletionDate ? formatMediumDate(pp.projectedCompletionDate) : 'No date yet'}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ModuleCard({
  m,
  color,
  onAction,
}: {
  m: TrackModule;
  color: string;
  onAction: (m: TrackModule, action: 'complete' | 'reset') => void;
}) {
  const p = m.progress;
  return (
    <div
      data-testid="module-card"
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 transition-colors',
        m.isCurrent ? 'border-2 bg-surface-2/70' : 'border-line bg-surface',
        p.completed && 'opacity-85',
      )}
      style={m.isCurrent ? { borderColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {m.isCurrent && (
              <Chip tone="accent" icon={Target}>
                Current
              </Chip>
            )}
            {p.completed && (
              <Chip tone="accent" icon={CheckCircle}>
                Complete
              </Chip>
            )}
            {m.kind === 'project' && <Chip>Project</Chip>}
          </div>
          <h4 className="text-[15px] font-semibold tracking-tight text-ink">{m.title}</h4>
        </div>
      </div>
      <div>
        <ProgressBar value={p.completed ? p.estMinutes : Math.min(p.creditedMinutes, p.estMinutes)} max={p.estMinutes} height={8} color={color} label={`${m.title} progress`} />
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          <span>
            <span className="num text-ink">{formatHours(p.creditedMinutes)}</span> of{' '}
            <span
              className="num"
              title={m.estimateUncertain ? 'Rough estimate: the hours for this module are a guess, so its projection may move.' : undefined}
            >
              {m.estimateUncertain && '~'}
              {formatHours(p.estMinutes)}
              {m.estimateUncertain && <span className="sr-only"> (rough estimate)</span>}
            </span>
          </span>
          <span className="num">{Math.round(p.percent)}%</span>
        </div>
      </div>
      {m.note && <p className="text-xs text-muted">{m.note}</p>}
      {m.resources.length > 0 && (
        <ResourceLinks
          resources={m.resources.map((r) => ({
            name: r.name,
            url: r.url ?? null,
            owned: Boolean(r.owned),
            paid: Boolean(r.paid),
            access: r.owned ? 'owned' : r.paid ? 'paid' : 'free',
            note: r.note ?? null,
          }))}
        />
      )}
      <div className="mt-auto flex gap-2 pt-1">
        {p.completed ? (
          <Button size="sm" variant="ghost" icon={ArrowCounterClockwise} onClick={() => onAction(m, 'reset')}>
            Reset
          </Button>
        ) : (
          <Button size="sm" variant={m.isCurrent ? 'secondary' : 'ghost'} icon={CheckCircle} onClick={() => onAction(m, 'complete')}>
            Mark complete
          </Button>
        )}
      </div>
    </div>
  );
}

function StreamSection({ group, onAction, index }: { group: TrackStreamGroup; onAction: (m: TrackModule, a: 'complete' | 'reset') => void; index: number }) {
  const trackMeta = useTrackMeta();
  const meta = trackMeta(group.track, group.stream);
  const I = meta.icon;
  const pr = group.projection;
  const all = group.phases.flatMap((p) => p.modules);
  const doneCount = all.filter((m) => m.progress.completed).length;
  // The phase with the current module stays open; otherwise the first unfinished one.
  const firstOpen =
    group.phases.find((p) => p.modules.some((m) => m.isCurrent))?.id ?? group.phases.find((p) => !p.modules.every((m) => m.progress.completed))?.id;
  const [openPhases, setOpenPhases] = useState<ReadonlySet<string>>(() => new Set(firstOpen ? [firstOpen] : []));
  const togglePhase = (id: string) =>
    setOpenPhases((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const showPhase = (id: string) => {
    setOpenPhases((s) => new Set(s).add(id));
    requestAnimationFrame(() => document.getElementById(`phase-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const total = pr?.totalMinutes ?? all.reduce((a, m) => a + m.estMinutes, 0);
  const remaining = pr?.remainingMinutes ?? 0;
  const key = `${group.track}/${group.stream}`;
  return (
    <motion.section
      id={key.replace('/', '-')}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 320, damping: 32 }}
      className="card scroll-mt-20 p-5 sm:p-6"
      data-testid="track-section"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-2xl', meta.soft, meta.text)}>
            <I size={24} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-ink">{meta.label}</h2>
            <p className="text-sm text-muted">
              {group.currentModuleTitle ? (
                <>
                  Now: <span className="text-ink">{group.currentModuleTitle}</span>
                </>
              ) : (
                'All scheduled modules complete'
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:min-w-[420px]">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">Modules</div>
            <div className="num text-base font-semibold text-ink">
              {doneCount}/{all.length}
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">Per week</div>
            <div className="num text-base font-semibold text-ink">{formatHours(pr?.weeklyPlannedMinutes ?? 0)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <div className="text-[11px] text-muted">Projected finish</div>
            <div className="num text-base font-semibold text-ink">{pr?.projectedCompletionDate ? formatMediumDate(pr.projectedCompletionDate) : 'Not scheduled'}</div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar value={total - remaining} max={total} height={10} color={meta.cssVar} label={`${meta.label} overall progress`} />
        <div className="mt-1.5 flex justify-between text-xs text-muted">
          <span>
            <span className="num text-ink">{formatHours(total - remaining)}</span> of <span className="num">{formatHours(total)}</span> done
          </span>
          <span>
            <span className="num">{formatHours(remaining)}</span> left
            {pr?.weeksRemaining != null && (
              <>
                , about <span className="num">{Math.ceil(pr.weeksRemaining)}</span> weeks
              </>
            )}
          </span>
        </div>
      </div>
      <div className="mt-5">
        <h3 className="label mb-2 flex items-center gap-1.5">
          <Flag size={13} aria-hidden /> Phases
        </h3>
        <PhaseTimeline group={group} projection={pr} color={meta.cssVar} onSelect={showPhase} />
        {all.some((m) => m.estimateUncertain) && <p className="mt-2 text-xs text-muted">~ marks a rough estimate.</p>}
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {group.phases.map((p) => {
          const open = openPhases.has(p.id);
          const done = p.modules.filter((m) => m.progress.completed).length;
          const credited = p.modules.reduce((a, m) => a + (m.progress.completed ? m.estMinutes : Math.min(m.progress.creditedMinutes, m.estMinutes)), 0);
          const est = p.modules.reduce((a, m) => a + m.estMinutes, 0);
          return (
            <div key={p.id} id={`phase-${p.id}`} className="scroll-mt-24">
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => togglePhase(p.id)}
                  className="flex w-full items-center gap-2 text-left text-sm font-semibold text-ink"
                >
                  <span className="num shrink-0 text-xs text-muted">{p.id}</span>
                  <span className="min-w-0 break-words sm:truncate">{p.title}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-3">
                    {!open && (
                      <>
                        <span className="num text-xs font-normal text-muted">
                          {done}/{p.modules.length} modules
                        </span>
                        <span className="hidden w-20 sm:block sm:w-36">
                          <ProgressBar value={credited} max={est} height={4} color={meta.cssVar} label={`${p.title} progress`} />
                        </span>
                      </>
                    )}
                    <motion.span
                      animate={{ rotate: open ? 180 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="inline-flex text-muted"
                    >
                      <CaretDown size={15} aria-hidden />
                    </motion.span>
                  </span>
                </button>
              </h3>
              {open && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {p.modules.map((m) => (
                    <ModuleCard key={m.id} m={m} color={meta.cssVar} onAction={onAction} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

function StreamTab({ group, active, onSelect }: { group: TrackStreamGroup; active: boolean; onSelect: () => void }) {
  const trackMeta = useTrackMeta();
  const meta = trackMeta(group.track, group.stream);
  const I = meta.icon;
  const pr = group.projection;
  const all = group.phases.flatMap((p) => p.modules);
  const total = pr?.totalMinutes ?? all.reduce((a, m) => a + m.estMinutes, 0);
  const done = total - (pr?.remainingMinutes ?? 0);
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      whileTap={{ scale: 0.98 }}
      data-testid="track-tab"
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-2xl border p-4 text-left transition-colors',
        active ? 'bg-surface-2 shadow-card' : 'border-line bg-surface hover:bg-surface-2/60',
      )}
      style={active ? { borderColor: meta.cssVar } : undefined}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-xl', meta.soft, meta.text)}>
          <I size={18} aria-hidden />
        </span>
        <span className="truncate text-sm font-semibold text-ink">{meta.label}</span>
        <span className="num ml-auto text-xs text-muted">{total > 0 ? Math.round((done / total) * 100) : 0}%</span>
      </div>
      <ProgressBar value={done} max={total} height={6} color={meta.cssVar} />
      <div className="truncate text-xs text-muted">
        {pr?.projectedCompletionDate ? <>Finish around {formatMediumDate(pr.projectedCompletionDate)}</> : 'Not scheduled in a normal week'}
      </div>
    </motion.button>
  );
}

export function TracksPage() {
  const q = useTracks();
  const catalog = useCatalog();
  const action = useModuleAction();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState<{ m: TrackModule; action: 'complete' | 'reset' } | null>(null);

  const run = async () => {
    if (!pending) return;
    try {
      await action.mutateAsync({ id: pending.m.id, action: pending.action });
      toast({
        title: pending.action === 'complete' ? 'Module complete' : 'Module reset',
        body: `${pending.m.title}. The plan from today was rebuilt.`,
      });
    } catch (err) {
      toast({ tone: 'error', title: 'Could not update the module', body: errorMessage(err) });
    }
    setPending(null);
  };

  const selectedParam = params.get('s');
  const streams = q.data?.streams ?? [];
  const selected = streams.find((g) => `${g.track}.${g.stream}` === selectedParam) ?? streams[0];
  const view = params.get('view') === 'resources' ? 'resources' : 'modules';
  const setView = (v: 'modules' | 'resources') =>
    setParams(
      { ...(selectedParam ? { s: selectedParam } : {}), ...(v === 'resources' ? { view: 'resources' } : {}) },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tracks"
        subtitle={
          view === 'resources'
            ? 'Everything the plan uses, grouped by track, with the modules that use each one.'
            : 'Your curriculum, phase by phase. Progress comes from the minutes you complete; projections use your normal week.'
        }
        actions={
          <>
            <Segmented<'modules' | 'resources'>
              label="Tracks view"
              value={view}
              onChange={setView}
              options={[
                { value: 'modules', label: 'Modules' },
                { value: 'resources', label: 'Resources' },
              ]}
            />
            {q.data && (
              <Chip tone="accent" icon={CalendarCheck}>
                {q.data.totals.completedModules} of {q.data.totals.modules} modules done
              </Chip>
            )}
          </>
        }
      />
      {view === 'resources' ? (
        <ResourcesView />
      ) : q.isPending ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-[520px] rounded-2xl" />
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !selected ? (
        <Card>
          <EmptyState
            icon={Path}
            title="No study plan yet"
            body="Import a plan to add tracks, streams and modules."
            action={
              catalog.data && !catalog.data.hasPlan ? (
                <Link to="/import" className="text-accent-ink underline underline-offset-2">
                  Import a plan
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div role="tablist" aria-label="Tracks" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {streams.map((g) => {
              const key = `${g.track}.${g.stream}`;
              return (
                <StreamTab
                  key={key}
                  group={g}
                  active={g === selected}
                  onSelect={() => setParams(g === streams[0] ? {} : { s: key }, { replace: true })}
                />
              );
            })}
          </div>
          <StreamSection key={`${selected.track}/${selected.stream}`} group={selected} index={0} onAction={(m, a) => setPending({ m, action: a })} />
        </>
      )}
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void run()}
        loading={action.isPending}
        tone={pending?.action === 'reset' ? 'danger' : 'primary'}
        title={pending?.action === 'reset' ? 'Reset this module?' : 'Mark this module complete?'}
        confirmLabel={pending?.action === 'reset' ? 'Reset module' : 'Mark complete'}
        body={
          pending?.action === 'reset'
            ? `${pending.m.title} goes back to 0 credited minutes from now on. Completed tasks and their points stay. The plan from today is rebuilt.`
            : `${pending?.m.title ?? ''} is marked done and the plan moves on to the next module from today. Points already earned stay the same.`
        }
      />
    </div>
  );
}
