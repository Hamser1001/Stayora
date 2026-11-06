import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronRight, ChevronsLeft, ChevronsRight, LifeBuoy, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/contexts/SettingsContext';
import { Brand } from '@/components/brand/Logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';
import { NAV_GROUPS } from './navConfig';

function NavItem({ item, collapsed, onNavigate }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
            : 'text-sidebar-muted hover:bg-white/[0.045] hover:text-white/90',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-r-full bg-gold transition-opacity',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden
          />
          <Icon
            className={cn(
              'size-[17px] shrink-0 transition-colors',
              isActive ? 'text-gold' : 'text-white/45 group-hover:text-white/70',
            )}
            strokeWidth={1.9}
          />
          {!collapsed ? <span className="truncate">{t(`nav.${item.key}`)}</span> : null}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{t(`nav.${item.key}`)}</TooltipContent>
    </Tooltip>
  );
}

export function SidebarContent({ collapsed = false, onNavigate, onToggle, mobile = false }) {
  const { t } = useTranslation();
  const { settings } = useSettings();

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_60%_at_0%_0%,hsl(166_32%_24%)_0%,transparent_58%)]"
        aria-hidden
      />
      <div className="relative flex h-[68px] shrink-0 items-center justify-between px-5">
        <Brand collapsed={collapsed} />
        {!mobile && !collapsed ? (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            aria-label={t('common.collapse')}
          >
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>

      {collapsed && !mobile ? (
        <div className="relative flex justify-center pb-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
            aria-label={t('common.expand')}
          >
            <ChevronsRight className="size-4" />
          </button>
        </div>
      ) : null}

      <div className={cn('relative px-3.5 pb-3', collapsed && !mobile && 'px-2.5')}>
        {collapsed && !mobile ? (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <div className="mx-auto grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70">
                <Building2 className="size-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {settings.name} · {settings.city}
            </TooltipContent>
          </Tooltip>
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.08]"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gold/15 text-gold">
              <Building2 className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold text-white/90">
                {settings.name}
              </span>
              <span className="block truncate text-[10.5px] text-white/40">
                {settings.city}, {settings.country}
              </span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-white/25" />
          </button>
        )}
      </div>

      <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-3.5 pb-4 no-scrollbar">
        {!collapsed || mobile ? (
          <NavLink
            to="/reservations?new=1"
            onClick={onNavigate}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-3 py-2.5 text-[13px] font-semibold text-[#241a08] shadow-[0_6px_18px_-10px_rgba(201,154,69,0.9)] transition-all hover:bg-[#d8a959] active:translate-y-px"
          >
            <Plus className="size-4" strokeWidth={2.4} />
            {t('dashboard.newReservation')}
          </NavLink>
        ) : (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <NavLink
                to="/reservations?new=1"
                className="mx-auto mb-5 flex size-9 items-center justify-center rounded-lg bg-gold text-[#241a08] transition-colors hover:bg-[#d8a959]"
              >
                <Plus className="size-4" strokeWidth={2.4} />
              </NavLink>
            </TooltipTrigger>
            <TooltipContent side="right">{t('dashboard.newReservation')}</TooltipContent>
          </Tooltip>
        )}

        <div className={cn('space-y-6', collapsed && !mobile && 'space-y-4')}>
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey}>
              {!collapsed || mobile ? (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
                  {t(group.labelKey)}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-5 bg-white/10" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavItem
                    key={item.key}
                    item={item}
                    collapsed={collapsed && !mobile}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className={cn('relative shrink-0 px-3.5 pb-4', collapsed && !mobile && 'px-2.5')}>
        {!collapsed || mobile ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.045] p-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-white/10 text-white/70">
                <LifeBuoy className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white/85">{t('footer.help')}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
                  {t('footer.helpBody')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mx-auto grid size-9 place-items-center rounded-lg text-white/40 hover:bg-white/5 hover:text-white/80"
              >
                <LifeBuoy className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('footer.help')}</TooltipContent>
          </Tooltip>
        )}
        {!collapsed || mobile ? (
          <p className="mt-3 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/20">
            {t('common.demoMode')} · v0.1
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }) {
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-black/20 bg-sidebar transition-[width] duration-300 ease-out lg:block',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}
