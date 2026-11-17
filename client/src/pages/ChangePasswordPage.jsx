import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { api, isApiError } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';

function useSchema(t) {
  return z
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
    });
}

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState('');
  const schema = useSchema(t);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const result = await api.auth.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setUser(result.user);
      toast.success(t('auth.changePassword.success'));
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(isApiError(error) ? error.message : t('errors.body'));
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <LogoMark className="size-10" />
          <div>
            <p className="font-display text-[17px] font-extrabold tracking-[-0.02em]">Stayora</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {t('common.tagline')}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-7">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
            <KeyRound className="size-5" strokeWidth={1.9} />
          </span>
          <h1 className="mt-4 font-display text-[20px] font-bold tracking-[-0.02em]">
            {t('auth.changePassword.title')}
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {t('auth.changePassword.body', { email: user?.email || '' })}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
            <Field
              label={t('auth.changePassword.current')}
              htmlFor="current-password"
              error={errors.currentPassword?.message}
              required
            >
              <Input
                id="current-password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                {...register('currentPassword')}
              />
            </Field>

            <Field
              label={t('auth.changePassword.next')}
              htmlFor="new-password"
              error={errors.newPassword?.message}
              required
            >
              <div className="relative">
                <Input
                  id="new-password"
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
              htmlFor="confirm-password"
              error={errors.confirmPassword?.message}
              required
            >
              <Input
                id="confirm-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
            </Field>

            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {t('auth.changePassword.rules')}
            </p>

            {formError ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive"
              >
                {formError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {t('auth.changePassword.submit')}
            </Button>
          </form>

          <button
            type="button"
            onClick={signOut}
            className="mx-auto mt-4 flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    </div>
  );
}
