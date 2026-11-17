import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { IdCard } from 'lucide-react';
import { api, isApiError } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]{6,24}$/;

function useSchema(t) {
  return useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(2, t('profile.nameRequired'))
          .max(80, t('profile.nameTooLong')),
        email: z.string().trim().regex(EMAIL_RE, t('profile.emailInvalid')),
        phone: z
          .string()
          .trim()
          .refine((value) => !value || PHONE_RE.test(value), t('profile.phoneInvalid')),
      }),
    [t],
  );
}

export function ProfileDetailsCard({ user }) {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const schema = useSchema(t);
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const result = await api.auth.updateProfile(values);
      setUser(result.user);
      reset({
        name: result.user?.name || '',
        email: result.user?.email || '',
        phone: result.user?.phone || '',
      });
      toast.success(t('profile.detailsSaved'));
    } catch (error) {
      setFormError(isApiError(error) ? error.message : t('errors.body'));
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border/70 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <IdCard className="size-4" strokeWidth={1.9} />
        </span>
        <div>
          <h3 className="font-display text-[14px] font-semibold">{t('profile.detailsTitle')}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('profile.detailsBody')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-5 py-5" noValidate>
        <Field label={t('common.name')} htmlFor="profile-name" error={errors.name?.message} required>
          <Input
            id="profile-name"
            autoComplete="name"
            placeholder="Amina Bensalem"
            {...register('name')}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('auth.email')}
            htmlFor="profile-email"
            error={errors.email?.message}
            required
          >
            <Input
              id="profile-email"
              type="email"
              autoComplete="email"
              placeholder="you@stayora.app"
              {...register('email')}
            />
          </Field>

          <Field label={t('common.phone')} htmlFor="profile-phone" error={errors.phone?.message}>
            <Input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              placeholder="+33 6 12 34 56 78"
              {...register('phone')}
            />
          </Field>
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {t(`staff.roles.${user?.role || 'receptionist'}`)} ·{' '}
            {t(`common.${user?.language === 'fr' ? 'french' : 'english'}`)}
            <span className="mt-0.5 block text-[10.5px]">{t('profile.accessNote')}</span>
          </p>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? <Spinner /> : null}
            {t('profile.saveDetails')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
