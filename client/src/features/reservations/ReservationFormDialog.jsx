import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { BedDouble, CalendarDays, UserPlus, Users } from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { BOOKING_SOURCES } from '@/lib/constants';
import { addDays, nightsBetween, todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/loading';
import { Separator } from '@/components/ui/primitives';

function useSchema(t) {
  return z
    .object({
      guestMode: z.enum(['existing', 'new']),
      guestId: z.string().optional(),
      guestName: z.string().optional(),
      guestEmail: z.string().optional(),
      guestPhone: z.string().optional(),
      guestNationality: z.string().optional(),
      roomId: z.string().min(1, t('reservations.form.bedError')),
      bedId: z.string().min(1, t('reservations.form.bedError')),
      arrival: z.string().min(1, t('validation.required')),
      departure: z.string().min(1, t('validation.required')),
      guests: z.coerce.number().int().min(1, t('validation.integer')),
      rate: z.coerce.number().min(1, t('validation.positive')),
      discount: z.coerce.number().min(0).optional(),
      source: z.enum(BOOKING_SOURCES),
      deposit: z.coerce.number().min(0).optional(),
      notes: z.string().max(400).optional(),
    })
    .superRefine((values, ctx) => {
      if (values.departure <= values.arrival) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['departure'],
          message: t('reservations.form.datesError'),
        });
      }
      if (values.guestMode === 'existing' && !values.guestId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guestId'],
          message: t('reservations.form.guestError'),
        });
      }
      if (values.guestMode === 'new' && !String(values.guestName || '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['guestName'],
          message: t('guests.validation.name'),
        });
      }
    });
}

const defaults = () => ({
  guestMode: 'existing',
  guestId: '',
  guestName: '',
  guestEmail: '',
  guestPhone: '',
  guestNationality: '',
  roomId: '',
  bedId: '',
  arrival: todayISO(),
  departure: addDays(todayISO(), 2),
  guests: 1,
  rate: 30,
  discount: 0,
  source: 'direct',
  deposit: 0,
  notes: '',
});

