import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Cable,
  CheckCircle2,
  KeyRound,
  Link2,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Webhook,
} from 'lucide-react';
import { api, apiMode } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, Input } from '@/components/ui/input';
import { Spinner, PageSkeleton } from '@/components/ui/loading';
import { ErrorState } from '@/components/common/ErrorState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const PROVIDER_ICONS = {
  booking_com: Cable,
  airbnb: Link2,
  expedia: Link2,
  api_management: KeyRound,
  webhooks: Webhook,
};

const STATUS_TONE = {
  not_connected: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-gold-soft text-gold-foreground',
  connected: 'bg-status-available-soft text-status-available',
  error: 'bg-status-maintenance-soft text-status-maintenance',
  disabled: 'bg-muted text-muted-foreground',
};

function StatusPill({ status, label }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em]',
        STATUS_TONE[status] || STATUS_TONE.not_connected,
      )}
    >
      {label}
    </span>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className="text-right text-[11.5px] font-medium">{value}</span>
    </div>
  );
}

function ProviderCard({ provider, canManage, storageReady, onConfigure, onRefresh }) {
  const { t, i18n } = useTranslation();
  const Icon = PROVIDER_ICONS[provider.key] || Cable;
  const [busy, setBusy] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const isSelfService = provider.availability === 'self_service';
  const configured = provider.hasCredentials;

  const date = (value) =>
    value ? new Intl.DateTimeFormat(i18n.language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

  const run = async (tag, action, successKey) => {
    setBusy(tag);
    try {
      await action();
      if (successKey) toast.success(t(successKey));
      await onRefresh();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[14px] font-semibold">{provider.name}</h3>
              <StatusPill status={provider.status} label={t(`integrations.status.${provider.status}`)} />
              {configured ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-muted-foreground">
                  <ShieldCheck className="size-3" /> {t('integrations.encrypted')}
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-muted-foreground">
              {provider.summary}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="grid gap-x-6 sm:grid-cols-2">
          <MetaRow
            label={t('integrations.fields.credentials')}
            value={
              configured
                ? t('integrations.credentialVersion', { version: provider.credentialVersion })
                : t('integrations.noCredentials')
            }
          />
          <MetaRow
            label={t('integrations.fields.lastSync')}
            value={provider.lastSyncAt ? date(provider.lastSyncAt) : t('integrations.never')}
          />
          <MetaRow
            label={t('integrations.fields.lastResult')}
            value={
              provider.lastSyncResult
                ? `${provider.lastSyncResult.ok ? t('integrations.resultOk') : t('integrations.resultFailed')} · ${provider.lastSyncResult.message || '—'}`
                : '—'
            }
          />
          <MetaRow
            label={t('integrations.fields.mappings')}
            value={String(provider.mappings?.length || 0)}
          />
          {provider.config?.propertyId ? (
            <MetaRow label={t('integrations.fields.propertyId')} value={provider.config.propertyId} />
          ) : null}
          {provider.config?.callbackUrl ? (
            <MetaRow label={t('integrations.fields.callbackUrl')} value={provider.config.callbackUrl} />
          ) : null}
        </div>

        {provider.capabilities?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {provider.capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {t(`integrations.capability.${capability}`, { defaultValue: capability })}
              </span>
            ))}
          </div>
        ) : null}

        {provider.notes ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {provider.notes}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isSelfService && canManage ? (
            <Button
              size="sm"
              variant={configured ? 'outline' : 'default'}
              disabled={!storageReady || Boolean(busy)}
              onClick={() => onConfigure(provider)}
            >
              <KeyRound className="size-3.5" />
              {configured ? t('integrations.replace') : t('integrations.configure')}
            </Button>
          ) : null}

          {isSelfService && configured && canManage ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy)}
                onClick={() =>
                  run(
                    'toggle',
                    () => api.integrations.setEnabled(provider.key, !provider.enabled),
                    provider.enabled ? 'integrations.disabledToast' : 'integrations.enabledToast',
                  )
                }
              >
                {busy === 'toggle' ? <Spinner /> : <CheckCircle2 className="size-3.5" />}
                {provider.enabled ? t('integrations.disable') : t('integrations.enable')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={Boolean(busy)}
                onClick={() => run('rotate', () => api.integrations.rotate(provider.key), 'integrations.rotatedToast')}
              >
                {busy === 'rotate' ? <Spinner /> : <RefreshCw className="size-3.5" />}
                {t('integrations.rotate')}
              </Button>
              <Button
                size="sm"
                variant="destructive-ghost"
                disabled={Boolean(busy)}
                onClick={() => setConfirmRevoke(true)}
              >
                <Trash2 className="size-3.5" />
                {t('integrations.revoke')}
              </Button>
            </>
          ) : null}

          {configured ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={Boolean(busy)}
              onClick={async () => {
                setBusy('test');
                try {
                  const result = await api.integrations.test(provider.key);
                  toast.message(t('integrations.testResult'), { description: result.detail });
                } catch (err) {
                  toast.error(err.message || t('errors.body'));
                } finally {
                  setBusy('');
                  await onRefresh();
                }
              }}
            >
              {busy === 'test' ? <Spinner /> : <Cable className="size-3.5" />}
              {t('integrations.test')}
            </Button>
          ) : null}

          {!isSelfService ? (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Ban className="size-3.5" />
              {provider.availability === 'approval_required'
                ? t('integrations.awaitingPartner')
                : t('integrations.unavailable')}
            </span>
          ) : null}

          {isSelfService && !canManage ? (
            <span className="text-[11.5px] text-muted-foreground">{t('integrations.ownerOnly')}</span>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title={t('integrations.revokeTitle', { provider: provider.name })}
        description={t('integrations.revokeBody')}
        confirmLabel={t('integrations.revoke')}
        destructive
        onConfirm={async () => {
          setConfirmRevoke(false);
          await run('revoke', () => api.integrations.revoke(provider.key), 'integrations.revokedToast');
        }}
      />
    </Card>
  );
}

