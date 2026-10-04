import { ArrowClockwise, CaretDown, Question, WarningCircle, type Icon } from '@phosphor-icons/react';
import { animate, motion, useReducedMotion } from 'motion/react';
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { cn, durationParts, formatNumber } from '../../lib/format';
import { Button } from './Button';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={cn('card', className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, icon: I, action, className }: { title: ReactNode; subtitle?: ReactNode; icon?: Icon; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {I && (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <I size={17} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-md font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-ink md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted md:text-md">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type ChipTone =
  | 'neutral'
  | 'accent'
  | 'warn'
  | 'danger'
  | 'amber'
  | 'blue'
  | 'violet'
  | 'coral'
  | 'green'
  | 'teal'
  | 'rose'
  | 'slate';
const chipTones: Record<ChipTone, string> = {
  neutral: 'bg-surface-2 text-muted border-line',
  accent: 'bg-accent/12 text-accent-ink border-accent/25',
  warn: 'bg-warn/12 text-warn border-warn/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  amber: 'bg-amber/12 text-amber-ink border-amber/30',
  blue: 'bg-blue/12 text-blue-ink border-blue/30',
  violet: 'bg-violet/12 text-violet-ink border-violet/30',
  coral: 'bg-coral/12 text-coral-ink border-coral/30',
  green: 'bg-green/12 text-green-ink border-green/30',
  teal: 'bg-teal/12 text-teal-ink border-teal/30',
  rose: 'bg-rose/12 text-rose-ink border-rose/30',
  slate: 'bg-slate/12 text-slate-ink border-slate/30',
};

export function Chip({ tone = 'neutral', icon: I, children, className, title }: { tone?: ChipTone; icon?: Icon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap', chipTones[tone], className)}
    >
      {I && <I size={13} aria-hidden />}
      {children}
    </span>
  );
}

/** Chip tone for a catalog theme id; unknown ids fall back to neutral. */
export function trackTone(theme: string): ChipTone {
  return theme in chipTones ? (theme as ChipTone) : 'neutral';
}

export function ProgressBar({
  value,
  max,
  color = 'var(--accent-fill)',
  className,
  height = 8,
  label,
  animateOnMount = true,
}: {
  value: number;
  max: number;
  color?: string;
  className?: string;
  height?: number;
  label?: string;
  animateOnMount?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', className)}
      style={{ height }}
    >
      <motion.div
        className="absolute inset-y-0 start-0 w-full origin-left rounded-full rtl:origin-right"
        style={{ background: color }}
        initial={animateOnMount ? { scaleX: 0 } : false}
        animate={{ scaleX: pct }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className={cn('card flex flex-col items-start gap-3 border-danger/30 p-5 sm:flex-row sm:items-center', className)}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/12 text-danger">
        <WarningCircle size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{t('error.title')}</p>
        <p className="text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button icon={ArrowClockwise} onClick={onRetry} size="sm">
          {t('error.retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon: I, title, body, action, className }: { icon: Icon; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="relative inline-flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
        <span className="absolute inset-0 rounded-2xl border border-line" />
        <I size={28} weight="light" aria-hidden />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {body && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{body}</p>}
      </div>
      {action}
    </div>
  );
}

/** Animated counter for points. */
export function AnimatedNumber({
  value,
  className,
  format = formatNumber,
  ...rest
}: { value: number; className?: string; format?: (n: number) => string } & Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & { 'data-testid'?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el) return;
    if (reduce || from === value) {
      el.textContent = format(value);
      return;
    }
    el.textContent = format(from);
    const controls = animate(from, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, reduce, format]);
  return (
    <span ref={ref} className={cn('num', className)} data-value={value} {...rest}>
      {format(value)}
    </span>
  );
}

/** Circular progress ring (data viz). */
export function Ring({
  value,
  max,
  size = 160,
  stroke = 14,
  color = 'var(--accent-fill)',
  children,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : value > 0 ? 1 : 0;
  const r = (size - stroke) / 2;
  const id = useId();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 rtl:-scale-x-100">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity={0.75} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${CSS.escape(id)})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pct, opacity: pct === 0 ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  className,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean; testId?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-full font-medium transition-colors disabled:opacity-40',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-sm',
              active ? 'text-on-accent' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; id?: string }) {
  const { dir } = useI18n();
  const autoId = useId();
  const sid = id ?? autoId;
  // The thumb anchors at inline-start (left in LTR, right in RTL).
  const thumbX = dir === 'rtl' ? (checked ? -20 : 0) : checked ? 20 : 0;
  return (
    <label htmlFor={sid} className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border transition-colors', checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3')}
      >
        <motion.span
          className={cn('absolute top-0.5 start-0.5 size-[18px] rounded-full shadow-sm', checked ? 'bg-on-accent' : 'bg-ink/80')}
          animate={{ x: thumbX }}
          transition={{ type: 'spring', stiffness: 600, damping: 34 }}
        />
      </button>
    </label>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

export function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn('underline-offset-2 hover:underline', className)}>
      {children}
    </a>
  );
}

/** Small inline "?" button that opens a short explanation panel. Click toggles; Escape and outside clicks close it. */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={t('hint.about', { topic: label })}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          if (!open && ref.current) {
            const w = Math.min(288, window.innerWidth * 0.8);
            const left = ref.current.getBoundingClientRect().left;
            setShift(Math.min(Math.max(left, 12), window.innerWidth - w - 12) - left);
          }
          setOpen((v) => !v);
        }}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Question size={15} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          style={shift === 0 ? undefined : { left: shift }}
          className="absolute top-full left-0 z-20 mt-2 block w-72 max-w-[80vw] rounded-2xl border border-line-strong bg-surface p-3 text-start text-sm leading-relaxed font-normal text-muted shadow-pop"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Card whose header is a full-width toggle button; body renders only when open. Supports controlled and uncontrolled use. */
export function Disclosure({
  title,
  subtitle,
  icon: I,
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: Icon;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const id = useId();
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };
  return (
    <Card className={className} {...rest}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded-[inherit] p-5 text-start transition-colors hover:bg-surface-2/50 sm:p-6"
      >
        {I && (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <I size={19} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight text-ink">{title}</span>
          {subtitle && <span className="mt-0.5 block text-sm text-muted">{subtitle}</span>}
        </span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="inline-flex shrink-0 text-muted">
          <CaretDown size={17} aria-hidden />
        </motion.span>
      </button>
      {isOpen && (
        <div id={id} className="px-5 pb-5 sm:px-6 sm:pb-6">
          {children}
        </div>
      )}
    </Card>
  );
}

/** "1 h 48 min" / "1 س 40 د" with mono digits and sans units. */
export function Duration({ minutes, className }: { minutes: number; className?: string }) {
  useI18n(); // units follow the language
  const parts = durationParts(minutes);
  return (
    <span className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          {p.n === null ? (
            p.unit
          ) : (
            <>
              <span className="num">{p.n}</span> {p.unit}
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}

/** Tracks the viewport against a media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}
