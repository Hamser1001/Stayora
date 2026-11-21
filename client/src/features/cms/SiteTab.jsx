import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Globe, HardDrive, Rocket, Save, Undo2 } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CmsStatus } from './shared';

export function SiteTab({ site, stats, storage, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(site);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  useEffect(() => setForm(site), [site]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.cms.updateSite({ slug: form.slug, domain: form.domain, locale: form.locale });
      toast.success(t('cms.toasts.siteSaved'));
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    try {
      await api.cms.publishSite();
      toast.success(t('cms.toasts.sitePublished'));
      await onSaved();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  const unpublish = async () => {
    setConfirmUnpublish(false);
    try {
      await api.cms.unpublishSite();
      toast.success(t('cms.toasts.siteUnpublished'));
      await onSaved();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  if (!form) return <Spinner className="mx-auto my-10" />;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div>
            <h3 className="font-display text-[13.5px] font-semibold">{t('cms.settings.title')}</h3>
            <p className="text-[11.5px] text-muted-foreground">{t('cms.settings.statusHint')}</p>
          </div>
          <CmsStatus status={form.status} label={t(`cms.status.${form.status}`)} />
        </div>
        <form onSubmit={save} className="space-y-3 px-4 py-4">
          <Field label={t('cms.settings.slug')} hint={t('cms.settings.slugHint', { slug: form.slug })}>
            <Input value={form.slug || ''} onChange={(event) => set('slug', event.target.value)} />
          </Field>
          <Field label={t('cms.settings.domain')} hint={t('cms.settings.domainHint')}>
            <Input
              value={form.domain || ''}
              onChange={(event) => set('domain', event.target.value)}
              placeholder="www.example.com"
            />
          </Field>
          <Field label={t('cms.settings.locale')}>
            <Select value={form.locale || 'en'} onValueChange={(value) => set('locale', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner /> : <Save className="size-3.5" />} {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="border-b border-border/70 px-4 py-3">
            <h3 className="font-display text-[13.5px] font-semibold">{t('cms.settings.publication')}</h3>
            <p className="text-[11.5px] text-muted-foreground">{t('cms.settings.publicationHint')}</p>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <div>
                  <p className="text-[12.5px] font-medium">{t('cms.settings.publicApi')}</p>
                  <p className="text-[11px] text-muted-foreground">/api/public/sites/{form.slug}</p>
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground">{t('cms.settings.readOnly')}</span>
            </div>

            {form.status === 'published' ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmUnpublish(true)}>
                <Undo2 className="size-3.5" /> {t('cms.settings.unpublish')}
              </Button>
            ) : (
              <Button size="sm" onClick={publish}>
                <Rocket className="size-3.5" /> {t('cms.settings.publish')}
              </Button>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {form.status === 'published' ? t('cms.settings.publishedHint') : t('cms.settings.publishHint')}
            </p>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border/70 px-4 py-3">
            <h3 className="font-display text-[13.5px] font-semibold">{t('cms.settings.data')}</h3>
          </div>
          <dl className="divide-y divide-border/60 text-[12px]">
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-muted-foreground">{t('cms.settings.pages')}</dt>
              <dd className="font-medium">
                {stats?.published || 0} / {stats?.pages || 0}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="text-muted-foreground">{t('cms.settings.images')}</dt>
              <dd className="font-medium">{stats?.media || 0}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <dt className="flex items-center gap-1.5 text-muted-foreground">
                <HardDrive className="size-3.5" /> {t('cms.settings.storage')}
              </dt>
              <dd className="font-medium">{storage?.driver || 'local'}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmUnpublish}
        onOpenChange={setConfirmUnpublish}
        title={t('cms.settings.unpublishTitle')}
        description={t('cms.settings.unpublishBody')}
        confirmLabel={t('cms.settings.unpublish')}
        destructive
        onConfirm={unpublish}
      />
    </div>
  );
}
