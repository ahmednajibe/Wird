import { BookOpen, Brain, Code, FilmSlate, PaintBrush, type Icon } from '@phosphor-icons/react';
import type { StreamId, TaskType, TrackId } from '../client/types';

export type TrackKey = 'quran' | 'fsd' | 'ai' | 'draw' | 'story';

export interface TrackMeta {
  key: TrackKey;
  label: string;
  short: string;
  icon: Icon;
  /** Tailwind classes built from the semantic data colors. */
  text: string;
  bg: string;
  soft: string;
  border: string;
  fill: string;
  cssVar: string;
}

const meta: Record<TrackKey, TrackMeta> = {
  quran: {
    key: 'quran',
    label: 'Quran',
    short: 'Quran',
    icon: BookOpen,
    text: 'text-quran-ink',
    bg: 'bg-quran',
    soft: 'bg-quran/12',
    border: 'border-quran/40',
    fill: 'fill-quran',
    cssVar: 'var(--quran)',
  },
  fsd: {
    key: 'fsd',
    label: 'Full Stack',
    short: 'Full Stack',
    icon: Code,
    text: 'text-fsd-ink',
    bg: 'bg-fsd',
    soft: 'bg-fsd/12',
    border: 'border-fsd/40',
    fill: 'fill-fsd',
    cssVar: 'var(--fsd)',
  },
  ai: {
    key: 'ai',
    label: 'AI',
    short: 'AI',
    icon: Brain,
    text: 'text-ai-ink',
    bg: 'bg-ai',
    soft: 'bg-ai/12',
    border: 'border-ai/40',
    fill: 'fill-ai',
    cssVar: 'var(--ai)',
  },
  draw: {
    key: 'draw',
    label: 'Animation: Draw',
    short: 'Draw',
    icon: PaintBrush,
    text: 'text-anim-ink',
    bg: 'bg-anim',
    soft: 'bg-anim/12',
    border: 'border-anim/40',
    fill: 'fill-anim',
    cssVar: 'var(--anim)',
  },
  story: {
    key: 'story',
    label: 'Animation: Story',
    short: 'Story',
    icon: FilmSlate,
    text: 'text-anim-ink',
    bg: 'bg-anim',
    soft: 'bg-anim/12',
    border: 'border-anim/40',
    fill: 'fill-anim',
    cssVar: 'var(--anim)',
  },
};

export function trackKey(track: TrackId, stream: StreamId): TrackKey {
  if (track === 'animation') return stream === 'story' ? 'story' : 'draw';
  return track as TrackKey;
}

export function trackMeta(track: TrackId, stream: StreamId = 'main'): TrackMeta {
  return meta[trackKey(track, stream)];
}

export const TRACK_ORDER: TrackKey[] = ['quran', 'fsd', 'ai', 'draw', 'story'];
export const metaByKey = (k: TrackKey): TrackMeta => meta[k];

export const TYPE_LABELS: Record<TaskType, string> = {
  learn: 'Learn',
  practice: 'Practice',
  build: 'Build',
  review: 'Review',
  'quran-memorize': 'Memorize',
  'quran-review': 'Review',
};

export const INTENSITY_LABELS = { deep: 'Deep focus', normal: 'Normal', light: 'Light' } as const;
