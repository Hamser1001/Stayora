import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
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
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [profileId, setProfileId] = useState(null);

  const { data, loading, error, reload } = useApiResource(() => api.guests.list(), []);
  const guests = useMemo(() => data || [], [data]);

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
  }, [search, filter, pageSize]);

  const counts = useMemo(
    () => ({
      all: guests.length,
      inHouse: guests.filter((guest) => guest.currentStay).length,
      upcoming: guests.filter((guest) => guest.upcomingStay).length,
      balance: guests.filter((guest) => guest.outstanding > 0).length,
    }),
    [guests],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = guests.filter((guest) => {
      if (filter === 'inHouse' && !guest.currentStay) return false;
      if (filter === 'upcoming' && !guest.upcomingStay) return false;
      if (filter === 'balance' && guest.outstanding <= 0) return false;
      if (!term) return true;
      return (
        guest.name.toLowerCase().includes(term) ||
        guest.email.toLowerCase().includes(term) ||
        guest.phone.includes(term)
      );
    });
    const direction = sort.direction === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      if (sort.key === 'totalSpent' || sort.key === 'outstanding' || sort.key === 'stayCount') {
        return (a[sort.key] - b[sort.key]) * direction;
      }
      return String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? '')) * direction;
    });
  }, [guests, search, filter, sort]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const profile = useMemo(() => guests.find((guest) => guest.id === profileId) || null, [guests, profileId]);

  const toggleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  if (loading) return <PageSkeleton />;
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
          <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-card p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                  filter === option
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`guests.filter${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                <span
                  className={cn(
                    'rounded text-[10px] font-semibold numeric',
                    filter === option ? 'text-primary-foreground/80' : 'text-muted-foreground/70',
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
            {t('common.results', { count: filtered.length })}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
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
          {paged.map((guest) => (
            <RecordRow key={guest.id} onClick={() => setProfileId(guest.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-[10.5px]">{initials(guest.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold leading-tight">{guest.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {guest.email || guest.phone || '—'}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold numeric">{money.currency(guest.totalSpent)}</p>
                  <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
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
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </RecordList>

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
              {paged.map((guest) => (
                <TableRow
                  key={guest.id}
                  className="cursor-pointer"
                  onClick={() => setProfileId(guest.id)}
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
            total={filtered.length}
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
          if (!open) setProfileId(null);
        }}
        onEdit={(guest) => {
          setProfileId(null);
          setEditing(guest);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