function CredentialsDialog({ provider, onOpenChange, onSaved }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({});
  const [config, setConfig] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    // Credentials never outlive the dialog: clear before it unmounts.
    setValues({});
    setConfig({});
    setError('');
    onOpenChange(false);
  };

  if (!provider) return null;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.integrations.saveCredentials(provider.key, { credentials: values, config });
      setValues({});
      setConfig({});
      toast.success(t('integrations.saved'));
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(provider)} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t('integrations.dialogTitle', { provider: provider.name })}</DialogTitle>
          <DialogDescription>{t('integrations.dialogBody')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" autoComplete="off">
          {(provider.credentialFields || []).map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} required={field.required}>
              <Input
                type="password"
                name={`${provider.key}-${field.key}`}
                autoComplete="new-password"
                spellCheck={false}
                value={values[field.key] || ''}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            </Field>
          ))}

          {(provider.configFields || []).map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint} required={field.required}>
              <Input
                type="text"
                name={`${provider.key}-config-${field.key}`}
                autoComplete="off"
                spellCheck={false}
                value={config[field.key] || ''}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            </Field>
          ))}

          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            {t('integrations.dialogNote')}
          </p>

          {error ? (
            <p role="alert" className="text-[12px] font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner /> : <KeyRound className="size-3.5" />}
              {t('integrations.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApiResource(() => api.integrations.list(), []);
  const [editing, setEditing] = useState(null);

  const groups = useMemo(() => data?.groups || [], [data]);
  const storageReady = Boolean(data?.storage?.configured);
  const canManage = Boolean(data?.canManage);

  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader title={t('integrations.title')} subtitle={t('integrations.subtitle')} />

      {apiMode === 'mock' ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground">
          {t('integrations.mockNotice')}
        </p>
      ) : null}

      {!storageReady ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive-soft px-4 py-3 text-[12px] font-medium text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t('integrations.storageMissing')}
        </p>
      ) : null}

      {!canManage && user ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground">
          {t('integrations.readOnly')}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-[12px] text-muted-foreground">
          {t('integrations.noProviders')}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t(`integrations.group.${group.key}`)}
          </h2>
          <div className="grid gap-3">
            {group.providers.map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                canManage={canManage}
                storageReady={storageReady}
                onConfigure={setEditing}
                onRefresh={reload}
              />
            ))}
          </div>
        </section>
      ))}

      <CredentialsDialog
        provider={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSaved={reload}
      />
    </div>
  );
}
