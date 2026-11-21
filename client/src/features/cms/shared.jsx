import { useEffect, useState } from 'react';
import { ImageIcon, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/primitives';

export const NONE = '__none';

/**
 * Image previews use the authenticated endpoint, so the bytes are fetched with
 * the bearer token and shown from a blob URL. A plain <img src> would not carry
 * the session and would 401.
 */
export function useMediaPreview(path) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let revoked = '';
    let cancelled = false;
    if (!path) {
      setUrl('');
      return () => {};
    }
    api.cms
      .previewUrl(path)
      .then((objectUrl) => {
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        revoked = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => setUrl(''));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [path]);
  return url;
}

export function CmsThumb({ path, alt = '', className }) {
  const url = useMediaPreview(path);
  if (!url) {
    return (
      <span className={cn('grid place-items-center rounded-md bg-muted text-muted-foreground', className)}>
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return <img src={url} alt={alt} className={cn('object-cover', className)} />;
}

export function CmsStatus({ status, label }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em]',
        status === 'published'
          ? 'bg-status-available-soft text-status-available'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}

export function tField(t, key, fallback) {
  return t(`cms.fields.${key}`, { defaultValue: fallback });
}

export function MediaSelect({ value, onChange, media, label }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
        <SelectTrigger>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('cms.branding.noImage')}</SelectItem>
          {media.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.alt || entry.filename}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value ? (
        <CmsThumb path={`/api/cms/media/${value}/file`} className="h-24 w-full rounded-md border border-border" />
      ) : null}
    </div>
  );
}

function ImageListField({ value, onChange, media, spec }) {
  const { t } = useTranslation();
  const selected = Array.isArray(value) ? value : [];
  const max = spec.maxItems || 24;
  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((entry) => entry !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };
  return (
    <div className="space-y-2">
      {media.length ? (
        <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-border p-2">
          {media.map((entry) => {
            const active = selected.includes(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => toggle(entry.id)}
                className={cn(
                  'relative overflow-hidden rounded-md border-2 transition-colors',
                  active ? 'border-primary' : 'border-transparent hover:border-border',
                )}
                title={entry.alt || entry.filename}
              >
                <CmsThumb path={`/api/cms/media/${entry.id}/file`} className="h-16 w-full" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">{t('cms.media.empty')}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {selected.length}/{max} {t('cms.media.selected')}
      </p>
    </div>
  );
}

function ListField({ spec, value, onChange, media }) {
  const { t } = useTranslation();
  const items = Array.isArray(value) ? value : [];
  const max = spec.maxItems || 20;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11.5px] font-medium text-muted-foreground">
              {t('cms.sections.item', { index: index + 1 })}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, position) => position !== index))}
              aria-label={t('common.delete')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {(spec.itemFields || []).map((field) => (
              <FieldControl
                key={field.key}
                spec={field}
                media={media}
                value={item?.[field.key]}
                onChange={(next) => {
                  const copy = items.slice();
                  copy[index] = { ...(copy[index] || {}), [field.key]: next };
                  onChange(copy);
                }}
              />
            ))}
          </div>
        </div>
      ))}
      {items.length < max ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...items, {}])}
        >
          <Plus className="size-3.5" /> {t('common.add')}
        </Button>
      ) : null}
    </div>
  );
}

export function FieldControl({ spec, value, onChange, media = [], hideLabel = false }) {
  const { t } = useTranslation();
  const label = hideLabel ? undefined : tField(t, spec.key, spec.label);

  if (spec.type === 'list') {
    return (
      <Field label={label}>
        <ListField spec={spec} value={value} onChange={onChange} media={media} />
      </Field>
    );
  }

  if (spec.type === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <span className="text-[13px] font-medium text-foreground/85">{label}</span>
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }

  return (
    <Field label={label}>
      {spec.type === 'textarea' ? (
        <Textarea value={value || ''} onChange={(event) => onChange(event.target.value)} rows={4} />
      ) : spec.type === 'select' ? (
        <Select value={value || spec.default || spec.options?.[0] || ''} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(spec.options || []).map((option) => (
              <SelectItem key={option} value={option}>
                {t(`cms.options.${option}`, { defaultValue: option })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : spec.type === 'image' ? (
        <MediaSelect value={value} onChange={onChange} media={media} label={label} />
      ) : spec.type === 'imageList' ? (
        <ImageListField spec={spec} value={value} onChange={onChange} media={media} />
      ) : spec.type === 'number' ? (
        <Input
          type="number"
          inputMode="numeric"
          min={spec.min}
          max={spec.max}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
        />
      ) : (
        <Input
          type={spec.type === 'url' ? 'text' : 'text'}
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={spec.type === 'url' ? 'https://…' : undefined}
        />
      )}
    </Field>
  );
}

export function ContentFields({ fields, content, onChange, media }) {
  return (
    <div className="space-y-3">
      {fields.map((spec) => (
        <FieldControl
          key={spec.key}
          spec={spec}
          media={media}
          value={content?.[spec.key]}
          onChange={(next) => onChange({ ...(content || {}), [spec.key]: next })}
        />
      ))}
    </div>
  );
}
