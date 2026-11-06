import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Command, Search } from 'lucide-react';
import { NAV_ITEMS, QUICK_SEARCH_ACTIONS } from './navConfig';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function QuickSearch({ open, onOpenChange }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const items = useMemo(() => {
    const term = query.trim().toLowerCase();
    const navigation = NAV_ITEMS.map((item) => ({
      id: `nav-${item.key}`,
      label: t(`nav.${item.key}`),
      to: item.to,
      icon: item.icon,
      group: t('topbar.quickLinks'),
    }));
    const actions = QUICK_SEARCH_ACTIONS.map((item) => ({
      id: `action-${item.key}`,
      label: t(item.labelKey),
      to: item.to,
      icon: item.icon,
      group: t('common.actions'),
    }));
    const all = [...navigation, ...actions];
    if (!term) return navigation.slice(0, 6);
    return all.filter((item) => item.label.toLowerCase().includes(term));
  }, [query, t]);

  const go = (to) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] max-w-[520px] translate-y-0 gap-0 overflow-hidden p-0" showClose={false}>
        <DialogTitle className="sr-only">{t('common.search')}</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="h-14 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[340px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">
              {t('topbar.noMatches')}
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.to)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-muted',
                )}
              >
                <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground group-hover:bg-card group-hover:text-primary">
                  <item.icon className="size-4" />
                </span>
                <span className="flex-1 font-medium">{item.label}</span>
                <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground/50">
                  {item.group}
                </span>
                <ArrowRight className="size-3.5 text-muted-foreground/40" />
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{t('common.demoMode')}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Command className="size-3" /> K
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
