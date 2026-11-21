import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CircleAlert,
  CreditCard,
  LogIn,
  LogOut,
  Pencil,
  UserX,
  XCircle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { Avatar, AvatarFallback, Separator } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Spinner } from '@/components/ui/loading';
import { initials } from '@/lib/utils';

function Row({ label, value, className }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className={`text-right text-[12.5px] font-medium ${className || ''}`}>{value}</span>
    </div>
  );
}

const CONFIRM_COPY = {
  checkedIn: { title: 'reservations.checkInTitle', body: 'reservations.checkInBody' },
  checkedOut: { title: 'reservations.checkOutTitle', body: 'reservations.checkOutBody' },
  cancelled: { title: 'reservations.cancelTitle', body: 'reservations.cancelBody' },
  noShow: { title: 'reservations.noShowTitle', body: 'reservations.noShowBody' },
};

export function ReservationDetailSheet({
  reservation,
  onOpenChange,
  onUpdated,
  onRecordPayment,
  onEdit,
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!reservation) return null;

  const runStatus = async (status) => {
    setBusy(true);
    try {
      await api.reservations.setStatus(reservation.id, status);
      const copy = {
        checkedIn: ['reservations.checkedInToast', { name: reservation.guestName, room: reservation.roomNumber }],
        checkedOut: ['reservations.checkedOutToast', { name: reservation.guestName }],
        cancelled: ['reservations.cancelledToast', { reference: reservation.reference }],
        noShow: ['reservations.noShowToast', { reference: reservation.reference }],
        confirmed: ['reservations.confirmedToast', { reference: reservation.reference }],
      }[status];
      toast.success(t(copy[0], copy[1]));
      setConfirming(null);
      await onUpdated();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusy(false);
    }
  };

  const copy = confirming ? CONFIRM_COPY[confirming] : null;

  // One clear next step, secondary actions side by side, and the destructive
  // ones kept apart so the footer reads as actions instead of a menu.
  const canCheckIn = ['pending', 'confirmed'].includes(reservation.status);
  const canEdit = ['pending', 'confirmed'].includes(reservation.status);
  const primary =
    reservation.status === 'pending'
      ? { label: t('reservations.confirm'), icon: CheckCircle2, onClick: () => runStatus('confirmed') }
      : canCheckIn
        ? { label: t('reservations.checkIn'), icon: LogIn, onClick: () => setConfirming('checkedIn') }
        : reservation.status === 'checkedIn'
          ? { label: t('reservations.checkOut'), icon: LogOut, onClick: () => setConfirming('checkedOut') }
          : null;
  const secondary = [
    canEdit
      ? { key: 'edit', label: t('reservations.edit'), icon: Pencil, onClick: () => onEdit(reservation) }
      : null,
    reservation.status === 'pending'
      ? { key: 'checkIn', label: t('reservations.checkIn'), icon: LogIn, onClick: () => setConfirming('checkedIn') }
      : null,
  ].filter(Boolean);

  return (
    <>
      <Sheet open={Boolean(reservation)} onOpenChange={onOpenChange}>
        <SheetContent className="max-w-[460px]">
          <div className="border-b border-border/70 px-5 pb-4 pt-5">
            <div className="flex items-start gap-3 pr-8">
              <Avatar className="size-10 ring-1 ring-border">
                <AvatarFallback>{initials(reservation.guestName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{reservation.guestName}</SheetTitle>
                <SheetDescription className="mt-0.5 font-mono text-[11px]">
                  {reservation.reference}
                </SheetDescription>
              </div>
              <StatusBadge status={reservation.status} />
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('reservations.stay')}
              </p>
              <Row
                label={t('reservations.arrival')}
                value={money.date(reservation.arrival, { style: 'long' })}
              />
              <Row
                label={t('reservations.departure')}
                value={money.date(reservation.departure, { style: 'long' })}
              />
              <Row label={t('reservations.nights')} value={t('units.night', { count: reservation.nights })} />
              <Row
                label={t('rooms.room')}
                value={`${reservation.roomNumber} · ${t(`rooms.type.${reservation.roomType}`)}`}
              />
              <Row
                label={t('reservations.form.bed')}
                value={t('rooms.bedLabel', { number: reservation.bed?.number })}
              />
              <Row label={t('reservations.guestsCount')} value={reservation.guests} />
              <Row
                label={t('reservations.source')}
                value={t(`reservations.sourceLabels.${reservation.source}`, {
                  defaultValue: reservation.source,
                })}
              />
            </section>

            <Separator />

            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('reservations.billing')}
              </p>
              <Row label={t('reservations.form.rate')} value={money.currency(reservation.rate)} />
              <Row label={t('reservations.total')} value={money.currency(reservation.total)} />
              <Row
                label={t('reservations.paid')}
                value={money.currency(reservation.paid)}
                className="text-status-available"
              />
              <Row
                label={t('reservations.balance')}
                value={money.currency(reservation.balance)}
                className={reservation.balance > 0 ? 'text-status-maintenance' : ''}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <StatusBadge status={reservation.paymentStatus} />
                {reservation.balance > 0 &&
                ['pending', 'confirmed', 'checkedIn'].includes(reservation.status) ? (
                  <Button size="xs" variant="outline" onClick={() => onRecordPayment(reservation)}>
                    <CreditCard className="size-3.5" />
                    {t('reservations.recordPayment')}
                  </Button>
                ) : null}
              </div>
            </section>

            <Separator />

            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('reservations.guestProfile')}
              </p>
              <Row label={t('common.email')} value={reservation.guest?.email || '—'} />
              <Row label={t('common.phone')} value={reservation.guest?.phone || '—'} />
              <Row
                label={t('guests.nationality')}
                value={reservation.guest?.nationality || '—'}
              />
              {reservation.guest?.notes ? (
                <p className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {reservation.guest.notes}
                </p>
              ) : null}
            </section>

            {reservation.notes ? (
              <>
                <Separator />
                <section>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t('common.notes')}
                  </p>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">{reservation.notes}</p>
                </section>
              </>
            ) : null}
          </div>

          <div className="border-t border-border/70 px-5 py-4">
            {primary ? (
              <Button className="w-full" onClick={primary.onClick}>
                <primary.icon />
                {primary.label}
              </Button>
            ) : null}

            {secondary.length ? (
              <div className={`flex gap-2${primary ? ' mt-2' : ''}`}>
                {secondary.map((action) => (
                  <Button
                    key={action.key}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={action.onClick}
                  >
                    <action.icon />
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}

            {['pending', 'confirmed'].includes(reservation.status) ? (
              <div className="mt-3 flex items-center justify-center gap-1.5 border-t border-border/60 pt-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setConfirming('noShow')}
                >
                  <UserX />
                  {t('reservations.noShow')}
                </Button>
                <Button
                  variant="destructive-ghost"
                  size="sm"
                  onClick={() => setConfirming('cancelled')}
                >
                  <XCircle />
                  {t('reservations.cancel')}
                </Button>
              </div>
            ) : null}

            {busy ? (
              <p className="mt-2 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
                <Spinner /> {t('common.saving')}
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={
          copy
            ? t(copy.title, {
                name: reservation.guestName,
                bed: reservation.bed?.number,
                room: reservation.roomNumber,
                balance: money.currency(reservation.balance),
              })
            : ''
        }
        description={copy ? t(copy.body, { balance: money.currency(reservation.balance) }) : ''}
        confirmLabel={t('common.confirm')}
        destructive={confirming === 'cancelled' || confirming === 'noShow'}
        loading={busy}
        onConfirm={() => runStatus(confirming)}
      />
    </>
  );
}
