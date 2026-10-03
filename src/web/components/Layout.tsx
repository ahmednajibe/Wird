import {
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
  type Icon,
} from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useCatalog, useDashboard, useHealth } from '../client/hooks';
import { useI18n, type StringKey } from '../i18n';
import { cn } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useAddTask } from './AddTaskContext';
import { Button, IconButton } from './ui/Button';
import { AnimatedNumber } from './ui/primitives';

interface NavItem {
  to: string;
  labelKey: StringKey;
  icon: Icon;
  mobile: boolean;
  /** Only shown when Quran is enabled in Settings. */
  quran?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.today', icon: SunHorizon, mobile: true },
  { to: '/plan', labelKey: 'nav.plan', icon: CalendarDots, mobile: true },
  { to: '/tracks', labelKey: 'nav.tracks', icon: Path, mobile: true },
  { to: '/quran', labelKey: 'nav.quran', icon: BookOpen, mobile: true, quran: true },
  { to: '/stats', labelKey: 'nav.stats', icon: ChartBar, mobile: true },
  { to: '/settings', labelKey: 'nav.settings', icon: GearSix, mobile: false },
];

function navItems(quranEnabled: boolean): NavItem[] {
  return NAV.filter((n) => !n.quran || quranEnabled);
}

function Logo() {
  const { data } = useCatalog();
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" width={30} height={30} alt="" aria-hidden />
      <div className="leading-tight">
        <div className="text-[15px] font-bold tracking-tight text-ink">Wird</div>
        <div className="text-[11px] font-medium text-subtle">{data?.planName ?? t('app.planFallback')}</div>
      </div>
    </div>
  );
}

function VersionTag() {
  const { data } = useHealth();
  return <div className="text-xs text-subtle">Wird {data?.version ?? ''}</div>;
}

function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
      onClick={toggle}
      className={className}
      data-testid="theme-toggle"
    />
  );
}

function SidebarStatus() {
  const { data } = useDashboard();
  const { t, tnRich } = useI18n();
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
          <div className="flex items-baseline gap-1 text-xs text-muted">
            {tnRich('common.streakDays', data.streak.current, {
              count: <AnimatedNumber value={data.streak.current} className="text-lg font-semibold text-ink" />,
            })}
          </div>
          <div className="text-[11px] text-subtle">{secured ? t('sidebar.secured') : t('sidebar.open')}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span>{t('sidebar.level', { level: data.level.level })}</span>
        <span className="num">{t('sidebar.levelPoints', { into: data.level.pointsIntoLevel, total: data.level.pointsForNextLevel })}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className="h-full origin-left rounded-full bg-accent-fill rtl:origin-right"
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
  const { t } = useI18n();
  const location = useLocation();
  const items = navItems(catalog?.quranEnabled ?? true);
  return (
    <div className="hidden w-[248px] shrink-0 border-e border-line bg-surface/40 md:block">
    <aside className="sticky top-0 flex h-dvh flex-col gap-6 px-4 py-6">
      <div className="px-2">
        <Logo />
      </div>
      <Button variant="primary" icon={Plus} onClick={open} className="w-full justify-between" data-testid="add-task-button">
        <span className="flex-1 text-start">{t('nav.addTask')}</span>
        <kbd className="num rounded-md bg-on-accent/15 px-1.5 text-[11px] font-semibold">N</kbd>
      </Button>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-1">
        {items.map((item) => {
          // Import lives under Settings; visiting it marks Settings active.
          const viaSettings = item.to === '/settings' && location.pathname === '/import';
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex h-10 items-center gap-3 rounded-full px-3.5 text-sm font-medium transition-colors',
                  isActive || viaSettings ? 'text-ink' : 'text-muted hover:bg-surface-2/70 hover:text-ink',
                )
              }
            >
              {({ isActive: navActive }) => {
                const isActive = navActive || viaSettings;
                return (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-full border border-line-strong bg-surface-2"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    <item.icon size={19} weight={isActive ? 'fill' : 'regular'} className={cn('relative', isActive && 'text-accent-ink')} aria-hidden />
                    <span className="relative">{t(item.labelKey)}</span>
                  </>
                );
              }}
            </NavLink>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {location.pathname !== '/' && <SidebarStatus />}
        <div className="flex items-center justify-between px-1">
          <div className="leading-tight">
            <VersionTag />
            <div className="text-[11px] text-subtle/80">{t('app.localOnly')}</div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
    </div>
  );
}

function MobileTopBar() {
  const { t } = useI18n();
  const location = useLocation();
  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));
  const title = (current ? t(current.labelKey) : location.pathname === '/import' ? t('route.import') : null) ?? 'Wird';
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" width={26} height={26} alt="" aria-hidden />
        <span className="text-[15px] font-bold tracking-tight">{title}</span>
      </div>
      <div className="flex items-center">
        <NavLink to="/settings" aria-label={t('nav.settings')} className={({ isActive }) => cn('inline-flex size-10 items-center justify-center rounded-full', isActive ? 'text-accent-ink' : 'text-muted')}>
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
  const { t } = useI18n();
  const items = navItems(catalog?.quranEnabled ?? true);
  return (
    <>
      <motion.button
        type="button"
        onClick={open}
        whileTap={{ scale: 0.96 }}
        aria-label={t('nav.addTask')}
        data-testid="add-task-fab"
        className="fixed end-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-on-accent shadow-glow md:hidden"
      >
        <Plus size={20} weight="bold" aria-hidden />
        {t('app.fab')}
      </motion.button>
      <nav
        aria-label={t('nav.main')}
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
                {t(item.labelKey)}
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
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">
        {t('app.skipToContent')}
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
