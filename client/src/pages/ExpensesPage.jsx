import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { Banknote, PieChart as PieIcon, Plus, ReceiptText, Tag, Trash2 } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { EXPENSE_CATEGORIES, CHART_COLORS } from '@/lib/constants';
import { buildDateRange } from '@/lib/dates';
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
import { ChartCard, ChartTooltip } from '@/components/charts/ChartKit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExpenseFormDialog } from '@/features/expenses/ExpenseFormDialog';

export function ExpensesPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [range, setRange] = useState(() => ({ preset: 'month', ...buildDateRange('month') }));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, error, reload } = useApiResource(
    async () => {
      const [expenses, summary] = await Promise.all([
        api.expenses.list({}),
        api.expenses.summary({ start: range.start, end: range.end }),
      ]);
      return { expenses, summary };
    },
    [range.start, range.end],
  );

  const expenses = useMemo(() => data?.expenses || [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter((expense) => {
      if (category !== 'all' && expense.category !== category) return false;
      if (expense.date < range.start || expense.date > range.end) return false;
      if (!term) return true;
      return (
        expense.vendor.toLowerCase().includes(term) ||
        t(`expenses.categories.${expense.category}`).toLowerCase().includes(term)
      );
    });
  }, [expenses, search, category, range.start, range.end, t]);

  const handleDelete = async (expense) => {
    try {
      await api.expenses.remove(expense.id);
      toast.success(t('common.success'));
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const summary = data.summary;
  const breakdown = summary.byCategory;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('expenses.title')}
        subtitle={t('expenses.subtitle')}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} presets={['month', 'quarter', 'year', 'custom']} />
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              {t('expenses.add')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('expenses.total')}
          value={money.currency(summary.total)}
          icon={ReceiptText}
          tone="danger"
          hint={t('expenses.count', { count: summary.count })}
        />
        <StatCard
          label={t('expenses.avg')}
          value={money.currency(summary.avg)}
          icon={Banknote}
          tone="gold"
        />
        <StatCard
          label={t('expenses.largest')}
          value={summary.largest ? money.currency(summary.largest.amount) : '—'}
          icon={Tag}
          tone="info"
          hint={
            summary.largest ? t(`expenses.categories.${summary.largest.category}`) : undefined
          }
        />
        <StatCard
          label={t('expenses.thisMonth')}
          value={money.currency(
            expenses
              .filter((expense) => expense.date >= buildDateRange('month').start)
              .reduce((sum, expense) => sum + expense.amount, 0),
          )}
          icon={PieIcon}
          tone="primary"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <ChartCard
          title={t('expenses.byCategory')}
          description={t('expenses.subtitle')}
        >
          {breakdown.length === 0 ? (
            <EmptyState compact icon={PieIcon} title={t('expenses.empty')} description={t('expenses.emptyBody')} />
          ) : (
            <>
              <div className="h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={2.5}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    >
                      {breakdown.map((entry, index) => (
                        <Cell key={entry.category} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltip
                          labelFormatter={(value) => t(`expenses.categories.${value}`, { defaultValue: value })}
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 px-3 pb-2">
                {breakdown.slice(0, 6).map((entry, index) => (
                  <div key={entry.category} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span
                        className="size-2 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{t(`expenses.categories.${entry.category}`)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-[11.5px] font-semibold numeric">
                        {money.currency(entry.amount)}
                      </span>
                      <span className="w-9 text-right text-[10.5px] text-muted-foreground numeric">
                        {money.percent(entry.share)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('expenses.searchPlaceholder')}
              className="w-full sm:w-[260px]"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('expenses.allCategories')}</SelectItem>
                {EXPENSE_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`expenses.categories.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-[11.5px] text-muted-foreground numeric">
              {t('common.results', { count: filtered.length })}
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title={t('expenses.empty')}
              description={t('expenses.emptyBody')}
              action={
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus className="size-4" />
                  {t('expenses.add')}
                </Button>
              }
            />
          ) : (
            <>
            <RecordList>
              {filtered.map((expense) => (
                <RecordRow key={expense.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight">{expense.vendor}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {money.date(expense.date, { style: 'short' })} ·{' '}
                        {t(`payments.methods.${expense.method}`)}
                        {expense.receipt ? ` · ${expense.receipt}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <span className="text-[13px] font-semibold numeric">
                        {money.currency(expense.amount)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        aria-label={t('common.delete')}
                        onClick={() => handleDelete(expense)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                    {t(`expenses.categories.${expense.category}`)}
                  </span>
                </RecordRow>
              ))}
            </RecordList>

            <Card className="hidden overflow-hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('expenses.date')}</TableHead>
                    <TableHead>{t('expenses.vendor')}</TableHead>
                    <TableHead>{t('expenses.category')}</TableHead>
                    <TableHead>{t('expenses.method')}</TableHead>
                    <TableHead className="text-right">{t('expenses.amount')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                        {money.date(expense.date, { style: 'short' })}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{expense.vendor}</p>
                        {expense.receipt ? (
                          <p className="font-mono text-[10.5px] text-muted-foreground">{expense.receipt}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                          {t(`expenses.categories.${expense.category}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">
                        {t(`payments.methods.${expense.method}`)}
                      </TableCell>
                      <TableCell className="text-right font-semibold numeric">
                        {money.currency(expense.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          aria-label={t('common.delete')}
                          onClick={() => handleDelete(expense)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            </>
          )}
        </div>
      </div>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={reload}
        defaultCategory={category === 'all' ? undefined : category}
      />
    </div>
  );
}
