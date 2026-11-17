import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
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

function useSchema(t) {
  return z.object({
    category: z.enum(EXPENSE_CATEGORIES, {
      errorMap: () => ({ message: t('expenses.validation.category') }),
    }),
    vendor: z.string().trim().min(1, t('expenses.validation.vendor')),
    date: z.string().min(1, t('validation.required')),
    amount: z.coerce.number().positive(t('expenses.validation.amount')),
    method: z.enum(PAYMENT_METHODS),
    receipt: z.string().optional(),
    notes: z.string().max(300).optional(),
  });
}

export function ExpenseFormDialog({ open, onOpenChange, onSaved, defaultCategory }) {
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
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'supplies',
      vendor: '',
      date: todayISO(),
      amount: 0,
      method: 'card',
      receipt: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    reset({
      category: defaultCategory || 'supplies',
      vendor: '',
      date: todayISO(),
      amount: 0,
      method: 'card',
      receipt: '',
      notes: '',
    });
  }, [open, defaultCategory, reset]);

  const onSubmit = async (values) => {
    setError('');
    try {
      // Entered in the display currency; stored in the ledger base currency.
      await api.expenses.create({ ...values, amount: money.toBase(values.amount) });
      toast.success(t('expenses.created'));
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('expenses.addTitle')}</DialogTitle>
          <DialogDescription>{t('expenses.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('expenses.category')} required error={errors.category?.message}>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`expenses.categories.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label={t('expenses.vendor')}
              htmlFor="expense-vendor"
              error={errors.vendor?.message}
              required
            >
              <Input
                id="expense-vendor"
                placeholder={t('expenses.vendorPlaceholder')}
                {...register('vendor')}
              />
            </Field>
            <Field label={t('expenses.date')} htmlFor="expense-date" error={errors.date?.message} required>
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    id="expense-date"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(errors.date)}
                  />
                )}
              />
            </Field>
            <Field
              label={t('expenses.amount')}
              htmlFor="expense-amount"
              hint={money.currencyCode}
              error={errors.amount?.message}
              required
            >
              <Input id="expense-amount" type="number" min={0} step="0.01" {...register('amount')} />
            </Field>
            <Field label={t('expenses.method')}>
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`payments.methods.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('expenses.receipt')} htmlFor="expense-receipt">
              <Input id="expense-receipt" placeholder="RC-00000" {...register('receipt')} />
            </Field>
          </div>

          <Field label={t('expenses.notes')} htmlFor="expense-notes">
            <Textarea id="expense-notes" rows={2} {...register('notes')} />
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
              {t('expenses.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
