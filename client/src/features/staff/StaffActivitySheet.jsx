import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Download,
  KeyRound,
  LogIn,
  Pencil,
  PlayCircle,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/loading';

const ICONS = {
  'staff.created': UserPlus,
  'staff.updated': Pencil,
  'staff.suspended': ShieldAlert,
  'staff.reactivated': PlayCircle,
  'staff.password_reset': KeyRound,
  'staff.deleted': Trash2,
  'auth.login': LogIn,
  'auth.password_changed': KeyRound,
  'auth.avatar_updated': Camera,
  'auth.avatar_removed': Camera,
  'data.exported': Download,
  'data.import_committed': Upload,
};

const fallback = (action) => action.replace(/[._]/g, ' ');

export function StaffActivitySheet({ open, onOpenChange, member }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !member) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    api.staff
      .activity(member.id, { limit: 50 })
      .then((data) => {
        if (!cancelled) setEntries(data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || t('errors.body'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, member, t]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[420px]">
        <div className="border-b border-border px-5 py-5 pr-12">
          <div className="flex items-center gap-3">
            <StaffAvatar member={member} className="size-10" fallbackClassName="text-[11px]" />
            <div className="min-w-0">
              <SheetTitle className="truncate text-[15px]">{member?.name}</SheetTitle>
              <SheetDescription className="truncate text-[11.5px]">
                {member?.email}
              </SheetDescription>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{t('staff.activity.subtitle')}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Spinner />
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          ) : null}

          {!loading && !error && entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-[12.5px] font-medium">{t('staff.activity.emptyTitle')}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {t('staff.activity.emptyBody')}
              </p>
            </div>
          ) : null}

          <ol className="relative space-y-4 before:absolute before:left-[13px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-border">
            {entries.map((entry) => {
              const Icon = ICONS[entry.action] || Pencil;
              return (
                <li key={entry.id} className="relative flex gap-3 pl-0">
                  <span className="z-10 grid size-[27px] shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[12.5px] font-medium leading-snug">
                      {t(`staff.activity.actions.${entry.action}`, {
                        defaultValue: fallback(entry.action),
                      })}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                      {money.dateTime(entry.createdAt)}
                      {entry.meta?.name && entry.action !== 'staff.created'
                        ? ` · ${entry.meta.name}`
                        : ''}
                      {entry.meta?.collection ? ` · ${entry.meta.collection}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </SheetContent>
    </Sheet>
  );
}
