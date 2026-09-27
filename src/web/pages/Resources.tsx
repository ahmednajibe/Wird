import { ArrowSquareOut, Books, Info, Tray } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { errorMessage } from '../client/client';
import { useResources } from '../client/hooks';
import type { ResourcesResponse } from '../client/types';
import { AccessBadge } from '../components/TaskCard';
import { Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/primitives';
import { cn } from '../lib/format';
import { metaByKey, trackKey } from '../lib/tracks';

type Stream = ResourcesResponse['streams'][number];

const TITLES: Record<string, string> = {
  'ai/main': 'AI',
  'fsd/main': 'Full Stack',
  'animation/draw': 'Animation: Draw',
  'animation/story': 'Animation: Story',
};

function StreamBlock({ s, index }: { s: Stream; index: number }) {
  const meta = metaByKey(trackKey(s.track, s.stream));
  const I = meta.icon;
  const key = `${s.track}/${s.stream}`;
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 340, damping: 32 }}
      className="card p-5 sm:p-6"
      data-testid="resource-stream"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn('inline-flex size-10 items-center justify-center rounded-2xl', meta.soft, meta.text)}>
            <I size={22} aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">{TITLES[key] ?? meta.label}</h2>
            <p className="text-xs text-muted">{s.resources.length} resources in the plan</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.counts.owned > 0 && <Chip tone="accent">{s.counts.owned} owned</Chip>}
          <Chip>{s.counts.free} free</Chip>
          {s.counts.paid > 0 && <Chip tone="warn">{s.counts.paid} paid</Chip>}
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {s.resources.map((r) => (
          <li key={r.url ?? r.name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent-ink">
                    {r.name}
                    <ArrowSquareOut size={14} className="text-muted" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium text-ink">{r.name}</span>
                )}
                <AccessBadge access={r.access} />
              </div>
              {r.note && <p className="mt-0.5 text-xs text-muted">{r.note}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[50%] sm:justify-end">
              {r.modules.map((m) => (
                <span
                  key={m.id}
                  className={cn('inline-flex h-6 items-center rounded-full border px-2 text-xs', m.completed ? 'border-accent/25 text-accent-ink' : 'border-line text-muted')}
                  title={`${m.phaseTitle}${m.estimateUncertain ? '. Estimate uncertain' : ''}`}
                >
                  {m.title}
                  {m.estimateUncertain && <Info size={12} className="ml-1 text-warn" aria-label="Estimate uncertain" />}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {s.unscheduled.length > 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Tray size={16} aria-hidden /> Owned, not scheduled
          </h3>
          <ul className="mt-2 flex flex-col gap-2">
            {s.unscheduled.map((r) => (
              <li key={r.url ?? r.name} className="flex flex-wrap items-center gap-2 text-sm">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink hover:text-accent-ink">
                    {r.name}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{r.name}</span>
                )}
                <AccessBadge access={r.access} />
                {r.note && <span className="text-xs text-muted">Note: {r.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.section>
  );
}

export function ResourcesPage() {
  const q = useResources();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Resources" subtitle="Everything the plan uses, grouped by track, with the modules that use each one." />
      {q.isPending ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : q.data.streams.length === 0 ? (
        <Card>
          <EmptyState icon={Books} title="No resources" />
        </Card>
      ) : (
        <>
          <AnimationNote streams={q.data.streams} />
          {q.data.streams.map((s, i) => (
            <StreamBlock key={`${s.track}/${s.stream}`} s={s} index={i} />
          ))}
        </>
      )}
    </div>
  );
}

function AnimationNote({ streams }: { streams: Stream[] }) {
  const anim = streams.filter((s) => s.track === 'animation');
  const paid = anim.flatMap((s) => s.resources.filter((r) => r.access === 'paid'));
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-anim/30 bg-anim/8 p-4" data-testid="animation-note">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-anim/15 text-anim-ink">
        <Info size={19} aria-hidden />
      </span>
      <div className="text-sm">
        <p className="font-semibold text-ink">All animation resources are free alternatives</p>
        <p className="mt-0.5 text-muted">
          You own no animation courses, so the Draw and Story streams use free material such as Drawabox and Pixar in a Box.
          {paid.length > 0 && ` The only paid item, ${paid.map((r) => r.name).join(', ')}, is optional.`}
        </p>
      </div>
    </div>
  );
}
