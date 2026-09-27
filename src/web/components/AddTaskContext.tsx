import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AddTaskModal } from './AddTaskModal';

interface Ctx {
  open: () => void;
}

const AddTaskCtx = createContext<Ctx | null>(null);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function AddTaskProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <AddTaskCtx.Provider value={value}>
      {children}
      <AddTaskModal open={isOpen} onClose={close} />
    </AddTaskCtx.Provider>
  );
}

export function useAddTask(): Ctx {
  const v = useContext(AddTaskCtx);
  if (!v) throw new Error('useAddTask outside AddTaskProvider');
  return v;
}
