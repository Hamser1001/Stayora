import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarClock, Plus } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { todayISO } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { SegmentedControl, SegmentedOption } from '@/components/ui/segmented';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import { TaskFormDialog } from '@/features/housekeeping/TaskFormDialog';
import { TaskBoard } from '@/features/housekeeping/TaskBoard';

export function HousekeepingPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useApiResource(() => api.housekeeping.list(), []);
  const tasks = useMemo(() => data || [], [data]);

  useEffect(() => {
    setBusyId(null);
  }, [data]);

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

      <TaskBoard
        tasks={tasks}
        filter={filter}
        busyId={busyId}
        onMove={move}
        reload={reload}
      />

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={reload}
      />
    </div>
  );
}
