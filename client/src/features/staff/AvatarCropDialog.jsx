import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/loading';

const PREVIEW = 240;
const OUTPUT = 512;
const clamp = (value, limit) => Math.min(limit, Math.max(-limit, value));

/**
 * Square cropper built on canvas: drag to reposition, slider to zoom.
 * The visible square is exactly what gets saved, at 512×512 JPEG.
 */
export function AvatarCropDialog({ open, onOpenChange, file, onSave, saving }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState('');
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    if (!open || !file) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setImage(null);
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result || ''));
    reader.readAsDataURL(file);
  }, [open, file]);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const baseScale = image ? PREVIEW / Math.min(image.width, image.height) : 1;
  const scale = baseScale * zoom;
  const renderedW = image ? image.width * scale : PREVIEW;
  const renderedH = image ? image.height * scale : PREVIEW;
  const maxX = Math.max(0, (renderedW - PREVIEW) / 2);
  const maxY = Math.max(0, (renderedH - PREVIEW) / 2);

  useEffect(() => {
    const dx = Math.max(0, (renderedW - PREVIEW) / 2);
    const dy = Math.max(0, (renderedH - PREVIEW) / 2);
    setOffset((prev) => ({ x: clamp(prev.x, dx), y: clamp(prev.y, dy) }));
  }, [renderedW, renderedH]);

  const onPointerDown = (event) => {
    if (!image) return;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointers have no capture target; dragging still works.
    }
    drag.current = { x: event.clientX, y: event.clientY, origin: offset };
    setDragging(true);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    setOffset({
      x: clamp(drag.current.origin.x + event.clientX - drag.current.x, maxX),
      y: clamp(drag.current.origin.y + event.clientY - drag.current.y, maxY),
    });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const handleSave = () => {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext('2d');
    // JPEG has no alpha channel; fill so transparent PNGs don't turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, OUTPUT, OUTPUT);
    const ratio = OUTPUT / PREVIEW;
    const x = ((PREVIEW - renderedW) / 2 + offset.x) * ratio;
    const y = ((PREVIEW - renderedH) / 2 + offset.y) * ratio;
    context.drawImage(image, x, y, renderedW * ratio, renderedH * ratio);
    onSave(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t('profile.cropTitle')}</DialogTitle>
          <DialogDescription>{t('profile.cropHint')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            role="application"
            aria-label={t('profile.cropTitle')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={`relative overflow-hidden rounded-2xl border border-border bg-muted select-none touch-none ${
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ width: PREVIEW, height: PREVIEW, maxWidth: '100%' }}
          >
            {image ? (
              <img
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: renderedW,
                  height: renderedH,
                  left: (PREVIEW - renderedW) / 2 + offset.x,
                  top: (PREVIEW - renderedH) / 2 + offset.y,
                }}
              />
            ) : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <ImagePlus className="size-6" />
              </div>
            )}
          </div>

          <label className="flex w-full items-center gap-3">
            <span className="w-14 shrink-0 text-[11.5px] font-medium text-muted-foreground">
              {t('profile.zoom')}
            </span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
              aria-label={t('profile.zoom')}
            />
          </label>
        </div>

        <DialogFooter className="mt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!image || saving}>
            {saving ? <Spinner /> : null}
            {t('profile.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
