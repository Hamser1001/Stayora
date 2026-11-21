import { useTranslation } from 'react-i18next';
import { Pencil, BedDouble, CalendarCheck, Wallet, Sparkles } from 'lucide-react';
import { useMoney } from '@/hooks/useMoney';
import { Avatar, AvatarFallback, Separator } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { initials, cn } from '@/lib/utils';

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <span className={cn('grid size-7 place-items-center rounded-md bg-muted text-muted-foreground', tone)}>
        <Icon className="size-3.5" strokeWidth={1.9} />
      </span>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-display text-[16px] font-bold leading-none numeric">{value}</p>
    </div>
  );
}

export function GuestProfileSheet({ guest, onOpenChange, onEdit, onSelectReservation }) {
  const { t } = useTranslation();
  const money = useMoney();
  // The sheet opens with the row from the list while the full profile is still
  // loading; the list row carries no stay history, so default it to empty.
  const stays = guest?.reservations || [];

  if (!guest) return null;

  return (
    <Sheet open={Boolean(guest)} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-[460px]">
        <div className="border-b border-border/70 px-5 pb-4 pt-5">
          <div className="flex items-start gap-3 pr-8">
            <Avatar className="size-11 ring-1 ring-border">
              <AvatarFallback>{initials(guest.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{guest.name}</SheetTitle>
              <SheetDescription className="mt-0.5">
                {t('guests.profileSubtitle', { date: money.date(guest.createdAt) })}
              </SheetDescription>
            </div>
            {guest.returning ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold-foreground">
                <Sparkles className="size-2.5" />
                {t('guests.vip')}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {guest.currentStay ? (
              <StatusBadge status="checkedIn" className="text-[10.5px]" />
            ) : null}
            {guest.outstanding > 0 ? (
              <StatusBadge status="unpaid" dot={false} className="text-[10.5px]" />
            ) : null}
            {guest.upcomingStay ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                <CalendarCheck className="size-2.5" />
                {t('guests.upcoming')} · {money.date(guest.upcomingStay.arrival, { style: 'short' })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={BedDouble} label={t('guests.stays')} value={guest.stayCount} />
            <Stat
              icon={Wallet}
              label={t('guests.totalSpent')}
              value={money.currency(guest.totalSpent)}
              tone="text-status-available"
            />
            <Stat
              icon={Wallet}
              label={t('guests.outstanding')}
              value={money.currency(guest.outstanding)}
              tone={guest.outstanding > 0 ? 'text-status-maintenance' : undefined}
            />
            <Stat
              icon={CalendarCheck}
              label={t('guests.avgStay')}
              value={money.number(guest.avgStay, { maximumFractionDigits: 1 })}
            />
          </div>

          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('guests.contact')}
            </p>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px]">
              <p className="truncate">{guest.email || '—'}</p>
              <p className="mt-0.5 text-muted-foreground">{guest.phone || '—'}</p>
              <p className="mt-0.5 text-muted-foreground">
                {guest.nationality || '—'}
                {guest.idNumber ? ` · ${guest.idNumber}` : ''}
              </p>
            </div>
          </section>

          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('guests.history')}
            </p>
            {stays.length === 0 ? (
              <EmptyState compact icon={CalendarCheck} title={t('guests.noHistory')} description={t('guests.noHistoryBody')} />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                {stays.slice(0, 8).map((reservation) => (
                  <button
                    key={reservation.id}
                    type="button"
                    onClick={() => onSelectReservation?.(reservation)}
                    className="flex w-full items-center gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">
                        {t('rooms.room')} {reservation.roomNumber} ·{' '}
                        {money.date(reservation.arrival, { style: 'short' })}
                      </p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {reservation.reference} · {t('units.night', { count: reservation.nights })} ·{' '}
                        {money.currency(reservation.total)}
                      </p>
                    </div>
                    <StatusBadge status={reservation.status} dot={false} className="shrink-0 text-[10px]" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <Separator />

          <section>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('guests.notes')}
            </p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {guest.notes || t('guests.noNotes')}
            </p>
          </section>
        </div>

        <div className="border-t border-border/70 px-5 py-4">
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => onEdit(guest)}>
            <Pencil className="size-3.5" />
            {t('guests.edit')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
