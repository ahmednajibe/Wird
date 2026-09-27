import { CheckCircle, Info, SealCheck, WarningCircle, X, type Icon } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/format';

type Tone = 'success' | 'error' | 'info' | 'celebrate';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}

interface ToastCtx {
  toast: (t: { title: string; body?: string; tone?: Tone }) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const icons: Record<Tone, Icon> = { success: CheckCircle, error: WarningCircle, info: Info, celebrate: SealCheck };
const iconTone: Record<Tone, string> = {
  success: 'text-accent-ink bg-accent/12',
  celebrate: 'text-on-accent bg-accent',
  error: 'text-danger bg-danger/12',
  info: 'text-muted bg-surface-2',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastCtx['toast']>(
    ({ title, body, tone = 'success' }) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-2), { id, title, tone, ...(body ? { body } : {}) }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3800);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[84px] z-[60] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const I = icons[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-surface p-3.5 shadow-pop',
                  t.tone === 'celebrate' ? 'border-accent/40' : 'border-line',
                )}
              >
                <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full', iconTone[t.tone])}>
                  <I size={18} aria-hidden />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-sm text-muted">{t.body}</p>}
                </div>
                <button type="button" onClick={() => dismiss(t.id)} className="rounded-full p-1 text-subtle hover:text-ink" aria-label="Dismiss">
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}
