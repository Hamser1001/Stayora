import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BedDouble,
  Brush,
  CheckCircle2,
  DoorOpen,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { RoomCard } from '@/features/rooms/RoomCard';
import { RoomFormDialog } from '@/features/rooms/RoomFormDialog';
import { BedDetailsDialog } from '@/features/rooms/BedDetailsDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageSkeleton } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ROOM_TYPES } from '@/lib/constants';
import { BED_STATUS_DOT } from '@/lib/constants';
import { cn } from '@/lib/utils';

const VIEW_KEY = 'stayora.rooms.view';

export function RoomsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [floor, setFloor] = useState('all');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'grid');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [highlight, setHighlight] = useState(null);

  const { data, loading, error, reload } = useApiResource(() => api.rooms.list(), []);
  const rooms = useMemo(() => data || [], [data]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    if (!data) return;
    const newParam = searchParams.get('new');
    const roomParam = searchParams.get('room');
    if (newParam === '1') {
      setEditing(null);
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    if (roomParam) {
      setHighlight(roomParam);
      const found = data.find((room) => room.id === roomParam);
      if (found) setSearch(found.number);
      const next = new URLSearchParams(searchParams);
      next.delete('room');
      setSearchParams(next, { replace: true });
      const timer = setTimeout(() => setHighlight(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [data, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (type !== 'all' && room.type !== type) return false;
      if (floor !== 'all' && String(room.floor) !== String(floor)) return false;
      if (status !== 'all' && !room.beds.some((bed) => bed.status === status)) return false;
      if (!term) return true;
      return (
        room.number.toLowerCase().includes(term) ||
        t(`rooms.type.${room.type}`).toLowerCase().includes(term)
      );
    });
  }, [rooms, type, floor, status, search, t]);

  const summary = useMemo(() => {
    const totalBeds = rooms.reduce((sum, room) => sum + room.totalBeds, 0);
    const available = rooms.reduce((sum, room) => sum + room.availableBeds, 0);
    const occupied = rooms.reduce((sum, room) => sum + room.occupiedBeds, 0);
    const attention = rooms.reduce((sum, room) => sum + room.needsAttention, 0);
    return { totalRooms: rooms.length, totalBeds, available, occupied, attention };
  }, [rooms]);

  const floors = useMemo(
    () => [...new Set(rooms.map((room) => room.floor))].sort((a, b) => a - b),
    [rooms],
  );

  const hasFilters = Boolean(search) || type !== 'all' || floor !== 'all' || status !== 'all';

  const resetFilters = () => {
    setSearch('');
    setType('all');
    setFloor('all');
    setStatus('all');
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      await api.rooms.remove(deleting.id);
      toast.success(t('rooms.deleted', { room: deleting.number }));
      setDeleting(null);
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('rooms.title')}
        subtitle={t('rooms.subtitle')}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                className={cn(
                  'grid size-8 place-items-center rounded-md transition-colors',
                  view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('rooms.gridView')}
              >
                <Grid2X2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'grid size-8 place-items-center rounded-md transition-colors',
                  view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('rooms.listView')}
              >
                <List className="size-3.5" />
              </button>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {t('rooms.addRoom')}
            </Button>
          </>
        }
      />

      <Card className="grid grid-cols-2 divide-y divide-border/70 sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        {[
          { label: t('rooms.summary.totalRooms'), value: summary.totalRooms, icon: DoorOpen },
          { label: t('rooms.summary.totalBeds'), value: summary.totalBeds, icon: BedDouble },
          {
            label: t('rooms.summary.available'),
            value: summary.available,
            icon: CheckCircle2,
            tone: 'text-status-available',
          },
          {
            label: t('rooms.summary.attention'),
            value: summary.attention,
            icon: Sparkles,
            tone: 'text-status-cleaning',
          },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-5 py-4">
            <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
              <item.icon className="size-4" strokeWidth={1.9} />
            </span>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </p>
              <p className={cn('mt-0.5 font-display text-[20px] font-bold leading-none numeric', item.tone)}>
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('rooms.searchPlaceholder')}
            className="w-full sm:w-[250px]"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rooms.allTypes')}</SelectItem>
              {ROOM_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`rooms.type.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={floor} onValueChange={setFloor}>
            <SelectTrigger className="w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rooms.allFloors')}</SelectItem>
              {floors.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {t('rooms.floorValue', { floor: option })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rooms.allStatuses')}</SelectItem>
              {['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`status.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              {t('common.reset')}
            </Button>
          ) : null}
        </div>

        <div className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 xl:flex">
          {['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map((option) => (
            <span key={option} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', BED_STATUS_DOT[option])} />
              {t(`rooms.legend.${option}`)}
            </span>
          ))}
        </div>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title={t('rooms.emptyProperty')}
          description={t('rooms.emptyPropertyBody')}
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" />
              {t('rooms.addRoom')}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Brush}
          title={t('rooms.empty')}
          description={t('rooms.emptyBody')}
          action={
            <Button variant="outline" size="sm" onClick={resetFilters}>
              {t('common.reset')}
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              highlighted={highlight === room.id}
              onEdit={(target) => {
                setEditing(target);
                setFormOpen(true);
              }}
              onDelete={setDeleting}
              onSelectBed={setSelectedBed}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('rooms.room')}</TableHead>
                <TableHead>{t('rooms.roomType')}</TableHead>
                <TableHead>{t('rooms.floor')}</TableHead>
                <TableHead>{t('rooms.beds')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('rooms.todayRate')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((room) => (
                <TableRow
                  key={room.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setEditing(room);
                    setFormOpen(true);
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-md bg-primary-soft text-[12px] font-bold text-primary numeric">
                        {room.number}
                      </span>
                      <span className="font-medium">{t(`rooms.type.${room.type}`)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {room.audience !== 'mixed' ? t(`rooms.audience.${room.audience}`) : t('rooms.room')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t('rooms.floorValue', { floor: room.floor })}
                  </TableCell>
                  <TableCell className="numeric">{room.totalBeds}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {room.availableBeds > 0 ? (
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          {room.availableBeds} {t('status.available').toLowerCase()}
                        </Badge>
                      ) : null}
                      {room.occupiedBeds > 0 ? (
                        <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                          {room.occupiedBeds} {t('status.occupied').toLowerCase()}
                        </Badge>
                      ) : null}
                      {room.cleaningBeds > 0 ? (
                        <Badge variant="violet" className="px-1.5 py-0 text-[10px]">
                          {room.cleaningBeds} {t('status.cleaning').toLowerCase()}
                        </Badge>
                      ) : null}
                      {room.maintenanceBeds > 0 ? (
                        <Badge variant="danger" className="px-1.5 py-0 text-[10px]">
                          {room.maintenanceBeds} {t('status.maintenance').toLowerCase()}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold numeric">
                    {money.currency(room.pricePerBed)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(room);
                          setFormOpen(true);
                        }}
                        aria-label={t('rooms.editRoom')}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleting(room);
                        }}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <RoomFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        room={editing}
        onSaved={reload}
      />

      <BedDetailsDialog
        selection={selectedBed}
        onOpenChange={(open) => {
          if (!open) setSelectedBed(null);
        }}
        onUpdated={reload}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={deleting ? t('rooms.deleteTitle', { room: deleting.number }) : ''}
        description={
          deleting ? t('rooms.deleteBody', { count: deleting.totalBeds || deleting.bedCount }) : ''
        }
        confirmLabel={t('common.confirmDelete')}
        destructive
        loading={deleteBusy}
        onConfirm={handleDelete}
      >
        {deleting?.beds?.some((bed) => ['occupied', 'reserved'].includes(bed.status)) ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive-soft px-3 py-2 text-[11.5px] font-medium text-destructive">
            {t('rooms.deleteBlocked')}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
