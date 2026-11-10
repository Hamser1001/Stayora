import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/api';
import { ROLES } from '@/lib/constants';
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
    name: z.string().trim().min(2, t('staff.validation.name')),
    email: z.string().trim().email(t('staff.validation.email')),
    role: z.enum(ROLES, { errorMap: () => ({ message: t('staff.validation.role') }) }),
  });
}

export function InviteMemberDialog({ open, onOpenChange, onSaved }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const schema = useSchema(t);
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'receptionist' },
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    reset({ name: '', email: '', role: 'receptionist' });
  }, [open, reset]);

  const role = watch('role');

  const onSubmit = async (values) => {
    setError('');
    try {
      await api.staff.invite(values);
      toast.success(t('staff.invited', { email: values.email }));
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('staff.inviteTitle')}</DialogTitle>
          <DialogDescription>{t('staff.inviteBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label={t('staff.name')} htmlFor="member-name" error={errors.name?.message} required>
            <Input id="member-name" {...register('name')} />
          </Field>
          <Field label={t('staff.email')} htmlFor="member-email" error={errors.email?.message} required>
            <Input id="member-email" type="email" {...register('email')} />
          </Field>
          <Field label={t('staff.role')} error={errors.role?.message} required>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.filter((option) => option !== 'owner').map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`staff.roles.${option}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            {t(`staff.roleDescriptions.${role}`, { defaultValue: '' })}
          </p>

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
              {t('staff.invite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
