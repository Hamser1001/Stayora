import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BedDouble,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  LogIn,
  LogOut,
  List,
  Wallet,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { BOOKING_SOURCES, RESERVATION_STATUSES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SortableHead } from '@/components/common/SortableHead';
import { Pagination } from '@/components/common/Pagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReservationFormDialog } from '@/features/reservations/ReservationFormDialog';
import { ReservationDetailSheet } from '@/features/reservations/ReservationDetailSheet';
import { ReservationCalendar } from '@/features/reservations/ReservationCalendar';
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog';
import { initials, cn } from '@/lib/utils';

const VIEW_KEY = 'stayora.reservations.view';

export function ReservationsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'list');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState({ key: 'arrival', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [focused, setFocused] = useState(null);
  const [paying, setPaying] = useState(null);

  const { data, loading, error, reload } = useApiResource(() => api.reservations.list(), []);
  const reservations = useMemo(() => data || [], [data]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    if (!data) return;
    const newParam = searchParams.get('new');
    const focusParam = searchParams.get('focus');
    const statusParam = searchParams.get('status');
    if (newParam === '1') {
      setEditing(null);
      setFormOpen(true);
      setView('list');
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    if (statusParam) {
      setStatus(statusParam);
      const next = new URLSearchParams(searchParams);
      next.delete('status');
      setSearchParams(next, { replace: true });
    }
    if (focusParam) {
      const found = data.find((item) => item.id === focusParam);
      if (found) setFocused(found);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [data, searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, status, source, pageSize]);

  const summary = useMemo(() => {
    const today = todayISO();
    return {
      arrivals: reservations.filter(
        (r) => r.arrival === today && ['confirmed', 'pending'].includes(r.status),
      ).length,
      departures: reservations.filter((r) => r.departure === today && r.status === 'checkedIn').length,
      inHouse: reservations.filter((r) => r.status === 'checkedIn').length,
      pending: reservations.filter((r) => r.status === 'pending').length,
    };
  }, [reservations]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rank = { checkedIn: 0, confirmed: 1, pending: 2, checkedOut: 3, noShow: 4, cancelled: 5 };
    const rows = reservations.filter((reservation) => {
      if (status !== 'all' && reservation.status !== status) return false;
      if (source !== 'all' && reservation.source !== source) return false;
      if (!term) return true;
      return (
        reservation.reference.toLowerCase().includes(term) ||
        reservation.guestName.toLowerCase().includes(term) ||
        reservation.roomNumber.toLowerCase().includes(term)
      );
    });
    const direction = sort.direction === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === 'status') return ((rank[a.status] ?? 9) - (rank[b.status] ?? 9)) * direction;
      if (sort.key === 'total') return (a.total - b.total) * direction;
      return String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? '')) * direction;
    });
  }, [reservations, search, status, source, sort]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const refreshFocused = async () => {
    await reload();
    const list = await api.reservations.list();
    setFocused((prev) => (prev ? list.find((item) => item.id === prev.id) || null : null));
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('reservations.title')}
        subtitle={t('reservations.subtitle')}
        actions={
          <>
            <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn(
                  'grid size-8 place-items-center rounded-md transition-colors',
                  view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('reservations.list')}
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('calendar')}
                className={cn(
                  'grid size-8 place-items-center rounded-md transition-colors',
                  view === 'calendar'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                aria-label={t('reservations.calendar.title')}
              >
                <CalendarDays className="size-3.5" />
              </button>
            </div>
            <Button size="sm" onClick={openCreate}>
              <CalendarPlus className="size-4" />
              {t('reservations.new')}
            </Button>
          </>
        }
      />

      <Card className="grid grid-cols-2 divide-y divide-border/70 sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
        {[
          { label: t('reservations.summary.arrivalsToday'), value: summary.arrivals, icon: LogIn, tone: 'text-status-available' },
          { label: t('reservations.summary.departuresToday'), value: summary.departures, icon: LogOut, tone: 'text-status-cleaning' },
          { label: t('reservations.summary.inHouse'), value: summary.inHouse, icon: BedDouble, tone: 'text-status-occupied' },
          { label: t('reservations.summary.pending'), value: summary.pending, icon: Wallet, tone: 'text-status-reserved' },
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

      {view === 'calendar' ? (
        <ReservationCalendar onSelect={setFocused} />
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('reservations.searchPlaceholder')}
                className="w-full sm:w-[270px]"
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reservations.allStatuses')}</SelectItem>
                  {RESERVATION_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`status.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('reservations.allSources')}</SelectItem>
                  {BOOKING_SOURCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`reservations.sourceLabels.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {search || status !== 'all' || source !== 'all' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setSource('all');
                  }}
                >
                  {t('common.reset')}
                </Button>
              ) : null}
            </div>
            <p className="text-[11.5px] text-muted-foreground numeric">
              {t('common.results', { count: filtered.length })}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t('reservations.empty')}
              description={t('reservations.emptyBody')}
              action={
                <Button size="sm" onClick={openCreate}>
                  <CalendarPlus className="size-4" />
                  {t('reservations.new')}
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label={t('reservations.reference')}
                      sortKey="reference"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead label={t('reservations.guest')} sortKey="guestName" sort={sort} onSort={toggleSort} />
                    <TableHead>{t('rooms.room')}</TableHead>
                    <SortableHead
                      label={t('reservations.arrival')}
                      sortKey="arrival"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label={t('reservations.departure')}
                      sortKey="departure"
                      sort={sort}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label={t('reservations.total')}
                      sortKey="total"
                      sort={sort}
                      onSort={toggleSort}
                      align="right"
                    />
                    <TableHead>{t('reservations.payment')}</TableHead>
                    <SortableHead label={t('common.status')} sortKey="status" sort={sort} onSort={toggleSort} />
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((reservation) => (
                    <TableRow
                      key={reservation.id}
                      className="cursor-pointer"
                      onClick={() => setFocused(reservation)}
                    >
                      <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                        {reservation.reference}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-7">
                            <AvatarFallback className="text-[9.5px]">
                              {initials(reservation.guestName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{reservation.guestName}</p>
                            <p className="truncate text-[10.5px] text-muted-foreground">
                              {t('units.guest', { count: reservation.guests })} ·{' '}
                              {t(`reservations.sourceLabels.${reservation.source}`, {
                                defaultValue: reservation.source,
                              })}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                        {t('rooms.room')} {reservation.roomNumber} ·{' '}
                        {t('rooms.bedLabel', { number: reservation.bed?.number })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {money.date(reservation.arrival, { style: 'short' })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {money.date(reservation.departure, { style: 'short' })}
                      </TableCell>
                      <TableCell className="text-right font-semibold numeric">
                        {money.currency(reservation.total)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={reservation.paymentStatus} dot={false} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={reservation.status} />
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-muted-foreground/50" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </Card>
          )}
        </>
      )}

      <ReservationFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        reservation={editing}
        onSaved={reload}
      />

      <ReservationDetailSheet
        reservation={focused}
        onOpenChange={(open) => {
          if (!open) setFocused(null);
        }}
        onUpdated={refreshFocused}
        onEdit={(reservation) => {
          setFocused(null);
          setEditing(reservation);
          setFormOpen(true);
        }}
        onRecordPayment={(reservation) => setPaying(reservation)}
      />

      <RecordPaymentDialog
        open={Boolean(paying)}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
        reservation={paying}
        onSaved={async () => {
          await reload();
          setPaying(null);
        }}
      />
    </div>
  );
}