export function ReservationFormDialog({ open, onOpenChange, reservation, onSaved }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [guests, setGuests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [beds, setBeds] = useState([]);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [error, setError] = useState('');
  const schema = useSchema(t);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults() });

  const values = watch();
  const arrival = values.arrival;
  const departure = values.departure;
  const roomId = values.roomId;
  const bedId = values.bedId;

  // Keep the stay valid: moving arrival forward pushes departure with it.
  useEffect(() => {
    if (!open || !arrival) return;
    if (!departure || departure <= arrival) {
      setValue('departure', addDays(arrival, 1), { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arrival]);

  const nights = nightsBetween(arrival, departure);
  const total = Math.max(0, nights * (Number(values.rate) || 0) - (Number(values.discount) || 0));

  useEffect(() => {
    if (!open) return;
    setError('');
    (async () => {
      const [guestList, roomList] = await Promise.all([api.guests.options(), api.rooms.list()]);
      setGuests(guestList);
      setRooms(roomList);
      if (reservation) {
        reset({
          guestMode: 'existing',
          guestId: reservation.guestId,
          guestName: '',
          guestEmail: '',
          guestPhone: '',
          guestNationality: '',
          roomId: reservation.roomId,
          bedId: reservation.bedId,
          arrival: reservation.arrival,
          departure: reservation.departure,
          guests: reservation.guests || 1,
          rate: money.toDisplay(reservation.rate),
          discount: money.toDisplay(reservation.discount || 0),
          source: reservation.source || 'direct',
          deposit: 0,
          notes: reservation.notes || '',
        });
      } else {
        reset({ ...defaults(), rate: money.toDisplay(30) });
      }
    })();
  }, [open, reservation, reset]);

  useEffect(() => {
    if (!open || !arrival || !departure || departure <= arrival || !roomId) {
      setBeds([]);
      return;
    }
    let cancelled = false;
    setLoadingBeds(true);
    (async () => {
      try {
        const list = await api.reservations.availability({ arrival, departure, roomId });
        if (cancelled) return;
        const own =
          reservation && reservation.roomId === roomId && reservation.bedId
            ? {
                id: reservation.bedId,
                label: reservation.bed?.label || reservation.bedId,
                roomId,
                roomNumber: reservation.roomNumber,
                pricePerBed: reservation.rate,
              }
            : null;
        const merged = own && !list.some((bed) => bed.id === own.id) ? [own, ...list] : list;
        setBeds(merged);
        if (!merged.some((bed) => bed.id === values.bedId)) {
          setValue('bedId', merged[0]?.id || '');
        }
      } finally {
        if (!cancelled) setLoadingBeds(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, arrival, departure, roomId]);

  const selectedBed = useMemo(() => beds.find((bed) => bed.id === bedId) || null, [beds, bedId]);
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === roomId) || null, [rooms, roomId]);

  useEffect(() => {
    if (!selectedBed) return;
    if (!reservation) setValue('rate', money.toDisplay(selectedBed.pricePerBed));
    setValue('guests', Math.min(Number(values.guests) || 1, Math.max(1, selectedRoom?.totalBeds || 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBed?.id]);

  const onSubmit = async (formValues) => {
    setError('');
    try {
      let guestId = formValues.guestId;
      if (formValues.guestMode === 'new') {
        const guest = await api.guests.create({
          name: formValues.guestName,
          email: formValues.guestEmail,
          phone: formValues.guestPhone,
          nationality: formValues.guestNationality,
        });
        guestId = guest.id;
      }
      const payload = {
        guestId,
        roomId: formValues.roomId,
        bedId: formValues.bedId,
        arrival: formValues.arrival,
        departure: formValues.departure,
        guests: formValues.guests,
        // Pricing is entered in the display currency; the ledger keeps base amounts.
        rate: money.toBase(formValues.rate),
        discount: money.toBase(formValues.discount || 0),
        source: formValues.source,
        deposit: money.toBase(formValues.deposit || 0),
        notes: formValues.notes,
      };
      const saved = reservation
        ? await api.reservations.update(reservation.id, payload)
        : await api.reservations.create(payload);
      toast.success(
        reservation
          ? t('reservations.updatedToast', { reference: saved.reference })
          : t('reservations.createdToast', { reference: saved.reference }),
      );
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[640px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reservation ? t('reservations.edit') : t('reservations.new')}</DialogTitle>
          <DialogDescription>{t('reservations.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          {/* Guest */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('reservations.form.guestSection')}
              </p>
              {!reservation ? (
                <div className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5">
                  {[
                    { key: 'existing', label: t('reservations.form.existingGuest'), icon: Users },
                    { key: 'new', label: t('reservations.form.newGuest'), icon: UserPlus },
                  ].map((option) => (
                    <Controller
                      key={option.key}
                      control={control}
                      name="guestMode"
                      render={({ field }) => (
                        <button
                          type="button"
                          onClick={() => field.onChange(option.key)}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                            field.value === option.key
                              ? 'bg-primary-soft text-primary'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          <option.icon className="size-3" />
                          {option.label}
                        </button>
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {values.guestMode === 'existing' || reservation ? (
              <Field label={t('reservations.guest')} error={errors.guestId?.message} required>
                <Controller
                  control={control}
                  name="guestId"
                  render={({ field }) => (
                    <Select
                      value={field.value || ''}
                      onValueChange={field.onChange}
                      disabled={Boolean(reservation)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('reservations.form.selectGuest')} />
                      </SelectTrigger>
                      <SelectContent>
                        {guests.map((guest) => (
                          <SelectItem key={guest.id} value={guest.id}>
                            {guest.name}
                            {guest.email ? ` · ${guest.email}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t('reservations.form.guestName')}
                  htmlFor="res-guest-name"
                  error={errors.guestName?.message}
                  required
                  className="sm:col-span-2"
                >
                  <Input id="res-guest-name" {...register('guestName')} />
                </Field>
                <Field label={t('reservations.form.guestEmail')} htmlFor="res-guest-email">
                  <Input id="res-guest-email" type="email" {...register('guestEmail')} />
                </Field>
                <Field label={t('reservations.form.guestPhone')} htmlFor="res-guest-phone">
                  <Input id="res-guest-phone" {...register('guestPhone')} />
                </Field>
                <Field
                  label={t('reservations.form.guestNationality')}
                  htmlFor="res-guest-nationality"
                  className="sm:col-span-2"
                >
                  <Input id="res-guest-nationality" {...register('guestNationality')} />
                </Field>
              </div>
            )}
          </section>

          <Separator />

          {/* Stay */}
          <section className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('reservations.form.staySection')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('reservations.arrival')} htmlFor="res-arrival" error={errors.arrival?.message} required>
                <Controller
                  control={control}
                  name="arrival"
                  render={({ field }) => (
                    <DatePicker
                      id="res-arrival"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(errors.arrival)}
                    />
                  )}
                />
              </Field>
              <Field
                label={t('reservations.departure')}
                htmlFor="res-departure"
                error={errors.departure?.message}
                required
              >
                <Controller
                  control={control}
                  name="departure"
                  render={({ field }) => (
                    <DatePicker
                      id="res-departure"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={arrival}
                      aria-invalid={Boolean(errors.departure)}
                    />
                  )}
                />
              </Field>

              <Field label={t('reservations.form.room')} required error={errors.roomId?.message}>
                <Controller
                  control={control}
                  name="roomId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('reservations.form.selectRoom')} />
                      </SelectTrigger>
                      <SelectContent>
                        {rooms.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {t('rooms.room')} {room.number} · {t(`rooms.type.${room.type}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field label={t('reservations.form.bed')} required error={errors.bedId?.message}>
                <Controller
                  control={control}
                  name="bedId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!roomId || loadingBeds}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingBeds
                              ? t('common.loading')
                              : roomId
                                ? t('reservations.form.selectBed')
                                : t('reservations.form.selectDates')
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {beds.map((bed) => (
                          <SelectItem key={bed.id} value={bed.id}>
                            {bed.label} · {money.currency(bed.pricePerBed)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            {roomId && !loadingBeds && beds.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-status-reserved/25 bg-status-reserved-soft px-3 py-2 text-[11.5px] font-medium text-status-reserved">
                <BedDouble className="size-3.5" />
                {t('reservations.form.noBeds')}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label={t('reservations.form.guestsCount')}
                htmlFor="res-guests"
                error={errors.guests?.message}
              >
                <Input id="res-guests" type="number" min={1} max={20} {...register('guests')} />
              </Field>
              <Field label={t('reservations.source')} error={errors.source?.message}>
                <Controller
                  control={control}
                  name="source"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOKING_SOURCES.map((source) => (
                          <SelectItem key={source} value={source}>
                            {t(`reservations.sourceLabels.${source}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field
                label={t('reservations.form.rate')}
                htmlFor="res-rate"
                hint={money.currencyCode}
                error={errors.rate?.message}
              >
                <Input id="res-rate" type="number" min={1} step="1" {...register('rate')} />
              </Field>
            </div>
          </section>

          <Separator />

          {/* Pricing */}
          <section className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('reservations.form.pricingSection')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('reservations.form.discount')}
                htmlFor="res-discount"
                hint={t('reservations.form.discountHint')}
                error={errors.discount?.message}
              >
                <Input id="res-discount" type="number" min={0} step="1" {...register('discount')} />
              </Field>
              {!reservation ? (
                <Field
                  label={t('reservations.form.deposit')}
                  htmlFor="res-deposit"
                  hint={t('reservations.form.depositHint')}
                  error={errors.deposit?.message}
                >
                  <Input id="res-deposit" type="number" min={0} step="0.01" {...register('deposit')} />
                </Field>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {t('reservations.nightBreakdown', {
                    count: nights,
                    rate: money.currency(values.rate),
                  })}
                </span>
                <span className="numeric">{money.currency(nights * (Number(values.rate) || 0))}</span>
              </div>
              {Number(values.discount) > 0 ? (
                <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted-foreground">
                  <span>{t('reservations.form.discountApplied')}</span>
                  <span className="numeric">−{money.currency(values.discount)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
                <span className="text-[12px] font-semibold">{t('reservations.form.stayTotal')}</span>
                <span className="font-display text-[16px] font-bold numeric">{money.currency(total)}</span>
              </div>
            </div>
          </section>

          <Field label={t('reservations.form.notes')} htmlFor="res-notes">
            <Textarea
              id="res-notes"
              rows={2}
              placeholder={t('reservations.form.notesPlaceholder')}
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
              {reservation ? t('common.save') : t('reservations.new')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
