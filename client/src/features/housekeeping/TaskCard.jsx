import { useTranslation } from 'react-i18next';
import {
  Brush,
  CalendarClock,
  Check,
  ClipboardCheck,
  Play,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMoney } from '@/hooks/useMoney';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/common/StatusBadge';
import { cn } from '@/lib/utils';
import { todayISO } from '@/lib/dates';

const TYPE_ICONS = {
  cleaning: Brush,
  maintenance: Wrench,
  inspection: ClipboardCheck,
  linen: CalendarClock,
};

const NEXT_STATUS = { open: 'inProgress', inProgress: 'completed', completed: 'open' };

function TaskCardView({ task, dragHandleProps, dragging = false, overlay = false, busy = false, onMove }) {
  const { t } = useTranslation();
  const money = useMoney();
  const Icon = TYPE_ICONS[task.type] || Brush;
  const next = NEXT_STATUS[task.status];
  const { attributes, listeners } = dragHandleProps || {};

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-xs transition-colors hover:border-border',
        dragging && 'opacity-40',
        overlay && 'shadow-lg ring-1 ring-primary/20',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          {...(attributes || {})}
          {...(listeners || {})}
          aria-label={t('housekeeping.dragTask')}
          title={t('housekeeping.dragTask')}
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
            !overlay && 'cursor-grab touch-none active:cursor-grabbing',
          )}
        >
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
              <StaffAvatar
                member={task.assignee}
                className="size-5"
                fallbackClassName="text-[8.5px]"
              />
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
          disabled={overlay || busy}
          onClick={onMove ? () => onMove(task, next) : undefined}
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
}

export function SortableTaskCard({ task, onMove, busy }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10')}
    >
      <TaskCardView
        task={task}
        dragHandleProps={{ attributes, listeners }}
        dragging={isDragging}
        busy={busy}
        onMove={onMove}
      />
    </div>
  );
}

export function TaskCardOverlay({ task, width }) {
  return (
    <div style={{ width: width || undefined }} className="pointer-events-none">
      <TaskCardView task={task} overlay />
    </div>
  );
}
