import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LogoMark } from '@/components/brand/Logo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isApiError } from '@/api';

const DEMO_EMAIL = 'amina@stayora.app';
const DEMO_PASSWORD = 'stayora2026';

function useLoginSchema(t) {
  return z.object({
    email: z.string().min(1, t('auth.errors.required')).email(t('auth.errors.invalidEmail')),
    password: z.string().min(8, t('auth.errors.shortPassword')),
    remember: z.boolean().optional(),
  });
}

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = location.state?.from;
  const destination =
    typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/';
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const schema = useLoginSchema(t);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: DEMO_EMAIL, password: DEMO_PASSWORD, remember: true },
  });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const session = await login(values);
      toast.success(t('auth.title'), { description: t('dashboard.subtitle', { hostel: 'Maison Nomade' }) });
      navigate(session?.user?.mustChangePassword ? '/change-password' : destination, { replace: true });
    } catch (error) {
      const message = isApiError(error) ? error.message : t('auth.errors.invalid');
      setFormError(message);
    }
  };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex xl:p-14">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_10%_0%,hsl(166_36%_26%)_0%,transparent_60%),radial-gradient(70%_50%_at_100%_100%,hsl(36_50%_28%)_0%,transparent_55%)]"
          aria-hidden
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-10" />
            <div>
              <p className="font-display text-[19px] font-extrabold tracking-[-0.03em] text-white">
                Stayora
              </p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                {t('common.tagline')}
              </p>
            </div>
          </div>
        </div>

        <div className="relative max-w-[440px]">
          <h1 className="font-display text-[38px] font-bold leading-[1.1] tracking-[-0.035em] text-white balance xl:text-[44px]">
            {t('auth.heroTitle')}
          </h1>
          <p className="mt-4 max-w-[380px] text-[14px] leading-relaxed text-white/55">
            {t('auth.heroBody')}
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Sparkles, label: t('auth.feature1') },
              { icon: ShieldCheck, label: t('auth.feature2') },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-[13px] text-white/70">
                <span className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-gold">
                  <item.icon className="size-3.5" />
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="max-w-[420px] rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-sm">
            <p className="font-display text-[14px] leading-relaxed text-white/80">
              “{t('auth.quote')}”
            </p>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-white/35">
              {t('auth.quoteAuthor')}
            </p>
          </div>
          <div className="mt-8 flex items-center gap-6 text-white/40">
            <span className="text-[10.5px] uppercase tracking-[0.14em]">{t('common.demoMode')}</span>
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10.5px] uppercase tracking-[0.14em]">v0.1</span>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-col px-5 py-8 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <LogoMark className="size-8 bg-primary text-primary-foreground" />
            <span className="font-display text-[16px] font-extrabold tracking-[-0.02em]">Stayora</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-status-available" />
              {t('auth.badge')}
            </span>
            <h2 className="mt-4 font-display text-[27px] font-bold tracking-[-0.03em]">
              {t('auth.title')}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {t('auth.subtitle')}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-7 space-y-4" noValidate>
              <Field label={t('auth.email')} htmlFor="email" error={errors.email?.message}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('auth.emailPlaceholder')}
                    className="pl-9"
                    {...register('email')}
                  />
                </div>
              </Field>

              <Field label={t('auth.password')} htmlFor="password" error={errors.password?.message}>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder={t('auth.passwordPlaceholder')}
                    className="pl-9 pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  >
                    {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input text-primary accent-[hsl(var(--primary))]"
                    {...register('remember')}
                  />
                  {t('auth.remember')}
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-[12px] font-medium text-primary hover:underline"
                >
                  {t('auth.forgot')}
                </button>
              </div>

              {formError ? (
                <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
                {isSubmitting ? <Spinner /> : null}
                {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
                {!isSubmitting ? <ArrowRight className="size-4" /> : null}
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-border bg-card p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold">{t('auth.demoTitle')}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t('auth.demoBody')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">{DEMO_EMAIL}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">{DEMO_PASSWORD}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="subtle"
                  size="xs"
                  className="shrink-0"
                  onClick={() => {
                    setValue('email', DEMO_EMAIL, { shouldValidate: true });
                    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
                  }}
                >
                  {t('auth.useDemo')}
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center text-[10.5px] leading-relaxed text-muted-foreground/70">
              {t('auth.footer')}
            </p>
          </div>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t('auth.resetTitle')}</DialogTitle>
            <DialogDescription>{t('auth.resetBody')}</DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
            {t('auth.resetHint')}
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => setForgotOpen(false)}>
              {t('common.done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
