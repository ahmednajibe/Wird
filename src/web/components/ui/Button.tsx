import type { Icon } from '@phosphor-icons/react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  icon?: Icon;
  iconRight?: Icon;
  loading?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent font-semibold shadow-glow hover:brightness-105 disabled:opacity-50 disabled:shadow-none',
  secondary: 'bg-surface-2 text-ink border border-line-strong hover:bg-surface-3 disabled:opacity-50',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-50',
  danger: 'bg-danger/12 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-50',
  quiet: 'text-accent-ink hover:bg-accent/10 font-semibold disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const iconSizes: Record<Size, number> = { sm: 14, md: 17, lg: 19 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: IconL, iconRight: IconR, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full whitespace-nowrap transition-[background-color,color,filter,border-color] duration-150 select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {IconL && <IconL size={iconSizes[size]} weight="regular" className={cn(loading && 'opacity-40')} aria-hidden />}
      {children}
      {IconR && <IconR size={iconSizes[size]} weight="regular" aria-hidden />}
    </motion.button>
  );
});

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: Icon;
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: I, label, size = 'md', tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150',
        size === 'sm' ? 'size-8' : 'size-10',
        tone === 'danger' ? 'text-muted hover:bg-danger/12 hover:text-danger' : 'text-muted hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...rest}
    >
      <I size={size === 'sm' ? 16 : 19} aria-hidden />
    </motion.button>
  );
});
