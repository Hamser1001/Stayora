import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { PAYMENT_METHODS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';

function useSchema(t) {
  return z.object({
    amount: z.coerce.number().positive(t('payments.validation.amount')),
    method: z.enum(PAYMENT_METHODS),
  });
}

export function RefundDialog({ open, onOpenChange, payment, onSaved }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [error, setError] = useState('');
  const schema = useSchema(t);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { amount: 0, method: 'card' } });

  useEffect(() => {
    if (!open || !payment) return;
    setError('');
    reset({ amount: money.toDisplay(payment.amount), method: payment.method || 'card' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, reset]);

  const onSubmit = async (values) => {
    setError('');
    try {
      const amount = money.toBase(values.amount);
      await api.payments.refund({
        reservationId: payment.reservationId,
        amount,
        method: values.method,
      });
      toast.success(t('payments.refunded'), { description: money.currency(amount) });
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {payment ? t('payments.refundTitle', { amount: money.currency(payment.amount) }) : ''}
          </DialogTitle>
          <DialogDescription>{t('payments.refundBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[12px]">
            <p className="font-semibold">{payment?.guestName}</p>
            <p className="mt-0.5 text-muted-foreground">
              {payment?.reservationReference} · {payment?.reference}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('payments.amount')}
              htmlFor="refund-amount"
              hint={money.currencyCode}
              error={errors.amount?.message}
              required
            >
              <Input
                id="refund-amount"
                type="number"
                min={0}
                step="0.01"
                max={payment ? money.toDisplay(payment.amount) : undefined}
                {...register('amount')}
              />
            </Field>
            <Field label={t('payments.method')}>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {t(`payments.methods.${method}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {t('payments.refund')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
