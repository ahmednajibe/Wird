import {
  Books,
  BookOpen,
  CalendarDots,
  ChartBar,
  Fire,
  GearSix,
  Moon,
  Path,
  Plus,
  Sun,
  SunHorizon,
  Upload,
  type Icon,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useCatalog, useDashboard } from '../client/hooks';
import { cn } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useAddTask } from './AddTaskContext';
import { Button, IconButton } from './ui/Button';
import { AnimatedNumber } from './ui/primitives';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  mobile: boolean;
  /** Only shown when Quran is enabled in Settings. */
  quran?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: SunHorizon, mobile: true },
  { to: '/plan', label: 'Plan', icon: CalendarDots, mobile: true },
  { to: '/tracks', label: 'Tracks', icon: Path, mobile: true },
  { to: '/quran', label: 'Quran', icon: BookOpen, mobile: true, quran: true },
  { to: '/stats', label: 'Stats', icon: ChartBar, mobile: true },
  { to: '/resources', label: 'Resources', icon: Books, mobile: false },
  { to: '/import', label: 'Import', icon: Upload, mobile: false },
  { to: '/settings', label: 'Settings', icon: GearSix, mobile: false },
];

function navItems(quranEnabled: boolean): NavItem[] {
  return NAV.filter((n) => !n.quran || quranEnabled);
}

function Logo() {
  const { data } = useCatalog();
  return (
    <div className="flex items-center gap-2.5">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--surface-2)" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <path d="M16 7a9 9 0 0 1 8.5 12" fill="none" stroke="var(--accent-fill)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-ink">Learning tracker</div>
        <div className="text-[11px] font-medium text-subtle">{data?.planName ?? 'Your learning plan'}</div>
      </div>
    </div>
  );
}

function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
      className={className}
      data-testid="theme-toggle"
    />
  );
}

function SidebarStatus() {
  const { data } = useDashboard();
  if (!data) return <div className="h-[92px]" />;
  const secured = data.streak.todayCounts;
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-xl',
            secured ? 'bg-accent text-on-accent' : 'bg-surface-3 text-muted',
          )}
        >
          <Fire size={20} weight={secured ? 'fill' : 'regular'} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <AnimatedNumber value={data.streak.current} className="text-lg font-semibold text-ink" />
            <span className="text-xs text-muted">day streak</span>
          </div>
          <div className="text-[11px] text-subtle">{secured ? 'Today is secured' : 'Today is still open'}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>Level {data.level.level}</span>
        <span className="num">
          {data.level.pointsIntoLevel}/{data.level.pointsForNextLevel} XP
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full origin-left rounded-full bg-accent-fill"
          initial={false}
          animate={{ scaleX: data.level.pointsForNextLevel > 0 ? data.level.pointsIntoLevel / data.level.pointsForNextLevel : 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>
    </div>
  );
}

function Sidebar() {
  const { open } = useAddTask();
  const { data: catalog } = useCatalog();
  const items = navItems(catalog?.quranEnabled ?? true);
  return (
    <div className="hidden w-[248px] shrink-0 border-r border-line bg-surface/40 md:block">
    <aside className="sticky top-0 flex h-dvh flex-col gap-6 px-4 py-6">
      <div className="px-2">
        <Logo />
      </div>
      <Button variant="primary" icon={Plus} onClick={open} className="w-full justify-between" data-testid="add-task-button">
        <span className="flex-1 text-left">Add task</span>
        <kbd className="num rounded-md bg-on-accent/15 px-1.5 text-[11px] font-semibold">N</kbd>
      </Button>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors',
                isActive ? 'text-ink' : 'text-muted hover:bg-surface-2/70 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full border border-line-strong bg-surface-2"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <item.icon size={19} weight={isActive ? 'fill' : 'regular'} className={cn('relative', isActive && 'text-accent-ink')} aria-hidden />
                <span className="relative">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <SidebarStatus />
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-subtle">Local only, 127.0.0.1</span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
    </div>
  );
}

function MobileTopBar() {
  const location = useLocation();
  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));
  // NB: NAV here only labels the top bar; hidden nav entries still get a title.
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect width="32" height="32" rx="9" fill="var(--surface-2)" />
          <circle cx="16" cy="16" r="9" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
          <path d="M16 7a9 9 0 0 1 8.5 12" fill="none" stroke="var(--accent-fill)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span className="text-[15px] font-bold tracking-tight">{current?.label ?? 'Learning tracker'}</span>
      </div>
      <div className="flex items-center">
        <NavLink to="/resources" aria-label="Resources" className={({ isActive }) => cn('inline-flex size-10 items-center justify-center rounded-full', isActive ? 'text-accent-ink' : 'text-muted')}>
          <Books size={20} aria-hidden />
        </NavLink>
        <NavLink to="/settings" aria-label="Settings" className={({ isActive }) => cn('inline-flex size-10 items-center justify-center rounded-full', isActive ? 'text-accent-ink' : 'text-muted')}>
          <GearSix size={20} aria-hidden />
        </NavLink>
        <ThemeToggle />
      </div>
    </header>
  );
}

function BottomTabs() {
  const { open } = useAddTask();
  const { data: catalog } = useCatalog();
  const items = navItems(catalog?.quranEnabled ?? true);
  return (
    <>
      <motion.button
        type="button"
        onClick={open}
        whileTap={{ scale: 0.96 }}
        aria-label="Add task"
        data-testid="add-task-fab"
        className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-on-accent shadow-glow md:hidden"
      >
        <Plus size={20} weight="bold" aria-hidden />
        Add
      </motion.button>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {items.filter((n) => n.mobile).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent-ink' : 'text-muted')
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={22} weight={isActive ? 'fill' : 'regular'} aria-hidden />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-36 sm:px-6 md:px-8 md:pt-8 md:pb-12">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}
