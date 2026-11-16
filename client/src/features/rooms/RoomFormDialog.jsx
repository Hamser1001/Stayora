import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { BedDouble, Check } from 'lucide-react';
import { api } from '@/api';
import { AMENITIES, ROOM_AUDIENCES, ROOM_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';
import { cn } from '@/lib/utils';

function useRoomSchema(t) {
  return z.object({
    number: z
      .string()
      .trim()
      .min(1, t('rooms.validation.roomNumber'))
      .max(12, t('rooms.validation.roomNumber')),
    type: z.enum(ROOM_TYPES, { errorMap: () => ({ message: t('rooms.validation.roomType') }) }),
    audience: z.enum(ROOM_AUDIENCES),
    floor: z.coerce.number().int().min(0).max(20, t('rooms.validation.floor')),
    bedCount: z.coerce
      .number()
      .int()
      .min(1, t('rooms.validation.beds'))
      .max(20, t('rooms.validation.beds')),
    pricePerBed: z.coerce.number().min(1, t('rooms.validation.price')),
    notes: z.string().max(280).optional(),
  });
}

export function RoomFormDialog({ open, onOpenChange, room, onSaved }) {
  const { t } = useTranslation();
  const [amenities, setAmenities] = useState([]);
  const [error, setError] = useState('');
  const schema = useRoomSchema(t);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      number: '',
      type: 'dorm',
      audience: 'mixed',
      floor: 0,
      bedCount: 4,
      pricePerBed: 30,
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    if (room) {
      reset({
        number: room.number,
        type: room.type,
        audience: room.audience,
        floor: room.floor,
        bedCount: room.bedCount,
        pricePerBed: room.pricePerBed,
        notes: room.notes || '',
      });
      setAmenities(room.amenities || []);
    } else {
      reset({
        number: '',
        type: 'dorm',
        audience: 'mixed',
        floor: 0,
        bedCount: 4,
        pricePerBed: 30,
        notes: '',
      });
      setAmenities(['wifi', 'lockers']);
    }
  }, [open, room, reset]);

  const type = watch('type');

  const toggleAmenity = (amenity) => {
    setAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((item) => item !== amenity) : [...prev, amenity],
    );
  };

  const onSubmit = async (values) => {
    setError('');
    try {
      const payload = { ...values, amenities };
      const saved = room
        ? await api.rooms.update(room.id, payload)
        : await api.rooms.create(payload);
      toast.success(
        room ? t('rooms.updated', { room: saved.number }) : t('rooms.created', { room: saved.number }),
      );
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[560px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room ? t('rooms.editRoom') : t('rooms.addRoom')}</DialogTitle>
          <DialogDescription>{t('rooms.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('rooms.roomNumber')}
              htmlFor="room-number"
              error={errors.number?.message}
              required
            >
              <Input id="room-number" placeholder="105" {...register('number')} />
            </Field>

            <Field label={t('rooms.roomType')} required error={errors.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`rooms.type.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {type === 'dorm' ? (
              <Field label={t('rooms.audienceLabel')} error={errors.audience?.message}>
                <Controller
                  control={control}
                  name="audience"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROOM_AUDIENCES.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`rooms.audience.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            ) : null}

            <Field
              label={t('rooms.floor')}
              htmlFor="room-floor"
              error={errors.floor?.message}
              required
            >
              <Input id="room-floor" type="number" min={0} max={20} {...register('floor')} />
            </Field>

            <Field
              label={t('rooms.bedCount')}
              htmlFor="room-beds"
              error={errors.bedCount?.message}
              required
            >
              <div className="relative">
                <BedDouble className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  id="room-beds"
                  type="number"
                  min={1}
                  max={20}
                  className="pl-9"
                  {...register('bedCount')}
                />
              </div>
            </Field>

            <Field
              label={t('rooms.pricePerBed')}
              htmlFor="room-price"
              error={errors.pricePerBed?.message}
              required
            >
              <Input
                id="room-price"
                type="number"
                min={1}
                step="1"
                {...register('pricePerBed')}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-foreground/85">{t('rooms.amenities')}</p>
            <div className="flex flex-wrap gap-1.5">
              {AMENITIES.map((amenity) => {
                const active = amenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                      active
                        ? 'border-primary/25 bg-primary-soft text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-muted',
                    )}
                  >
                    {active ? <Check className="size-3" /> : null}
                    {t(`rooms.amenity.${amenity}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label={t('common.notes')} htmlFor="room-notes">
            <Textarea
              id="room-notes"
              rows={2}
              placeholder={t('common.description')}
              {...register('notes')}
            />
          </Field>

          {error ? (
            <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[12px] font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
