import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/api';
import { TASK_PRIORITIES, TASK_TYPES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
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

function useSchema(t) {
  return z.object({
    title: z.string().trim().min(2, t('housekeeping.validation.title')),
    type: z.enum(TASK_TYPES),
    roomId: z.string().min(1, t('housekeeping.validation.room')),
    priority: z.enum(TASK_PRIORITIES),
    assigneeId: z.string().optional(),
    due: z.string().min(1, t('validation.required')),
    description: z.string().max(400).optional(),
  });
}

export function TaskFormDialog({ open, onOpenChange, onSaved }) {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const schema = useSchema(t);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      type: 'cleaning',
      roomId: '',
      priority: 'medium',
      assigneeId: 'none',
      due: todayISO(),
      description: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    reset({
      title: '',
      type: 'cleaning',
      roomId: '',
      priority: 'medium',
      assigneeId: 'none',
      due: todayISO(),
      description: '',
    });
    (async () => {
      const [roomList, staffList] = await Promise.all([api.rooms.list(), api.staff.list()]);
      setRooms(roomList);
      setStaff(staffList.filter((member) => ['housekeeping', 'manager', 'owner'].includes(member.role)));
    })();
  }, [open, reset]);

  const onSubmit = async (values) => {
    setError('');
    try {
      await api.housekeeping.create({
        ...values,
        assigneeId: values.assigneeId === 'none' ? null : values.assigneeId,
      });
      toast.success(t('housekeeping.created'));
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      setError(err.message || t('errors.body'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{t('housekeeping.newTaskTitle')}</DialogTitle>
          <DialogDescription>{t('housekeeping.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field
            label={t('housekeeping.task')}
            htmlFor="task-title"
            error={errors.title?.message}
            required
          >
            <Input
              id="task-title"
              placeholder={t('housekeeping.descriptionPlaceholder')}
              {...register('title')}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('housekeeping.type')} error={errors.type?.message}>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`housekeeping.types.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('housekeeping.room')} required error={errors.roomId?.message}>
              <Controller
                control={control}
                name="roomId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('housekeeping.room')} />
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
            <Field label={t('housekeeping.priority')}>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`status.${option}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('housekeeping.assignee')}>
              <Controller
                control={control}
                name="assigneeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('housekeeping.unassigned')}</SelectItem>
                      {staff.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('housekeeping.due')} htmlFor="task-due" error={errors.due?.message} required>
              <Controller
                control={control}
                name="due"
                render={({ field }) => (
                  <DatePicker
                    id="task-due"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(errors.due)}
                  />
                )}
              />
            </Field>
          </div>

          <Field label={t('housekeeping.description')} htmlFor="task-description">
            <Textarea
              id="task-description"
              rows={2}
              placeholder={t('housekeeping.descriptionPlaceholder')}
              {...register('description')}
            />
          </Field>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11.5px] text-muted-foreground">
            {t('housekeeping.roomStatusNote')}
          </p>

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
              {t('housekeeping.newTask')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
