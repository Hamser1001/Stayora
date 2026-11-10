import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';

const ID_TYPES = ['passport', 'nationalId', 'driverLicense'];

function useSchema(t) {
  return z.object({
    name: z.string().trim().min(2, t('guests.validation.name')),
    email: z
      .string()
      .trim()
      .email(t('guests.validation.email'))
      .optional()
      .or(z.literal('')),
    phone: z.string().trim().optional(),
    nationality: z.string().trim().optional(),
    idType: z.enum(ID_TYPES),
    idNumber: z.string().trim().optional(),
    notes: z.string().max(400).optional(),
  });
}

const defaults = () => ({
  name: '',
  email: '',
  phone: '',
  nationality: '',
  idType: 'passport',
  idNumber: '',
  notes: '',
});

export function GuestFormDialog({ open, onOpenChange, guest, onSaved }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const schema = useSchema(t);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults() });

  useEffect(() => {
    if (!open) return;
    setError('');
    reset(
      guest
        ? {
            name: guest.name,
            email: guest.email || '',
            phone: guest.phone || '',
            nationality: guest.nationality || '',
            idType: guest.idType || 'passport',
            idNumber: guest.idNumber || '',
            notes: guest.notes || '',
          }
        : defaults(),
    );
  }, [open, guest, reset]);

  const onSubmit = async (values) => {
    setError('');
    try {
      const saved = guest ? await api.guests.update(guest.id, values) : await api.guests.create(values);
      toast.success(
        guest ? t('guests.updated', { name: saved.name }) : t('guests.created', { name: saved.name }),
      );
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{guest ? t('guests.edit') : t('guests.add')}</DialogTitle>
          <DialogDescription>{t('guests.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            label={t('guests.fullName')}
            htmlFor="guest-name"
            error={errors.name?.message}
            required
          >
            <Input id="guest-name" placeholder="Amara Okafor" {...register('name')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.email')} htmlFor="guest-email" error={errors.email?.message}>
              <Input id="guest-email" type="email" {...register('email')} />
            </Field>
            <Field label={t('common.phone')} htmlFor="guest-phone" error={errors.phone?.message}>
              <Input id="guest-phone" {...register('phone')} />
            </Field>
            <Field label={t('guests.nationality')} htmlFor="guest-nationality">
              <Input id="guest-nationality" {...register('nationality')} />
            </Field>
            <Field label={t('guests.idType')}>
              <Controller
                control={control}
                name="idType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ID_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`guests.idTypes.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('guests.idNumber')} htmlFor="guest-id" className="sm:col-span-2">
              <Input id="guest-id" {...register('idNumber')} />
            </Field>
          </div>

          <Field label={t('guests.notes')} htmlFor="guest-notes">
            <Textarea id="guest-notes" rows={2} {...register('notes')} />
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
              {guest ? t('common.save') : t('guests.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
