import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FileText,
  Plus,
  Rocket,
  Trash2,
  Undo2,
} from 'lucide-react';
import { api } from '@/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import { Switch } from '@/components/ui/primitives';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { SectionDialog } from './SectionDialog';
import { CmsStatus } from './shared';

function PageList({ pages, selectedId, onSelect, onNew }) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h3 className="font-display text-[13.5px] font-semibold">{t('cms.tabs.pages')}</h3>
        <Button size="xs" onClick={onNew}>
          <Plus className="size-3.5" /> {t('cms.pages.new')}
        </Button>
      </div>
      <ul className="divide-y divide-border/60">
        {pages.map((page) => (
          <li key={page.id}>
            <button
              type="button"
              onClick={() => onSelect(page.id)}
              className={cn(
                'flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                selectedId === page.id && 'bg-primary-soft/60',
              )}
            >
              <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{page.title}</span>
                  <CmsStatus
                    status={page.status}
                    label={t(`cms.status.${page.status}`)}
                  />
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  /{page.slug} · {t('cms.pages.sectionCount', { count: page.sectionCount })}
                  {page.hasUnpublishedChanges ? ` · ${t('cms.pages.unpublishedChanges')}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PageEditor({ page, sectionTypes, media, onChanged, onDeleted }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(page);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sectionDialog, setSectionDialog] = useState(null); // null | { section }

  useEffect(() => {
    setForm(page);
    setError('');
  }, [page]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateSeo = (key, value) =>
    setForm((current) => ({ ...current, seo: { ...(current.seo || {}), [key]: value } }));

  const run = async (action, message) => {
    try {
      await action();
      if (message) toast.success(message);
      await onChanged();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.cms.updatePage(page.id, {
        title: form.title,
        slug: form.slug,
        description: form.description,
        visibility: form.visibility,
        seo: form.seo,
      });
      toast.success(t('cms.toasts.pageSaved'));
      await onChanged();
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  const moveSection = async (index, direction) => {
    const next = page.sections.slice();
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await run(
      () =>
        api.cms.reorderSections(
          page.id,
          next.map((entry, order) => ({ id: entry.id, order })),
        ),
      null,
    );
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[14px] font-semibold">{page.title}</h3>
            <p className="text-[11.5px] text-muted-foreground">
              /{page.slug}
              {page.revision ? ` · ${t('cms.pages.revision', { revision: page.revision })}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {page.status === 'published' ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => run(() => api.cms.unpublishPage(page.id), t('cms.toasts.pageUnpublished'))}
              >
                <Undo2 className="size-3.5" /> {t('cms.pages.unpublish')}
              </Button>
            ) : (
              <Button
                size="xs"
                onClick={() => run(() => api.cms.publishPage(page.id), t('cms.toasts.pagePublished'))}
              >
                <Rocket className="size-3.5" /> {t('cms.pages.publish')}
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" onClick={() => setConfirmDelete(true)} aria-label={t('common.delete')}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        <form onSubmit={save} className="space-y-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.page.title')} required>
              <Input value={form.title || ''} onChange={(event) => update('title', event.target.value)} />
            </Field>
            <Field label={t('cms.page.slug')} hint={t('cms.page.slugHint')}>
              <Input value={form.slug || ''} onChange={(event) => update('slug', event.target.value)} />
            </Field>
          </div>
          <Field label={t('cms.page.description')}>
            <Textarea
              rows={2}
              value={form.description || ''}
              onChange={(event) => update('description', event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.page.visibility')}>
              <Select value={form.visibility} onValueChange={(value) => update('visibility', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('cms.pages.public')}</SelectItem>
                  <SelectItem value="unlisted">{t('cms.pages.unlisted')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('cms.page.seoTitle')} hint={t('cms.page.seoHint')}>
              <Input
                value={form.seo?.title || ''}
                onChange={(event) => updateSeo('title', event.target.value)}
              />
            </Field>
          </div>
          <Field label={t('cms.page.seoDescription')}>
            <Textarea
              rows={2}
              value={form.seo?.description || ''}
              onChange={(event) => updateSeo('description', event.target.value)}
            />
          </Field>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-[13px] font-medium">{t('cms.page.noIndex')}</p>
              <p className="text-[11px] text-muted-foreground">{t('cms.page.noIndexHint')}</p>
            </div>
            <Switch checked={Boolean(form.seo?.noIndex)} onCheckedChange={(value) => updateSeo('noIndex', value)} />
          </div>
          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner /> : null} {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <h3 className="font-display text-[13.5px] font-semibold">{t('cms.pages.sections')}</h3>
          <Button size="xs" variant="outline" onClick={() => setSectionDialog({ section: null })}>
            <Plus className="size-3.5" /> {t('cms.pages.addSection')}
          </Button>
        </div>
        {page.sections.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">{t('cms.pages.noSections')}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {page.sections.map((section, index) => (
              <li key={section.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    className="text-muted-foreground disabled:opacity-30"
                    aria-label={t('cms.sections.moveUp')}
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === page.sections.length - 1}
                    className="text-muted-foreground disabled:opacity-30"
                    aria-label={t('cms.sections.moveDown')}
                  >
                    <ArrowDown className="size-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSectionDialog({ section })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium">
                      {t(`cms.sectionTypes.${section.type}`, { defaultValue: section.type })}
                    </span>
                    {section.visible ? null : (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('cms.sections.hidden')}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {section.content?.heading || section.content?.body || section.content?.image || '—'}
                  </span>
                </button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    run(
                      () =>
                        api.cms.updateSection(section.id, { visible: !section.visible }),
                      null,
                    )
                  }
                  aria-label={section.visible ? t('cms.sections.hide') : t('cms.sections.show')}
                >
                  {section.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() =>
                    run(() => api.cms.deleteSection(section.id), t('cms.toasts.sectionDeleted'))
                  }
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SectionDialog
        open={Boolean(sectionDialog)}
        pageId={page.id}
        section={sectionDialog?.section || null}
        sectionTypes={sectionTypes}
        media={media}
        onOpenChange={(open) => setSectionDialog(open ? sectionDialog : null)}
        onSaved={async () => {
          setSectionDialog(null);
          await onChanged();
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('cms.pages.deleteTitle')}
        description={t('cms.pages.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await api.cms.deletePage(page.id);
            toast.success(t('cms.toasts.pageDeleted'));
            onDeleted();
          } catch (err) {
            setError(err.message || t('errors.body'));
          }
        }}
      />
    </div>
  );
}

export function PagesTab({ pages, loading, error, reload, sectionTypes, media }) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadPage = useCallback(async (id) => {
    setPageLoading(true);
    try {
      setPage(await api.cms.page(id));
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setPageLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!pages?.length) return;
    const target = pages.some((entry) => entry.id === selectedId) ? selectedId : pages[0].id;
    setSelectedId(target);
    loadPage(target);
  }, [pages, selectedId, loadPage]);

  const refreshPage = async () => {
    if (!selectedId) return;
    await Promise.all([reload(), loadPage(selectedId)]);
  };

  const createPage = async () => {
    setCreating(true);
    try {
      const created = await api.cms.createPage({
        title: t('cms.pages.untitled'),
        slug: `page-${Date.now().toString(36)}`,
      });
      toast.success(t('cms.toasts.pageCreated'));
      await reload();
      setSelectedId(created.id);
      await loadPage(created.id);
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setCreating(false);
    }
  };

  if (loading && !pages) return <Spinner className="mx-auto my-10" />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-3">
        <PageList
          pages={pages || []}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            loadPage(id);
          }}
          onNew={createPage}
        />
        {creating ? <p className="text-center text-[11px] text-muted-foreground">{t('common.loading')}</p> : null}
      </div>
      <div className="min-w-0">
        {pageLoading && !page ? (
          <Spinner className="mx-auto my-10" />
        ) : page ? (
          <PageEditor
            page={page}
            sectionTypes={sectionTypes}
            media={media}
            onChanged={refreshPage}
            onDeleted={async () => {
              setSelectedId(null);
              setPage(null);
              await reload();
            }}
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={t('cms.pages.selectPrompt')}
            description={t('cms.pages.selectHint')}
          />
        )}
      </div>
    </div>
  );
}
