import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Banknote, CreditCard, Landmark, Wallet } from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { PAYMENT_METHODS } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';

const METHOD_ICONS = { cash: Banknote, card: CreditCard, transfer: Landmark, online: Wallet, other: Wallet };

function useSchema(t) {
  return z.object({
    reservationId: z.string().min(1, t('payments.validation.reservation')),
    amount: z.coerce.number().positive(t('payments.validation.amount')),
    method: z.enum(PAYMENT_METHODS),
    date: z.string().min(1, t('validation.required')),
    reference: z.string().optional(),
    notes: z.string().optional(),
  });
}

export function RecordPaymentDialog({ open, onOpenChange, reservation, onSaved }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [reservations, setReservations] = useState([]);
  const [error, setError] = useState('');
  const schema = useSchema(t);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      reservationId: '',
      amount: 0,
      method: 'card',
      date: todayISO(),
      reference: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    (async () => {
      const list = await api.reservations.outstanding();
      const candidates = list.filter((item) => item.balance > 0);
      setReservations(candidates);
      if (reservation) {
        reset({
          reservationId: reservation.id,
          amount: money.toDisplay(reservation.balance),
          method: 'card',
          date: todayISO(),
          reference: '',
          notes: '',
        });
      } else {
        const first = candidates[0];
        reset({
          reservationId: first?.id || '',
          amount: money.toDisplay(first?.balance || 0),
          method: 'card',
          date: todayISO(),
          reference: '',
          notes: '',
        });
      }
    })();
  }, [open, reservation, reset]);

  const selectedId = watch('reservationId');
  const selected = useMemo(
    () => reservations.find((item) => item.id === selectedId) || reservation || null,
    [reservations, selectedId, reservation],
  );

  const onSubmit = async (values) => {
    setError('');
    try {
      // Inputs are in the display currency; the ledger stores the base amount.
      const amount = money.toBase(values.amount);
      await api.payments.create({ ...values, amount });
      toast.success(t('payments.recorded'), {
        description: `${money.currency(amount)} · ${values.method}`,
      });
      onOpenChange(false);
      await onSaved?.();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('payments.recordTitle')}</DialogTitle>
          <DialogDescription>{t('payments.recordBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label={t('payments.reservation')} required error={errors.reservationId?.message}>
            <Controller
              control={control}
              name="reservationId"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                    const target = reservations.find((item) => item.id === value);
                    if (target) setValue('amount', money.toDisplay(target.balance));
                  }}
                  disabled={Boolean(reservation)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('payments.selectReservation')} />
                  </SelectTrigger>
                  <SelectContent>
                    {reservations.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.reference} · {item.guestName} · {money.currency(item.balance)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {selected ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold">{selected.guestName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {selected.reference} · {t('rooms.room')} {selected.roomNumber}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('reservations.balance')}
                </p>
                <p className="text-[12.5px] font-semibold numeric">{money.currency(selected.balance)}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('payments.amount')}
              htmlFor="pay-amount"
              hint={money.currencyCode}
              required
              error={errors.amount?.message}
            >
              <Input
                id="pay-amount"
                type="number"
                min="0"
                step="0.01"
                {...register('amount')}
              />
            </Field>
            <Field label={t('payments.method')} required error={errors.method?.message}>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => {
                        const Icon = METHOD_ICONS[method];
                        return (
                          <SelectItem key={method} value={method}>
                            <span className="flex items-center gap-2">
                              <Icon className="size-3.5 text-muted-foreground" />
                              {t(`payments.methods.${method}`)}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('payments.date')} htmlFor="pay-date" required error={errors.date?.message}>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    id="pay-date"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(errors.date)}
                  />
                )}
              />
            </Field>
            <Field label={t('payments.reference')} htmlFor="pay-ref">
              <Input id="pay-ref" placeholder="PMT-00000" {...register('reference')} />
            </Field>
          </div>

          <Field label={t('common.notes')} htmlFor="pay-notes">
            <Textarea id="pay-notes" rows={2} {...register('notes')} />
          </Field>

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {t('payments.record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
