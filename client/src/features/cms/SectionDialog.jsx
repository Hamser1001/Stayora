import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/primitives';
import { ContentFields } from './shared';

/**
 * The section form is generated from the server's registry: adding a new block
 * type on the backend makes it available here without a dashboard change.
 */
export function SectionDialog({ open, pageId, section, sectionTypes, media, onOpenChange, onSaved }) {
  const { t } = useTranslation();
  const isEdit = Boolean(section);
  const [type, setType] = useState(section?.type || '');
  const [content, setContent] = useState(section?.content || {});
  const [visible, setVisible] = useState(section?.visible !== false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(section?.type || '');
    setContent(section?.content || {});
    setVisible(section?.visible !== false);
    setError('');
  }, [open, section]);

  const definition = useMemo(
    () => sectionTypes.find((entry) => entry.type === (section?.type || type)),
    [section?.type, type, sectionTypes],
  );

  const save = async (event) => {
    event.preventDefault();
    if (!definition) {
      setError(t('cms.sections.chooseType'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { type: definition.type, content, visible };
      const saved = isEdit
        ? await api.cms.updateSection(section.id, payload)
        : await api.cms.createSection(pageId, payload);
      toast.success(isEdit ? t('cms.toasts.sectionSaved') : t('cms.toasts.sectionCreated'));
      onSaved(saved);
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('cms.sections.editTitle') : t('cms.sections.newTitle')}</DialogTitle>
          <DialogDescription>
            {definition ? definition.description : t('cms.sections.chooseType')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          {!isEdit ? (
            <Field label={t('cms.sections.type')}>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('cms.sections.chooseType')} />
                </SelectTrigger>
                <SelectContent>
                  {sectionTypes.map((entry) => (
                    <SelectItem key={entry.type} value={entry.type}>
                      {t(`cms.sectionTypes.${entry.type}`, { defaultValue: entry.label })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {definition ? (
            <>
              <ContentFields fields={definition.fields} content={content} onChange={setContent} media={media} />
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium">{t('cms.sections.visible')}</p>
                  <p className="text-[11px] text-muted-foreground">{t('cms.sections.visibleHint')}</p>
                </div>
                <Switch checked={visible} onCheckedChange={setVisible} />
              </div>
            </>
          ) : null}

          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !definition}>
              {saving ? <Spinner /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
