import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, isApiError } from '@/api';
import { MODULES, ROLE_MODULES, ROLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
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

/**
 * Create or edit a staff member. On creation the API returns a one-time
 * temporary password which is handed to `onCreated` for display.
 */
export function StaffFormDialog({ open, onOpenChange, member, onSaved, onCreated }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const [permissions, setPermissions] = useState([]);
  const schema = useSchema(t);
  const isEdit = Boolean(member);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'receptionist' },
  });

  const role = watch('role');

  useEffect(() => {
    if (!open) return;
    setError('');
    setPermissions(member?.permissions || []);
    reset({
      name: member?.name || '',
      email: member?.email || '',
      role: member?.role && member.role !== 'owner' ? member.role : 'receptionist',
    });
  }, [open, member, reset]);

  const preset = useMemo(() => ROLE_MODULES[role] || [], [role]);
  const isOwnerTarget = member?.role === 'owner';

  const toggle = (module) => {
    setPermissions((current) =>
      current.includes(module) ? current.filter((entry) => entry !== module) : [...current, module],
    );
  };

  const onSubmit = async (values) => {
    setError('');
    try {
      if (isEdit) {
        const updated = await api.staff.update(member.id, {
          name: values.name,
          email: values.email,
          role: values.role,
          permissions,
        });
        toast.success(t('staff.updatedToast', { name: updated.name }));
        onOpenChange(false);
        await onSaved();
      } else {
        const result = await api.staff.create({ ...values, permissions });
        onOpenChange(false);
        await onSaved();
        onCreated?.({
          name: result.member.name,
          email: result.member.email,
          password: result.temporaryPassword,
        });
      }
    } catch (err) {
      setError(isApiError(err) ? err.message : t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('staff.editTitle') : t('staff.createTitle')}</DialogTitle>
          <DialogDescription>
            {isEdit ? t('staff.editBody') : t('staff.createBody')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('staff.name')} htmlFor="staff-name" error={errors.name?.message} required>
              <Input id="staff-name" autoComplete="off" {...register('name')} />
            </Field>
            <Field label={t('staff.email')} htmlFor="staff-email" error={errors.email?.message} required>
              <Input id="staff-email" type="email" autoComplete="off" {...register('email')} />
            </Field>
          </div>

          <Field label={t('staff.role')} error={errors.role?.message} required>
            <Select value={role} onValueChange={(value) => setValue('role', value)}>
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
          </Field>

          <div className="rounded-xl border border-border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <ShieldCheck className="size-3.5 text-primary" />
                  {t('staff.moduleAccess')}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {isOwnerTarget
                    ? t('staff.ownerFullAccess')
                    : t('staff.moduleAccessHint')}
                </p>
              </div>
              {!isOwnerTarget && permissions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setPermissions([])}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                  {t('staff.useRoleDefaults')}
                </button>
              ) : null}
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MODULES.map((module) => {
                const explicit = permissions.includes(module);
                const allowed = isOwnerTarget || (permissions.length ? explicit : preset.includes(module));
                return (
                  <button
                    key={module}
                    type="button"
                    disabled={isOwnerTarget}
                    aria-pressed={allowed}
                    onClick={() => toggle(module)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors',
                      allowed
                        ? 'border-primary/25 bg-primary-soft text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-muted/40',
                      isOwnerTarget && 'opacity-70',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-3.5 shrink-0 place-items-center rounded border',
                        allowed ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                      )}
                    >
                      {allowed ? <Check className="size-2.5" strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">{t(`staff.modules.${module}`)}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10.5px] text-muted-foreground">
              {permissions.length
                ? t('staff.customAccessNote', { count: permissions.length })
                : t('staff.rolePresetNote', { role: t(`staff.roles.${role}`) })}
            </p>
          </div>

          {!isEdit ? (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {t('staff.tempPasswordNotice')}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {isEdit ? t('common.save') : t('staff.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
