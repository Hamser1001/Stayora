import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowRight,
  BellRing,
  Building2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import { api } from '@/api';
import { useSettings } from '@/contexts/SettingsContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { SegmentedControl, SegmentedOption } from '@/components/ui/segmented';
import { useApiResource } from '@/hooks/useApiResource';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { CANCELLATION_POLICIES, CURRENCIES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { StatusBadge } from '@/components/common/StatusBadge';

const TIMEZONES = ['Europe/Paris', 'Europe/London', 'Europe/Lisbon', 'America/New_York', 'Asia/Dubai', 'Asia/Tokyo'];

const NOTIFICATION_KEYS = [
  ['newBooking', 'newBookingBody'],
  ['checkout', 'checkoutBody'],
  ['payment', 'paymentBody'],
  ['housekeeping', 'housekeepingBody'],
  ['digest', 'digestBody'],
];

function SectionCard({ icon: Icon, title, description, children, footer }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border/70 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.9} />
        </span>
        <div>
          <h3 className="font-display text-[14px] font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? <div className="border-t border-border/70 bg-muted/20 px-5 py-3">{footer}</div> : null}
    </Card>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { settings, loading, updateSettings, resetSettings, fx, refreshRates } = useSettings();
  const { mode, setMode } = useTheme();
  const { setUser } = useAuth();
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const { data: staff } = useApiResource(() => api.staff.list(), []);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const team = useMemo(() => staff || [], [staff]);

  const baseCurrency = String(settings.baseCurrency || 'EUR').toUpperCase();
  const draftCurrency = String(draft.currency || baseCurrency).toUpperCase();
  const draftRate = draftCurrency === baseCurrency ? 1 : Number(fx?.rates?.[draftCurrency]);
  const hasDraftRate = Number.isFinite(draftRate) && draftRate > 0;
  const rateNote =
    draftCurrency === baseCurrency
      ? t('settings.preferences.baseNote', { currency: baseCurrency })
      : hasDraftRate
        ? `${t('settings.preferences.rateLine', {
            from: baseCurrency,
            to: draftCurrency,
            rate: draftRate.toFixed(4),
            date: fx?.date || '—',
          })}${fx?.stale ? ` · ${t('settings.preferences.rateStale')}` : ''}`
        : fx?.loading
          ? t('settings.preferences.ratesLoading')
          : t('settings.preferences.rateUnavailable', {
              currency: draftCurrency,
              base: baseCurrency,
            });

  const set = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const save = async (fields) => {
    const nextErrors = {};
    if (fields.includes('name') && !String(draft.name || '').trim()) {
      nextErrors.name = t('settings.validation.name');
    }
    if (fields.includes('email') && draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      nextErrors.email = t('settings.validation.email');
    }
    if (fields.includes('taxRate') && (Number(draft.taxRate) < 0 || Number(draft.taxRate) > 40)) {
      nextErrors.taxRate = t('settings.validation.tax');
    }
    if (fields.includes('deposit') && (Number(draft.deposit) < 0 || Number(draft.deposit) > 100)) {
      nextErrors.deposit = t('settings.validation.deposit');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = fields.reduce((acc, key) => ({ ...acc, [key]: draft[key] }), {});
      await updateSettings(payload);
      toast.success(t('settings.pricing.saved'));
    } catch (err) {
      toast.error(err.message || t('settings.pricing.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const toggleNotification = async (key, value) => {
    const notifications = { ...(settings.notifications || {}), [key]: value };
    setDraft((prev) => ({ ...prev, notifications }));
    try {
      await updateSettings({ notifications });
      toast.success(t('settings.notifications.allSaved'));
    } catch (err) {
      toast.error(err.message || t('settings.pricing.saveError'));
    }
  };

  const handleReset = async () => {
    setBusy(true);
    try {
      await resetSettings();
      toast.success(t('settings.danger.resetDone'));
      setResetOpen(false);
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid h-[60vh] place-items-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  const saveButton = (fields) => (
    <Button size="sm" onClick={() => save(fields)} disabled={saving}>
      {saving ? <Spinner /> : <Save className="size-3.5" />}
      {t('common.save')}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Tabs defaultValue="property" className="space-y-4">
        <TabsList>
          <TabsTrigger value="property">
            <Building2 /> {t('settings.tabs.property')}
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <Palette /> {t('settings.tabs.preferences')}
          </TabsTrigger>
          <TabsTrigger value="pricing">
            <Sparkles /> {t('settings.tabs.pricing')}
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users /> {t('settings.tabs.team')}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <BellRing /> {t('settings.tabs.notifications')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="property" className="mt-0 space-y-4">
          <SectionCard
            icon={Building2}
            title={t('settings.property.title')}
            description={t('settings.property.body')}
            footer={saveButton(['name', 'legalName', 'email', 'phone', 'website', 'address', 'city', 'country'])}
          >
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field
                label={t('settings.property.name')}
                htmlFor="settings-name"
                error={errors.name}
                required
              >
                <Input
                  id="settings-name"
                  value={draft.name || ''}
                  onChange={(event) => set({ name: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.legalName')} htmlFor="settings-legal">
                <Input
                  id="settings-legal"
                  value={draft.legalName || ''}
                  onChange={(event) => set({ legalName: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.email')} htmlFor="settings-email" error={errors.email}>
                <Input
                  id="settings-email"
                  type="email"
                  value={draft.email || ''}
                  onChange={(event) => set({ email: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.phone')} htmlFor="settings-phone">
                <Input
                  id="settings-phone"
                  value={draft.phone || ''}
                  onChange={(event) => set({ phone: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.website')} htmlFor="settings-website" className="sm:col-span-2">
                <Input
                  id="settings-website"
                  value={draft.website || ''}
                  onChange={(event) => set({ website: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.address')} htmlFor="settings-address" className="sm:col-span-2">
                <Input
                  id="settings-address"
                  value={draft.address || ''}
                  onChange={(event) => set({ address: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.city')} htmlFor="settings-city">
                <Input
                  id="settings-city"
                  value={draft.city || ''}
                  onChange={(event) => set({ city: event.target.value })}
                />
              </Field>
              <Field label={t('settings.property.country')} htmlFor="settings-country">
                <Input
                  id="settings-country"
                  value={draft.country || ''}
                  onChange={(event) => set({ country: event.target.value })}
                />
              </Field>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="preferences" className="mt-0 space-y-4">
          <SectionCard
            icon={Palette}
            title={t('settings.preferences.title')}
            description={t('settings.preferences.body')}
            footer={saveButton(['currency', 'timezone'])}
          >
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field
                label={t('settings.preferences.language')}
                hint={t('settings.preferences.languageHint')}
              >
                <Select
                  value={i18n.language}
                  onValueChange={async (value) => {
                    changeLanguage(value);
                    try {
                      const result = await api.auth.updatePreferences({ language: value });
                      setUser(result.user);
                      toast.success(t(`common.${value === 'fr' ? 'french' : 'english'}`));
                    } catch (err) {
                      toast.error(err.message || t('errors.body'));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label={t('settings.preferences.currency')}
                hint={t('settings.preferences.currencyHint', { base: baseCurrency })}
              >
                <Select value={draft.currency} onValueChange={(value) => set({ currency: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t('settings.preferences.timezone')}>
                <Select value={draft.timezone} onValueChange={(value) => set({ timezone: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label={t('settings.preferences.theme')}
                hint={t('settings.preferences.themeHint')}
              >
                <SegmentedControl className="w-full sm:w-auto">
                  {[
                    ['light', t('settings.preferences.themeLight'), Sun],
                    ['dark', t('settings.preferences.themeDark'), Moon],
                    ['system', t('settings.preferences.themeSystem'), Monitor],
                  ].map(([value, label, Icon]) => (
                    <SegmentedOption
                      key={value}
                      icon={Icon}
                      active={mode === value}
                      onClick={() => setMode(value)}
                      className="flex-1 sm:flex-none"
                    >
                      {label}
                    </SegmentedOption>
                  ))}
                </SegmentedControl>
              </Field>
            </div>

            <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
              <RefreshCw
                className={cn('size-3.5 shrink-0', fx?.loading && 'animate-spin')}
                strokeWidth={1.9}
              />
              <span className="min-w-0 flex-1">{rateNote}</span>
              <button
                type="button"
                onClick={refreshRates}
                disabled={Boolean(fx?.loading)}
                className="font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
              >
                {t('settings.preferences.refreshRates')}
              </button>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="pricing" className="mt-0 space-y-4">
          <SectionCard
            icon={Sparkles}
            title={t('settings.pricing.title')}
            description={t('settings.pricing.body')}
            footer={saveButton([
              'taxRate',
              'cityTax',
              'deposit',
              'currency',
              'checkInTime',
              'checkOutTime',
              'cancellationPolicy',
            ])}
          >
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <Field
                label={t('settings.pricing.taxRate')}
                htmlFor="settings-tax"
                hint={t('settings.pricing.taxHint')}
                error={errors.taxRate}
              >
                <Input
                  id="settings-tax"
                  type="number"
                  min={0}
                  max={40}
                  value={draft.taxRate ?? ''}
                  onChange={(event) => set({ taxRate: Number(event.target.value) })}
                />
              </Field>
              <Field label={t('settings.pricing.cityTax')} htmlFor="settings-city-tax">
                <Input
                  id="settings-city-tax"
                  type="number"
                  min={0}
                  step="0.5"
                  value={draft.cityTax ?? ''}
                  onChange={(event) => set({ cityTax: Number(event.target.value) })}
                />
              </Field>
              <Field
                label={t('settings.pricing.deposit')}
                htmlFor="settings-deposit"
                hint={t('settings.pricing.depositHint')}
                error={errors.deposit}
              >
                <Input
                  id="settings-deposit"
                  type="number"
                  min={0}
                  max={100}
                  value={draft.deposit ?? ''}
                  onChange={(event) => set({ deposit: Number(event.target.value) })}
                />
              </Field>
              <Field
                label={t('settings.preferences.currency')}
                hint={t('settings.preferences.currencyHint', { base: baseCurrency })}
              >
                <Select value={draft.currency} onValueChange={(value) => set({ currency: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('settings.pricing.checkInTime')} htmlFor="settings-checkin">
                <Input
                  id="settings-checkin"
                  type="time"
                  value={draft.checkInTime || ''}
                  onChange={(event) => set({ checkInTime: event.target.value })}
                />
              </Field>
              <Field label={t('settings.pricing.checkOutTime')} htmlFor="settings-checkout">
                <Input
                  id="settings-checkout"
                  type="time"
                  value={draft.checkOutTime || ''}
                  onChange={(event) => set({ checkOutTime: event.target.value })}
                />
              </Field>
              <Field label={t('settings.pricing.cancellationPolicy')} className="sm:col-span-2">
                <Select
                  value={draft.cancellationPolicy}
                  onValueChange={(value) => set({ cancellationPolicy: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCELLATION_POLICIES.map((policy) => (
                      <SelectItem key={policy} value={policy}>
                        {t(
                          `settings.pricing.${
                            policy === 'free24'
                              ? 'cancellationFree'
                              : policy === 'moderate48'
                                ? 'cancellationModerate'
                                : 'cancellationStrict'
                          }`,
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="team" className="mt-0 space-y-4">
          <SectionCard
            icon={Users}
            title={t('staff.title')}
            description={t('settings.team.body')}
            footer={
              <Button variant="outline" size="sm" asChild>
                <Link to="/staff">
                  {t('common.viewAll')}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            }
          >
            <div className="space-y-1">
              {team.map((member) => (
                <div key={member.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <StaffAvatar member={member} className="size-8" fallbackClassName="text-[10px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{member.name}</p>
                    <p className="truncate text-[10.5px] text-muted-foreground">{member.email}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {t(`staff.roles.${member.role}`)}
                  </span>
                  <StatusBadge status={member.status} dot={false} className="shrink-0 text-[10px]" />
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="notifications" className="mt-0 space-y-4">
          <SectionCard
            icon={BellRing}
            title={t('settings.notifications.title')}
            description={t('settings.notifications.body')}
          >
            <div className="divide-y divide-border/60">
              {NOTIFICATION_KEYS.map(([key, bodyKey]) => (
                <div key={key} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium">{t(`settings.notifications.${key}`)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t(`settings.notifications.${bodyKey}`)}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(draft.notifications?.[key])}
                    onCheckedChange={(value) => toggleNotification(key, value)}
                  />
                </div>
              ))}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <SectionCard
        icon={ShieldAlert}
        title={t('settings.danger.title')}
        description={t('settings.danger.body')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-lg text-[12px] leading-relaxed text-muted-foreground">
            {t('settings.danger.resetBody')}
          </p>
          <Button variant="destructive-ghost" size="sm" onClick={() => setResetOpen(true)}>
            <RotateCcw className="size-3.5" />
            {t('settings.danger.reset')}
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t('settings.danger.resetTitle')}
        description={t('settings.danger.resetBodyConfirm')}
        confirmLabel={t('settings.danger.resetAction')}
        destructive
        loading={busy}
        onConfirm={handleReset}
      />
    </div>
  );
}
