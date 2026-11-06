import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, Brush, Check, Wrench } from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/primitives';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';

const ACTIONS = [
  { status: 'available', icon: Check, labelKey: 'rooms.markAvailable' },
  { status: 'cleaning', icon: Brush, labelKey: 'rooms.markCleaning' },
  { status: 'maintenance', icon: Wrench, labelKey: 'rooms.markMaintenance' },
  { status: 'inactive', icon: Ban, labelKey: 'rooms.markOutOfService' },
];

export function BedDetailsDialog({ selection, onOpenChange, onUpdated }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [busy, setBusy] = useState(null);
  const open = Boolean(selection);
  const { bed, room } = selection || {};

  useEffect(() => {
    setBusy(null);
  }, [selection?.bed?.id]);

  if (!selection) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const apply = async (status) => {
    setBusy(status);
    try {
      await api.rooms.updateBed(bed.id, { status });
      toast.success(
        t('rooms.statusUpdated', {
          room: `${t('rooms.room')} ${room.number}`,
          bed: bed.number,
          status: t(`status.${status}`).toLowerCase(),
        }),
      );
      await onUpdated();
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message || t('errors.body'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>
              {t('rooms.bedDetail')} · {bed.label}
            </DialogTitle>
          </div>
          <DialogDescription>
            {t('rooms.bedDetailBody', { bed: bed.number, type: t(`rooms.type.${room.type}`) })} ·{' '}
            {t('rooms.floorValue', { floor: room.floor })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between">
            <span className="label-caps">{t('common.status')}</span>
            <StatusBadge status={bed.status} />
          </div>
          <Separator className="my-3" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="label-caps">{t('rooms.currentGuest')}</p>
              <p className="mt-1 text-[12.5px] font-medium">
                {bed.guestName || t('rooms.noGuest')}
              </p>
              {bed.stayEnd ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('rooms.until', { date: bed.stayEnd })}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="label-caps">{t('rooms.todayRate')}</p>
              <p className="mt-1 text-[12.5px] font-semibold numeric">
                {money.currency(room.pricePerBed)}
              </p>
            </div>
          </div>
          {bed.nextArrival ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {t('rooms.nextArrival', { date: bed.nextArrival })}
            </p>
          ) : null}
          {bed.note ? (
            <p className="mt-3 rounded-md border border-border/70 bg-card px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {bed.note}
            </p>
          ) : null}
        </div>

        {bed.status === 'occupied' ? (
          <p className="rounded-lg bg-status-reserved-soft px-3 py-2 text-[11.5px] leading-relaxed text-[hsl(32_60%_32%)]">
            {t('rooms.checkoutFirst')}
          </p>
        ) : null}

        <div>
          <p className="label-caps mb-2">{t('rooms.bedMenu')}</p>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((action) => (
              <Button
                key={action.status}
                variant="outline"
                size="sm"
                className={cn('justify-start', bed.status === action.status && 'border-primary/40 bg-primary-soft/60')}
                disabled={Boolean(busy) || bed.status === 'occupied'}
                onClick={() => apply(action.status)}
              >
                {busy === action.status ? <Spinner /> : <action.icon className="size-3.5" />}
                {t(action.labelKey)}
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
