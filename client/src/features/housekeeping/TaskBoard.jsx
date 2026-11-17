import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Brush } from 'lucide-react';
import { api } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { TASK_STATUSES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { SortableTaskCard, TaskCardOverlay } from './TaskCard';

function TaskColumn({ status, tasks, busyId, onMove }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-[13.5px] font-semibold">
            {t(`housekeeping.columns.${status}`)}
          </h3>
          <span className="rounded bg-muted px-1.5 text-[10.5px] font-semibold text-muted-foreground numeric">
            {tasks.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2.5 p-3 transition-colors',
          isOver && 'bg-muted/40',
        )}
      >
        {tasks.length === 0 ? (
          <EmptyState
            compact
            icon={Brush}
            title={status === 'open' ? t('housekeeping.emptyBoard') : t('housekeeping.empty')}
            description={status === 'open' ? t('housekeeping.emptyBoardBody') : undefined}
          />
        ) : (
          <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                busy={busyId === task.id}
                onMove={onMove}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </Card>
  );
}

function orderedColumns(taskList) {
  return Object.fromEntries(
    TASK_STATUSES.map((status) => [status, taskList.filter((task) => task.status === status)]),
  );
}

function positioned(tasks, status) {
  return tasks.map((task, index) => ({
    ...task,
    ...(status ? { status } : {}),
    position: index,
  }));
}

/** Wrap a status change in the same column order the server expects. */
function boardFromColumns(columns, allTasks) {
  const ordered = TASK_STATUSES.flatMap((status) => columns[status]);
  const used = new Set(ordered.map((task) => task.id));
  return [...ordered, ...allTasks.filter((task) => !used.has(task.id))];
}

export function TaskBoard({ tasks, filter, busyId, onMove, reload }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [localTasks, setLocalTasks] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [activeWidth, setActiveWidth] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // A successful reload replaces the optimistic board with the persisted order.
  useEffect(() => {
    setLocalTasks(null);
  }, [tasks]);

  const board = localTasks ?? tasks;
  const fullColumns = useMemo(() => orderedColumns(board), [board]);
  const visible = useMemo(
    () =>
      filter === 'mine'
        ? board.filter((task) => task.assignee?.name === user?.name)
        : board,
    [board, filter, user],
  );
  const columns = useMemo(() => orderedColumns(visible), [visible]);
  const activeTask = activeId ? board.find((task) => task.id === activeId) : null;

  const handleDragStart = ({ active }) => {
    setActiveId(String(active.id));
    setActiveWidth(active.rect.current.initial?.width ?? null);
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null);
    setActiveWidth(null);

    const task = board.find((entry) => entry.id === String(active.id));
    if (!task || !over) return;

    const overId = String(over.id);
    if (overId === task.id) return;
    const overTask = board.find((entry) => entry.id === overId);
    const targetStatus = TASK_STATUSES.includes(overId) ? overId : overTask?.status;
    if (!targetStatus) return;

    const sourceStatus = task.status;
    const sourceFull = fullColumns[sourceStatus].filter((entry) => entry.id !== task.id);
    const targetFull =
      sourceStatus === targetStatus
        ? sourceFull
        : fullColumns[targetStatus].filter((entry) => entry.id !== task.id);

    let insertAt = targetFull.length;
    if (overTask) {
      const overIndex = targetFull.findIndex((entry) => entry.id === overTask.id);
      if (overIndex !== -1) {
        if (sourceStatus === targetStatus) {
          const sourceIndex = fullColumns[sourceStatus].findIndex((entry) => entry.id === task.id);
          const originalOverIndex = fullColumns[sourceStatus].findIndex(
            (entry) => entry.id === overTask.id,
          );
          insertAt = sourceIndex < originalOverIndex ? overIndex + 1 : overIndex;
        } else {
          insertAt = overIndex;
        }
      }
    }

    const targetOrdered = [...targetFull];
    targetOrdered.splice(insertAt, 0, task);

    const nextColumns = { ...fullColumns };
    nextColumns[targetStatus] = positioned(targetOrdered, targetStatus);
    if (sourceStatus !== targetStatus) {
      nextColumns[sourceStatus] = positioned(sourceFull);
    }

    const nextBoard = boardFromColumns(nextColumns, board);
    const changed = TASK_STATUSES.some(
      (status) =>
        fullColumns[status].map((entry) => entry.id).join('|') !==
        nextColumns[status].map((entry) => entry.id).join('|'),
    );
    if (!changed) return;

    const updateMap = new Map();
    [nextColumns[sourceStatus], nextColumns[targetStatus]].forEach((column) => {
      column.forEach((entry) => {
        updateMap.set(entry.id, { id: entry.id, status: entry.status, position: entry.position });
      });
    });

    setLocalTasks(nextBoard);
    try {
      await api.housekeeping.reorder([...updateMap.values()]);
      if (sourceStatus !== targetStatus) {
        toast.success(
          t('housekeeping.moved', { status: t(`status.${targetStatus}`) }),
        );
      }
      await reload();
    } catch (err) {
      setLocalTasks(null);
      toast.error(err.message || t('errors.body'));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setActiveWidth(null);
      }}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {TASK_STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={columns[status]}
            busyId={busyId}
            onMove={onMove}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? <TaskCardOverlay task={activeTask} width={activeWidth} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
