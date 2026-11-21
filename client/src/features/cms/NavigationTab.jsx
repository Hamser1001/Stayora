import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/ui/primitives';

const LOCATIONS = ['header', 'footer'];

function MenuEditor({ location, items, pages, onSave }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(items);
  const [saving, setSaving] = useState(false);

  useEffect(() => setRows(items), [items]);

  const set = (index, key, value) =>
    setRows((current) => current.map((row, position) => (position === index ? { ...row, [key]: value } : row)));

  const move = (index, direction) => {
    const next = rows.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  };

  const add = () =>
    setRows((current) => [
      ...current,
      pages.length
        ? { id: '', label: '', type: 'page', pageId: pages[0].id, visible: true, newTab: false }
        : { id: '', label: '', type: 'link', url: 'https://', visible: true, newTab: false },
    ]);

  const save = async () => {
    setSaving(true);
    try {
      await api.cms.saveNavigation(
        location,
        rows.map((row) => ({
          id: row.id || undefined,
          label: row.label,
          type: row.type,
          pageId: row.type === 'page' ? row.pageId : undefined,
          url: row.type === 'link' ? row.url : undefined,
          visible: row.visible !== false,
          newTab: Boolean(row.newTab),
        })),
      );
      toast.success(t('cms.toasts.navigationSaved'));
      onSave();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div>
          <h3 className="font-display text-[13.5px] font-semibold">{t(`cms.navigation.${location}`)}</h3>
          <p className="text-[11.5px] text-muted-foreground">{t('cms.navigation.locationHint')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="outline" onClick={add}>
            <Plus className="size-3.5" /> {t('cms.navigation.add')}
          </Button>
          <Button size="xs" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Save className="size-3.5" />} {t('common.save')}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">{t('cms.navigation.empty')}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <li key={row.id || index} className="space-y-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="text-muted-foreground disabled:opacity-30"
                    aria-label={t('cms.sections.moveUp')}
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === rows.length - 1}
                    className="text-muted-foreground disabled:opacity-30"
                    aria-label={t('cms.sections.moveDown')}
                  >
                    <ArrowDown className="size-3" />
                  </button>
                </div>
                <Input
                  value={row.label}
                  onChange={(event) => set(index, 'label', event.target.value)}
                  placeholder={t('cms.navigation.label')}
                  className="h-9 max-w-[220px]"
                />
                <Select
                  value={row.type}
                  onValueChange={(value) => {
                    set(index, 'type', value);
                    if (value === 'page' && !row.pageId && pages.length) set(index, 'pageId', pages[0].id);
                  }}
                >
                  <SelectTrigger className="h-9 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="page">{t('cms.navigation.page')}</SelectItem>
                    <SelectItem value="link">{t('cms.navigation.link')}</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{t('cms.navigation.visible')}</span>
                  <Switch
                    checked={row.visible !== false}
                    onCheckedChange={(value) => set(index, 'visible', value)}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>

              {row.type === 'page' ? (
                <Select value={row.pageId || ''} onValueChange={(value) => set(index, 'pageId', value)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t('cms.navigation.page')} />
                  </SelectTrigger>
                  <SelectContent>
                    {pages.map((page) => (
                      <SelectItem key={page.id} value={page.id}>
                        {page.title} · /{page.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Field label={t('cms.navigation.url')}>
                  <Input
                    value={row.url || ''}
                    onChange={(event) => set(index, 'url', event.target.value)}
                    placeholder="https://example.com"
                  />
                </Field>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function NavigationTab({ navigation, pages, onSaved }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {LOCATIONS.map((location) => (
        <MenuEditor
          key={location}
          location={location}
          items={navigation?.[location] || []}
          pages={pages || []}
          onSave={onSaved}
        />
      ))}
    </div>
  );
}
