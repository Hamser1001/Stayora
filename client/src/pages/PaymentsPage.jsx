import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, Clock, CreditCard, Landmark, ReceiptText, RotateCcw, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { PAYMENT_METHODS } from '@/lib/constants';
import { buildDateRange } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DateRangeFilter } from '@/components/common/DateRangeFilter';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState } from '@/components/common/EmptyState';
import { RecordList, RecordRow } from '@/components/common/RecordList';
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
import { RecordPaymentDialog } from '@/features/payments/RecordPaymentDialog';
import { RefundDialog } from '@/features/payments/RefundDialog';

const METHOD_ICONS = {
  cash: Banknote,
  card: CreditCard,
  transfer: Landmark,
  online: Wallet,
  other: ReceiptText,
};

export function PaymentsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [range, setRange] = useState(() => ({ preset: 'month', ...buildDateRange('month') }));
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('all');
  const [recordOpen, setRecordOpen] = useState(false);
  const [refunding, setRefunding] = useState(null);

  const { data, loading, error, reload } = useApiResource(
    async () => {
      const [payments, summary] = await Promise.all([
        api.payments.list({}),
        api.payments.summary({ start: range.start, end: range.end }),
      ]);
      return { payments, summary };
    },
    [range.start, range.end],
  );

  const payments = useMemo(() => data?.payments || [], [data]);

  useEffect(() => {
    setSearch('');
    setMethod('all');
  }, [range.start, range.end]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (method !== 'all' && payment.method !== method) return false;
      if (!term) return true;
      return (
        payment.guestName.toLowerCase().includes(term) ||
        payment.reference.toLowerCase().includes(term) ||
        payment.reservationReference.toLowerCase().includes(term)
      );
    });
  }, [payments, search, method]);

  const inRange = useMemo(
    () => filtered.filter((payment) => payment.date >= range.start && payment.date <= range.end),
    [filtered, range.start, range.end],
  );

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const summary = data.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('payments.title')}
        subtitle={t('payments.subtitle')}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} presets={['today', 'week', 'month', 'custom']} />
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <CreditCard className="size-4" />
              {t('payments.record')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('payments.summaryCollected')}
          value={money.currency(summary.collected)}
          icon={TrendingUp}
          tone="success"
          hint={t('common.results', { count: summary.count })}
        />
        <StatCard
          label={t('payments.summaryRefunds')}
          value={money.currency(summary.refunds)}
          icon={RotateCcw}
          tone="gold"
          hint={money.currency(summary.net)}
        />
        <StatCard
          label={t('payments.outstanding')}
          value={money.currency(summary.outstanding)}
          icon={Wallet}
          tone="danger"
        />
        <StatCard
          label={t('payments.pendingToday')}
          value={money.currency(summary.dueToday)}
          icon={Clock}
          tone="info"
          hint={`${t('payments.avgPayment')} · ${money.currency(summary.avg, { maximumFractionDigits: 2 })}`}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('payments.searchPlaceholder')}
            className="w-full sm:w-[280px]"
          />
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('payments.allMethods')}</SelectItem>
              {PAYMENT_METHODS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`payments.methods.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11.5px] text-muted-foreground numeric">
          {t('common.results', { count: inRange.length })}
        </p>
      </div>

      {inRange.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={t('payments.empty')}
          description={t('payments.emptyBody')}
          action={
            <Button size="sm" onClick={() => setRecordOpen(true)}>
              <CreditCard className="size-4" />
              {t('payments.record')}
            </Button>
          }
        />
      ) : (
        <>
        <RecordList>
          {inRange.map((payment) => {
            const Icon = METHOD_ICONS[payment.method] || Wallet;
            const isRefund = payment.type === 'refund';
            return (
              <RecordRow key={payment.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'grid size-9 shrink-0 place-items-center rounded-lg',
                        isRefund
                          ? 'bg-status-maintenance-soft text-status-maintenance'
                          : 'bg-status-available-soft text-status-available',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight">
                        {payment.guestName}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {money.date(payment.date, { style: 'short' })} ·{' '}
                        {t(`payments.methods.${payment.method}`)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-[13px] font-semibold numeric',
                        isRefund ? 'text-status-maintenance' : 'text-status-available',
                      )}
                    >
                      {isRefund ? '−' : ''}
                      {money.currency(payment.amount)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {payment.reference}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        isRefund
                          ? 'bg-status-maintenance-soft text-status-maintenance'
                          : 'bg-status-available-soft text-status-available',
                      )}
                    >
                      {t(`payments.types.${payment.type}`)}
                    </span>
                    <span className="truncate">
                      {payment.reservationReference} · {t('rooms.room')} {payment.roomNumber}
                    </span>
                  </p>
                  {!isRefund ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('payments.refund')}
                      onClick={() => setRefunding(payment)}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              </RecordRow>
            );
          })}
        </RecordList>

        <Card className="hidden overflow-hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('payments.date')}</TableHead>
                <TableHead>{t('payments.receivedFrom')}</TableHead>
                <TableHead>{t('payments.reservation')}</TableHead>
                <TableHead>{t('payments.type')}</TableHead>
                <TableHead>{t('payments.method')}</TableHead>
                <TableHead>{t('payments.reference')}</TableHead>
                <TableHead className="text-right">{t('payments.amount')}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {inRange.map((payment) => {
                const Icon = METHOD_ICONS[payment.method] || Wallet;
                const isRefund = payment.type === 'refund';
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                      {money.date(payment.date, { style: 'short' })}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{payment.guestName}</p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {t('rooms.room')} {payment.roomNumber}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-muted-foreground">
                      {payment.reservationReference}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                          isRefund
                            ? 'bg-status-maintenance-soft text-status-maintenance'
                            : 'bg-status-available-soft text-status-available',
                        )}
                      >
                        {t(`payments.types.${payment.type}`)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Icon className="size-3.5" />
                        {t(`payments.methods.${payment.method}`)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {payment.reference}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold numeric',
                        isRefund ? 'text-status-maintenance' : 'text-status-available',
                      )}
                    >
                      {isRefund ? '−' : ''}
                      {money.currency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      {!isRefund ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('payments.refund')}
                          onClick={() => setRefunding(payment)}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        </>
      )}

      <RecordPaymentDialog open={recordOpen} onOpenChange={setRecordOpen} onSaved={reload} />

      <RefundDialog
        open={Boolean(refunding)}
        onOpenChange={(open) => {
          if (!open) setRefunding(null);
        }}
        payment={refunding}
        onSaved={async () => {
          setRefunding(null);
          await reload();
        }}
      />
    </div>
  );
}
