import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { api, isApiError } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';

function useSchema(t) {
  return useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('auth.changePassword.currentRequired')),
          newPassword: z
            .string()
            .min(8, t('auth.changePassword.tooShort'))
            .regex(/[A-Za-z]/, t('auth.changePassword.needsLetter'))
            .regex(/[0-9]/, t('auth.changePassword.needsNumber')),
          confirmPassword: z.string().min(1, t('auth.changePassword.confirmRequired')),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ['confirmPassword'],
          message: t('auth.changePassword.mismatch'),
        }),
    [t],
  );
}

export function ProfilePasswordCard() {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const schema = useSchema(t);
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const result = await api.auth.updatePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setUser(result.user);
      reset();
      toast.success(t('auth.changePassword.success'));
    } catch (error) {
      setFormError(isApiError(error) ? error.message : t('errors.body'));
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border/70 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <KeyRound className="size-4" strokeWidth={1.9} />
        </span>
        <div>
          <h3 className="font-display text-[14px] font-semibold">{t('profile.securityTitle')}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('profile.securityBody')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 px-5 py-5" noValidate>
        <Field
          label={t('profile.currentPassword')}
          htmlFor="profile-current-password"
          error={errors.currentPassword?.message}
          required
        >
          <Input
            id="profile-current-password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            {...register('currentPassword')}
          />
        </Field>

        <Field
          label={t('auth.changePassword.next')}
          htmlFor="profile-new-password"
          error={errors.newPassword?.message}
          required
        >
          <div className="relative">
            <Input
              id="profile-new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className="pr-10"
              {...register('newPassword')}
            />
            <button
              type="button"
              onClick={() => setShow((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field
          label={t('auth.changePassword.confirm')}
          htmlFor="profile-confirm-password"
          error={errors.confirmPassword?.message}
          required
        >
          <Input
            id="profile-confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
        </Field>

        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          {t('profile.passwordRules')}
        </p>

        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive"
          >
            {formError}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-border/60 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : null}
            {t('profile.savePassword')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
