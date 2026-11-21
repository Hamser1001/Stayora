import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, ImageIcon, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { CmsThumb } from './shared';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaDialog({ open, media, file, onOpenChange, onSaved }) {
  const { t } = useTranslation();
  const isEdit = Boolean(media);
  const [alt, setAlt] = useState(media?.alt || '');
  const [caption, setCaption] = useState(media?.caption || '');
  const [folder, setFolder] = useState(media?.folder || 'general');
  const [visibility, setVisibility] = useState(media?.visibility || 'public');
  const [replacement, setReplacement] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setAlt(media?.alt || '');
    setCaption(media?.caption || '');
    setFolder(media?.folder || 'general');
    setVisibility(media?.visibility || 'public');
    setReplacement(null);
    setError('');
    if (file) readFile(file).then(setPreview).catch(() => setPreview(''));
    else setPreview('');
  }, [open, media, file]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        const payload = { alt, caption, folder, visibility };
        await api.cms.updateMedia(media.id, payload);
        if (replacement) {
          await api.cms.replaceMedia(media.id, {
            dataUrl: await readFile(replacement),
            filename: replacement.name,
          });
        }
        toast.success(t('cms.toasts.mediaUpdated'));
      } else {
        if (!file) throw new Error(t('cms.media.chooseFile'));
        await api.cms.uploadMedia({
          dataUrl: await readFile(file),
          filename: file.name,
          alt,
          caption,
          folder,
          visibility,
        });
        toast.success(t('cms.toasts.mediaUploaded'));
      }
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('cms.media.editTitle') : t('cms.media.uploadTitle')}</DialogTitle>
          <DialogDescription>{t('cms.media.hint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          {preview ? (
            <img src={preview} alt="" className="max-h-48 w-full rounded-lg border border-border object-cover" />
          ) : file ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px]">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{file.name}</span>
              <span className="ml-auto text-muted-foreground">{formatBytes(file.size)}</span>
            </div>
          ) : null}

          <Field label={t('cms.media.alt')} hint={t('cms.media.altHint')}>
            <Input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={160} />
          </Field>
          <Field label={t('cms.media.caption')}>
            <Textarea rows={2} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={300} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('cms.media.folder')}>
              <Input value={folder} onChange={(event) => setFolder(event.target.value)} maxLength={32} />
            </Field>
            <Field label={t('cms.media.visibility')}>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('cms.media.public')}</SelectItem>
                  <SelectItem value="private">{t('cms.media.private')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isEdit ? (
            <Field label={t('cms.media.replace')} hint={t('cms.media.replaceHint')}>
              <Input
                type="file"
                accept={ACCEPTED.join(',')}
                onChange={(event) => setReplacement(event.target.files?.[0] || null)}
              />
            </Field>
          ) : null}

          {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : null}
              {isEdit ? t('common.save') : t('cms.media.upload')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MediaTab({ media, loading, onReload }) {
  const { t } = useTranslation();
  const fileInput = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [dialog, setDialog] = useState({ open: false, media: null });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState('');

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error(t('cms.media.badType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(t('cms.media.tooLarge'));
      return;
    }
    setPendingFile(file);
    setDialog({ open: true, media: null });
  };

  const remove = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.cms.deleteMedia(target.id);
      toast.success(t('cms.toasts.mediaDeleted'));
      await onReload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  const rows = (media || []).filter((entry) =>
    !query ? true : `${entry.filename} ${entry.alt} ${entry.folder}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="mr-auto">
          <h3 className="font-display text-[13.5px] font-semibold">{t('cms.media.title')}</h3>
          <p className="text-[11.5px] text-muted-foreground">{t('cms.media.subtitle')}</p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('cms.media.search')}
          className="h-8 w-44"
        />
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={pick}
        />
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          <Upload className="size-3.5" /> {t('cms.media.upload')}
        </Button>
      </Card>

      {loading && !media ? (
        <Spinner className="mx-auto my-10" />
      ) : rows.length === 0 ? (
        <EmptyState icon={ImageIcon} title={t('cms.media.empty')} description={t('cms.media.emptyHint')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((entry) => (
            <Card key={entry.id} className="overflow-hidden">
              <CmsThumb
                path={`/api/cms/media/${entry.id}/file`}
                alt={entry.alt}
                className="h-36 w-full bg-muted"
              />
              <div className="space-y-1 px-3 py-2.5">
                <p className="truncate text-[12.5px] font-medium">{entry.filename}</p>
                <p className="text-[11px] text-muted-foreground">
                  {entry.width}×{entry.height} · {formatBytes(entry.size)} · {entry.folder}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{entry.alt || t('cms.media.noAlt')}</p>
                <div className="flex items-center gap-1 pt-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDialog({ open: true, media: entry })}
                    aria-label={t('common.edit')}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/api/public/media/${entry.id}`,
                        );
                        toast.success(t('cms.media.copied'));
                      } catch {
                        toast.error(t('errors.body'));
                      }
                    }}
                    aria-label={t('cms.media.copy')}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <span className="ml-auto" />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setConfirmDelete(entry)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
        <Plus className="size-3.5" /> {t('cms.media.upload')}
      </Button>

      <MediaDialog
        open={dialog.open}
        media={dialog.media}
        file={dialog.media ? null : pendingFile}
        onOpenChange={(open) => {
          setDialog({ open, media: open ? dialog.media : null });
          if (!open) setPendingFile(null);
        }}
        onSaved={async () => {
          setDialog({ open: false, media: null });
          setPendingFile(null);
          await onReload();
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => setConfirmDelete(open ? confirmDelete : null)}
        title={t('cms.media.deleteTitle')}
        description={t('cms.media.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
