import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Brush, CalendarCheck, CheckCheck, CreditCard, Sparkles } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const ICONS = {
  newBooking: CalendarCheck,
  payment: CreditCard,
  housekeeping: Brush,
  maintenance: Sparkles,
  checkout: CalendarCheck,
};

const TONES = {
  newBooking: 'bg-primary-soft text-primary',
  payment: 'bg-status-available-soft text-status-available',
  housekeeping: 'bg-status-cleaning-soft text-status-cleaning',
  maintenance: 'bg-status-maintenance-soft text-status-maintenance',
  checkout: 'bg-status-occupied-soft text-status-occupied',
};

const TARGETS = {
  newBooking: '/reservations',
  checkout: '/reservations',
  payment: '/payments',
  housekeeping: '/housekeeping',
  maintenance: '/housekeeping',
};

function relativeTime(createdAt, t) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return t('notifications.timeAgoMinutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('notifications.timeAgoHours', { count: hours });
  return t('notifications.timeAgoDays', { count: Math.round(hours / 24) });
}

export function NotificationsMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useApiResource(() => api.notifications.list(), []);

  const notifications = useMemo(() => data || [], [data]);
  const unread = notifications.filter((n) => !n.read).length;

  const markAll = async () => {
    await api.notifications.markAllRead();
    reload();
  };

  const openNotification = async (notification) => {
    setOpen(false);
    if (!notification.read) {
      await api.notifications.markRead(notification.id).catch(() => null);
      reload();
    }
    const target = TARGETS[notification.type];
    if (target) navigate(target);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative grid size-9 place-items-center rounded-lg text-foreground/65 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label={t('topbar.notifications')}
        >
          <Bell className="size-[18px]" strokeWidth={1.9} />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
              <span className="absolute size-2 animate-ping rounded-full bg-gold/70" />
              <span className="relative size-2 rounded-full bg-gold ring-2 ring-background" />
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold">{t('topbar.notifications')}</p>
            {unread > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">
                {unread}
              </span>
            ) : null}
          </div>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <CheckCheck className="size-3.5" />
              {t('topbar.markAllRead')}
            </button>
          ) : null}
        </div>

        <div className="max-h-[380px] overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted">
                <Bell className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-[13px] font-medium">{t('topbar.noNotifications')}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {t('topbar.noNotificationsBody')}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {notifications.map((notification) => {
                const Icon = ICONS[notification.type] || Bell;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(notification)}
                      className={cn(
                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        !notification.read && 'bg-primary/[0.025]',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                          TONES[notification.type] || 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon className="size-4" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold leading-snug">
                          {t(`notifications.${notification.type}.title`)}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                          {t(`notifications.${notification.type}.body`, notification.data)}
                        </span>
                        <span className="mt-1 block text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/60">
                          {relativeTime(notification.createdAt, t)}
                        </span>
                      </span>
                      {!notification.read ? (
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </PopoverContent>
    </Popover>
  );
}
