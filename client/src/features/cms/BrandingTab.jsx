import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Palette, Save } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/primitives';
import { MediaSelect } from './shared';

const FONTS = ['inter', 'jakarta', 'serif', 'display', 'mono'];

function Section({ title, description, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/70 px-4 py-3">
        <h3 className="font-display text-[13.5px] font-semibold">{title}</h3>
        {description ? <p className="text-[11.5px] text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-3 px-4 py-4">{children}</div>
    </Card>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#111827'}
          onChange={(event) => onChange(event.target.value)}
          className="size-[38px] shrink-0 cursor-pointer rounded-lg border border-input bg-card"
          aria-label={label}
        />
        <Input value={value || ''} onChange={(event) => onChange(event.target.value)} maxLength={7} />
      </div>
    </Field>
  );
}

export function BrandingTab({ site, media, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(site);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setForm(site), [site]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setBranding = (key, value) =>
    setForm((current) => ({ ...current, branding: { ...current.branding, [key]: value } }));
  const setContact = (key, value) =>
    setForm((current) => ({ ...current, contact: { ...current.contact, [key]: value } }));
  const setSeo = (key, value) =>
    setForm((current) => ({ ...current, seo: { ...current.seo, [key]: value } }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { branding, contact, seo } = form;
      await api.cms.updateSite({
        name: form.name,
        tagline: form.tagline,
        description: form.description,
        branding: {
          logoMediaId: branding.logoMediaId,
          faviconMediaId: branding.faviconMediaId,
          primaryColor: branding.primaryColor,
          secondaryColor: branding.secondaryColor,
          accentColor: branding.accentColor,
          headingFont: branding.headingFont,
          bodyFont: branding.bodyFont,
          radius: branding.radius,
        },
        contact,
        seo: {
          title: seo.title,
          description: seo.description,
          ogImageMediaId: seo.ogImageMediaId,
          noIndex: Boolean(seo.noIndex),
          canonicalUrl: seo.canonicalUrl,
        },
      });
      toast.success(t('cms.toasts.brandingSaved'));
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <Spinner className="mx-auto my-10" />;

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title={t('cms.branding.identity')} description={t('cms.branding.identityHint')}>
          <Field label={t('cms.branding.name')} required>
            <Input value={form.name || ''} onChange={(event) => set('name', event.target.value)} />
          </Field>
          <Field label={t('cms.branding.tagline')}>
            <Input value={form.tagline || ''} onChange={(event) => set('tagline', event.target.value)} />
          </Field>
          <Field label={t('cms.branding.description')}>
            <Textarea
              rows={3}
              value={form.description || ''}
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>
        </Section>

        <Section title={t('cms.branding.visual')} description={t('cms.branding.visualHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.branding.logo')}>
              <MediaSelect
                value={form.branding?.logoMediaId}
                onChange={(value) => setBranding('logoMediaId', value)}
                media={media}
                label={t('cms.branding.logo')}
              />
            </Field>
            <Field label={t('cms.branding.favicon')}>
              <MediaSelect
                value={form.branding?.faviconMediaId}
                onChange={(value) => setBranding('faviconMediaId', value)}
                media={media}
                label={t('cms.branding.favicon')}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField
              label={t('cms.branding.primary')}
              value={form.branding?.primaryColor}
              onChange={(value) => setBranding('primaryColor', value)}
            />
            <ColorField
              label={t('cms.branding.secondary')}
              value={form.branding?.secondaryColor}
              onChange={(value) => setBranding('secondaryColor', value)}
            />
            <ColorField
              label={t('cms.branding.accent')}
              value={form.branding?.accentColor}
              onChange={(value) => setBranding('accentColor', value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('cms.branding.headingFont')}>
              <Select
                value={form.branding?.headingFont || 'display'}
                onValueChange={(value) => setBranding('headingFont', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {t(`cms.fonts.${font}`, { defaultValue: font })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('cms.branding.bodyFont')}>
              <Select
                value={form.branding?.bodyFont || 'inter'}
                onValueChange={(value) => setBranding('bodyFont', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONTS.map((font) => (
                    <SelectItem key={font} value={font}>
                      {t(`cms.fonts.${font}`, { defaultValue: font })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('cms.branding.radius')}>
              <Input
                type="number"
                min={0}
                max={32}
                value={form.branding?.radius ?? 12}
                onChange={(event) => setBranding('radius', Number(event.target.value))}
              />
            </Field>
          </div>
        </Section>

        <Section title={t('cms.branding.contact')} description={t('cms.branding.contactHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.branding.email')}>
              <Input value={form.contact?.email || ''} onChange={(event) => setContact('email', event.target.value)} />
            </Field>
            <Field label={t('cms.branding.phone')}>
              <Input value={form.contact?.phone || ''} onChange={(event) => setContact('phone', event.target.value)} />
            </Field>
          </div>
          <Field label={t('cms.branding.address')}>
            <Input value={form.contact?.address || ''} onChange={(event) => setContact('address', event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.branding.city')}>
              <Input value={form.contact?.city || ''} onChange={(event) => setContact('city', event.target.value)} />
            </Field>
            <Field label={t('cms.branding.country')}>
              <Input value={form.contact?.country || ''} onChange={(event) => setContact('country', event.target.value)} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.branding.instagram')}>
              <Input
                value={form.contact?.instagram || ''}
                onChange={(event) => setContact('instagram', event.target.value)}
              />
            </Field>
            <Field label={t('cms.branding.facebook')}>
              <Input
                value={form.contact?.facebook || ''}
                onChange={(event) => setContact('facebook', event.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section title={t('cms.seo.title')} description={t('cms.seo.description')}>
          <Field label={t('cms.page.seoTitle')}>
            <Input value={form.seo?.title || ''} onChange={(event) => setSeo('title', event.target.value)} />
          </Field>
          <Field label={t('cms.page.seoDescription')}>
            <Textarea
              rows={3}
              value={form.seo?.description || ''}
              onChange={(event) => setSeo('description', event.target.value)}
            />
          </Field>
          <Field label={t('cms.seo.socialImage')}>
            <MediaSelect
              value={form.seo?.ogImageMediaId}
              onChange={(value) => setSeo('ogImageMediaId', value)}
              media={media}
              label={t('cms.seo.socialImage')}
            />
          </Field>
          <Field label={t('cms.page.canonicalUrl')} hint={t('cms.page.canonicalHint')}>
            <Input
              value={form.seo?.canonicalUrl || ''}
              onChange={(event) => setSeo('canonicalUrl', event.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-[13px] font-medium">{t('cms.page.noIndex')}</p>
              <p className="text-[11px] text-muted-foreground">{t('cms.seo.noIndexHint')}</p>
            </div>
            <Switch checked={Boolean(form.seo?.noIndex)} onCheckedChange={(value) => setSeo('noIndex', value)} />
          </div>
        </Section>
      </div>

      {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}

      <div className="sticky bottom-3 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner /> : <Save className="size-4" />}
          {t('common.save')}
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Palette className="size-3" /> {t('cms.branding.publishHint')}
      </p>
    </form>
  );
}
