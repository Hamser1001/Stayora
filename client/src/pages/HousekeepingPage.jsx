import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Brush,
  CalendarClock,
  Check,
  ClipboardCheck,
  Play,
  Plus,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/contexts/AuthContext';
import { useMoney } from '@/hooks/useMoney';
import { TASK_STATUSES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { cn, initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { SegmentedControl, SegmentedOption } from '@/components/ui/segmented';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import { TaskFormDialog } from '@/features/housekeeping/TaskFormDialog';

const TYPE_ICONS = {
  cleaning: Brush,
  maintenance: Wrench,
  inspection: ClipboardCheck,
  linen: CalendarClock,
};

const NEXT_STATUS = { open: 'inProgress', inProgress: 'completed', completed: 'open' };

export function HousekeepingPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useApiResource(() => api.housekeeping.list(), []);
  const tasks = useMemo(() => data || [], [data]);

  useEffect(() => {
    setBusyId(null);
  }, [data]);

  const visible = useMemo(
    () =>
      filter === 'mine'
        ? tasks.filter((task) => task.assignee?.name === user?.name)
        : tasks,
    [tasks, filter, user],
  );

  const columns = useMemo(
    () =>
      TASK_STATUSES.map((status) => ({
        status,
        tasks: visible.filter((task) => task.status === status),
      })),
    [visible],
  );

  const openCount = tasks.filter((task) => task.status !== 'completed').length;
  const dueToday = tasks.filter((task) => task.due === todayISO() && task.status !== 'completed').length;

  const move = async (task, status) => {
    setBusyId(task.id);
    try {
      await api.housekeeping.update(task.id, { status });
      toast.success(t('housekeeping.moved', { status: t(`status.${status}`) }));
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('housekeeping.title')}
        subtitle={t('housekeeping.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground numeric">
            <span className="size-1.5 rounded-full bg-status-cleaning" />
            {t('housekeeping.counts', { count: openCount })}
          </span>
        }
        actions={
          <>
            <SegmentedControl>
              {[
                ['all', t('housekeeping.filterAll')],
                ['mine', t('housekeeping.filterMine')],
              ].map(([key, label]) => (
                <SegmentedOption key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </SegmentedOption>
              ))}
            </SegmentedControl>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              {t('housekeeping.newTask')}
            </Button>
          </>
        }
      />

      {dueToday > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-status-reserved/25 bg-status-reserved-soft px-3.5 py-2 text-[12px] font-medium text-status-reserved">
          <CalendarClock className="size-4" />
          {t('housekeeping.dueToday')} · {dueToday}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => (
          <Card key={column.status} className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-[13.5px] font-semibold">
                  {t(`housekeeping.columns.${column.status}`)}
                </h3>
                <span className="rounded bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground numeric">
                  {column.tasks.length}
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 p-3">
              {column.tasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={Brush}
                  title={column.status === 'open' ? t('housekeeping.emptyBoard') : t('housekeeping.empty')}
                  description={column.status === 'open' ? t('housekeeping.emptyBoardBody') : undefined}
                />
              ) : (
                column.tasks.map((task) => {
                  const Icon = TYPE_ICONS[task.type] || Brush;
                  const next = NEXT_STATUS[task.status];
                  return (
                    <div
                      key={task.id}
                      className="rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-border"
                    >
                      <div className="flex items-start gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <Icon className="size-3.5" strokeWidth={1.9} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold leading-snug">{task.title}</p>
                          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                            {t('rooms.room')} {task.roomNumber} · {t(`housekeeping.types.${task.type}`)}
                          </p>
                        </div>
                        <StatusBadge status={task.priority} dot={false} className="shrink-0 px-1.5 text-[10px]" />
                      </div>

                      {task.description ? (
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {task.assignee ? (
                            <>
                              <Avatar className="size-5">
                                <AvatarFallback className="text-[8.5px]">
                                  {initials(task.assignee.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="truncate text-[10.5px] text-muted-foreground">
                                {task.assignee.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10.5px] text-muted-foreground">
                              {t('housekeeping.unassigned')}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 text-[10.5px] font-medium numeric',
                            task.due <= todayISO() && task.status !== 'completed'
                              ? 'text-status-maintenance'
                              : 'text-muted-foreground',
                          )}
                        >
                          {money.date(task.due, { style: 'short' })}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/60 pt-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={busyId === task.id}
                          onClick={() => move(task, next)}
                        >
                          {task.status === 'open' ? <Play className="size-3" /> : null}
                          {task.status === 'inProgress' ? <Check className="size-3" /> : null}
                          {task.status === 'completed' ? <RotateCcw className="size-3" /> : null}
                          {task.status === 'open'
                            ? t('housekeeping.start')
                            : task.status === 'inProgress'
                              ? t('housekeeping.markDone')
                              : t('housekeeping.reopen')}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        ))}
      </div>

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={reload}
      />
    </div>
  );
}
