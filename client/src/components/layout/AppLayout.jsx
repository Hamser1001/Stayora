import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar, SidebarContent } from './Sidebar';
import { Topbar } from './Topbar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/primitives';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const COLLAPSE_KEY = 'stayora.sidebar.collapsed';

export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((prev) => !prev)} />

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[282px] max-w-[282px] border-r-0 bg-sidebar p-0">
            <SheetTitle className="sr-only">{t('common.openMenu')}</SheetTitle>
            <SidebarContent mobile onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full max-w-[1400px]">
              <ErrorBoundary resetKey={location.pathname} variant="inline">
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
