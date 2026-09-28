/**
 * Plan-pack icon ids -> Phosphor components. Unknown ids get a neutral
 * fallback so imported plans always render something sensible.
 */
import {
  Barbell,
  BookOpen,
  Brain,
  Calculator,
  Camera,
  ChartLine,
  Code,
  CookingPot,
  FilmSlate,
  Flask,
  Globe,
  Heartbeat,
  MusicNotes,
  PaintBrush,
  PenNib,
  Tag,
  Translate,
  type Icon,
} from '@phosphor-icons/react';
import { ICONS } from '../../shared/pack.js';

export type IconId = (typeof ICONS)[number];

const MAP: Record<IconId, Icon> = {
  'book-open': BookOpen,
  code: Code,
  brain: Brain,
  'paint-brush': PaintBrush,
  'film-slate': FilmSlate,
  flask: Flask,
  globe: Globe,
  translate: Translate,
  'cooking-pot': CookingPot,
  'music-notes': MusicNotes,
  calculator: Calculator,
  heartbeat: Heartbeat,
  camera: Camera,
  'pen-nib': PenNib,
  barbell: Barbell,
  'chart-line': ChartLine,
};

export const FALLBACK_ICON: Icon = Tag;

export function iconFor(id: string | null | undefined): Icon {
  return (id && MAP[id as IconId]) || FALLBACK_ICON;
}
