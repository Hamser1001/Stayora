import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { SearchInput } from '@/components/common/SearchInput';
import { SortableHead } from '@/components/common/SortableHead';
import { Pagination } from '@/components/common/Pagination';
import { RecordList, RecordRow } from '@/components/common/RecordList';
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
import { GuestFormDialog } from '@/features/guests/GuestFormDialog';
import { GuestProfileSheet } from '@/features/guests/GuestProfileSheet';

const FILTERS = ['all', 'inHouse', 'upcoming', 'balance'];

export function GuestsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profile, setProfile] = useState(null);

  // Filters, sorting and paging all run in MongoDB; only one page is rendered.
  const { data, loading, error, reload } = useApiResource(
    () =>
      api.guests.listPage({
        page,
        pageSize,
        search: debouncedSearch,
        filter,
        sort: sort.key,
        direction: sort.direction,
      }),
    [page, pageSize, debouncedSearch, filter, sort.key, sort.direction],
  );
  const guests = useMemo(() => data?.data || [], [data]);
  const total = data?.meta?.total ?? 0;
  const counts = data?.meta?.counts || { all: 0, inHouse: 0, upcoming: 0, balance: 0 };

  useEffect(() => {
    if (!data) return;
    if (searchParams.get('new') !== '1') return;
    setEditing(null);
    setFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [data, searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filter, pageSize]);

  useEffect(() => {
    const pages = data?.meta?.pages;
    if (pages && page > pages) setPage(pages);
  }, [data?.meta?.pages, page]);

  const openProfile = async (guest) => {
    setProfile(guest);
    const full = await api.guests.get(guest.id).catch(() => null);
    if (full) setProfile(full);
  };

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  if (loading && !data) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('guests.title')}
        subtitle={t('guests.subtitle')}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserPlus className="size-4" />
            {t('guests.add')}
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('guests.searchPlaceholder')}
            className="w-full sm:w-[280px]"
          />
          <div className="grid w-full grid-cols-2 gap-1.5 sm:inline-flex sm:w-auto sm:gap-0.5 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  'inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-[11.5px] font-medium transition-colors sm:justify-start sm:rounded-md sm:border-0 sm:px-2.5 sm:py-1.5',
                  filter === option
                    ? 'border-primary/25 bg-primary-soft text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground sm:border-0 sm:bg-transparent',
                )}
              >
                {t(`guests.filter${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                <span
                  className={cn(
                    'rounded text-[10px] font-semibold numeric',
                    filter === option ? 'text-primary/80' : 'text-muted-foreground/70',
                  )}
                >
                  {counts[option]}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={sort.key}
            onValueChange={(key) =>
              setSort((prev) => (prev.key === key ? prev : { key, direction: 'asc' }))
            }
          >
            <SelectTrigger className="w-full sm:w-[170px] lg:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ['name', t('guests.guest')],
                ['stayCount', t('guests.stays')],
                ['totalSpent', t('guests.totalSpent')],
                ['outstanding', t('guests.outstanding')],
              ].map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {t('common.sortBy')} · {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="shrink-0 text-[11.5px] text-muted-foreground numeric">
            {t('common.results', { count: total })}
          </p>
        </div>
      </div>

      {guests.length === 0 ? (
        <EmptyState
          icon={search ? Search : Users}
          title={t('guests.empty')}
          description={t('guests.emptyBody')}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
            >
              {t('common.reset')}
            </Button>
          }
        />
      ) : (
        <>
        <RecordList>
          {guests.map((guest) => (
            <RecordRow key={guest.id} onClick={() => openProfile(guest)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-[10.5px]">{initials(guest.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-tight">{guest.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {guest.email || guest.phone || '—'}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 pl-3 text-right">
                  <p className="text-[13px] font-semibold leading-none numeric">
                    {money.currency(guest.totalSpent)}
                  </p>
                  <p className="mt-1 whitespace-nowrap text-[9.5px] uppercase leading-none tracking-[0.06em] text-muted-foreground">
                    {t('guests.totalSpent')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>{guest.nationality || '—'}</span>
                <span className="text-border">·</span>
                <span className="numeric">{t('units.stay', { count: guest.stayCount })}</span>
                {guest.lastStay ? (
                  <>
                    <span className="text-border">·</span>
                    <span className="numeric">
                      {t('guests.lastStay')} {money.date(guest.lastStay.departure, { style: 'short' })}
                    </span>
                  </>
                ) : null}
                {guest.currentStay ? (
                  <span className="rounded-full bg-status-occupied-soft px-2 py-0.5 text-[10px] font-semibold text-status-occupied">
                    {t('guests.currentStay')}
                  </span>
                ) : null}
                {guest.outstanding > 0 ? (
                  <span className="ml-auto rounded-full bg-status-maintenance-soft px-2 py-0.5 text-[10.5px] font-semibold text-status-maintenance numeric">
                    {money.currency(guest.outstanding)} {t('guests.outstanding').toLowerCase()}
                  </span>
                ) : null}
              </div>
            </RecordRow>
          ))}
        </RecordList>

        <Card className="overflow-hidden lg:hidden">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            className="border-t-0"
          />
        </Card>

        <Card className="hidden overflow-hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label={t('guests.guest')} sortKey="name" sort={sort} onSort={toggleSort} />
                <TableHead>{t('guests.contact')}</TableHead>
                <TableHead>{t('guests.nationality')}</TableHead>
                <SortableHead
                  label={t('guests.stays')}
                  sortKey="stayCount"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableHead
                  label={t('guests.totalSpent')}
                  sortKey="totalSpent"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
                <SortableHead
                  label={t('guests.outstanding')}
                  sortKey="outstanding"
                  sort={sort}
                  onSort={toggleSort}
                  align="right"
                />
                <TableHead>{t('guests.lastStay')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map((guest) => (
                <TableRow
                  key={guest.id}
                  className="cursor-pointer"
                  onClick={() => openProfile(guest)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-[10px]">{initials(guest.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{guest.name}</p>
                        {guest.currentStay ? (
                          <p className="truncate text-[10.5px] font-medium text-status-occupied">
                            {t('guests.currentStay')}
                          </p>
                        ) : guest.upcomingStay ? (
                          <p className="truncate text-[10.5px] text-muted-foreground">
                            {t('guests.upcoming')} ·{' '}
                            {money.date(guest.upcomingStay.arrival, { style: 'short' })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-[12px]">{guest.email || '—'}</p>
                    <p className="text-[10.5px] text-muted-foreground">{guest.phone || '—'}</p>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {guest.nationality || '—'}
                  </TableCell>
                  <TableCell className="text-right numeric">{guest.stayCount}</TableCell>
                  <TableCell className="text-right font-semibold numeric">
                    {money.currency(guest.totalSpent)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right numeric',
                      guest.outstanding > 0 ? 'font-semibold text-status-maintenance' : 'text-muted-foreground',
                    )}
                  >
                    {guest.outstanding > 0 ? money.currency(guest.outstanding) : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                    {guest.lastStay ? money.date(guest.lastStay.departure, { style: 'short' }) : '—'}
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
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </Card>
        </>
      )}

      <GuestFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        guest={editing}
        onSaved={reload}
      />

      <GuestProfileSheet
        guest={profile}
        onOpenChange={(open) => {
          if (!open) setProfile(null);
        }}
        onEdit={(guest) => {
          setProfile(null);
          setEditing(guest);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
