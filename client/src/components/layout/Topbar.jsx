import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeft, Search } from 'lucide-react';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationsMenu } from './NotificationsMenu';
import { UserMenu } from './UserMenu';
import { QuickSearch } from './QuickSearch';
import { Breadcrumbs } from './Breadcrumbs';

export function Topbar({ onOpenMobileNav }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-[64px] shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-foreground/60 transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          aria-label={t('common.openMenu')}
        >
          <PanelLeft className="size-[18px]" />
        </button>

        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-9 w-[240px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-[12.5px] text-muted-foreground/80 shadow-[0_1px_1px_hsl(200_20%_10%/0.02)] transition-colors hover:border-border hover:bg-muted/40 md:flex"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 truncate">{t('topbar.searchPlaceholder')}</span>
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[9.5px] font-medium tracking-wide">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="grid size-9 place-items-center rounded-lg text-foreground/65 transition-colors hover:bg-muted md:hidden"
          aria-label={t('common.search')}
        >
          <Search className="size-[18px]" />
        </button>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <LanguageSwitcher />
          <NotificationsMenu />
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <UserMenu />
        </div>
      </header>

      <QuickSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
