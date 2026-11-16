import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BedDouble,
  CalendarRange,
  Download,
  Gauge,
  Lightbulb,
  Percent,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { CHART_COLORS } from '@/lib/constants';
import { buildDateRange } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DateRangeFilter } from '@/components/common/DateRangeFilter';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import { Card } from '@/components/ui/card';
import { ChartCard, ChartTooltip, AXIS_STYLE, GRID_STROKE } from '@/components/charts/ChartKit';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { t } = useTranslation();
  const money = useMoney();
  const [range, setRange] = useState(() => ({ preset: 'quarter', ...buildDateRange('quarter') }));

  const { data, loading, error, reload } = useApiResource(
    () => api.reports.get({ start: range.start, end: range.end }),
    [range.start, range.end],
  );

  const monthly = useMemo(() => data?.monthly || [], [data]);
  const types = useMemo(() => data?.types || [], [data]);
  const expenses = useMemo(() => data?.expenses || [], [data]);

  const exportReport = () => {
    const rows = [
      ['Stayora report', `${range.start} → ${range.end}`],
      [],
      ['Metric', 'Value'],
      [t('reports.metrics.occupancy'), `${data.metrics.occupancy.toFixed(1)}%`],
      [t('reports.metrics.revenue'), data.metrics.revenue],
      [t('reports.metrics.expenses'), data.metrics.expenses],
      [t('reports.metrics.netProfit'), data.metrics.netProfit],
      [t('reports.metrics.adr'), data.metrics.adr.toFixed(2)],
      [t('reports.metrics.revpar'), data.metrics.revpar.toFixed(2)],
      [],
      [t('reports.table.roomType'), t('reports.table.beds'), t('reports.table.occupancy'), t('reports.table.revenue')],
      ...types.map((type) => [
        t(`rooms.type.${type.type}`),
        type.beds,
        `${type.occupancy.toFixed(1)}%`,
        type.revenue,
      ]),
      [],
      [t('expenses.category'), t('expenses.amount')],
      ...expenses.map((entry) => [t(`expenses.categories.${entry.category}`), entry.amount]),
    ];
    downloadCsv(`stayora-report-${range.start}-${range.end}.csv`, rows);
    toast.success(t('reports.exported'));
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const { metrics, deltas, insight } = data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            <DateRangeFilter
              value={range}
              onChange={setRange}
              presets={['month', 'quarter', 'year', 'custom']}
            />
            <Button variant="outline" size="sm" onClick={exportReport}>
              <Download className="size-4" />
              {t('reports.exportCsv')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('reports.metrics.occupancy')}
          value={money.percent(metrics.occupancy)}
          icon={Gauge}
          tone="primary"
          delta={deltas.occupancy}
          hint={t('reports.comparedTo', { days: metrics.days })}
        />
        <StatCard
          label={t('reports.metrics.revenue')}
          value={money.currency(metrics.revenue)}
          icon={TrendingUp}
          tone="success"
          delta={deltas.revenue}
          hint={t('reports.comparedTo', { days: metrics.days })}
        />
        <StatCard
          label={t('reports.metrics.expenses')}
          value={money.currency(metrics.expenses)}
          icon={Wallet}
          tone="danger"
          delta={deltas.expenses}
          invertDelta
          hint={t('reports.comparedTo', { days: metrics.days })}
        />
        <StatCard
          label={t('reports.metrics.netProfit')}
          value={money.currency(metrics.netProfit)}
          icon={Percent}
          tone="gold"
          delta={deltas.netProfit}
          hint={t('reports.comparedTo', { days: metrics.days })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t('reports.metrics.adr'), value: money.currency(metrics.adr), delta: deltas.adr },
          { label: t('reports.metrics.revpar'), value: money.currency(metrics.revpar), delta: deltas.revpar },
          {
            label: t('reports.metrics.avgStay'),
            value: t('units.night', { count: Math.round(metrics.avgStay * 10) / 10 }),
            delta: deltas.avgStay,
          },
          {
            label: t('reports.metrics.cancellation'),
            value: money.percent(metrics.cancellationRate),
            delta: deltas.cancellationRate,
          },
        ].map((item) => (
          <Card key={item.label} className="px-4 py-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 font-display text-[19px] font-bold leading-none numeric">{item.value}</p>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground numeric">
              {item.delta > 0 ? '+' : ''}
              {Math.round(item.delta * 10) / 10}% {t('reports.comparedTo', { days: metrics.days })}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title={t('reports.charts.revenueTrend')}
          description={t('reports.charts.revenueTrendBody')}
          action={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-[3px] bg-chart-1" />
                {t('reports.charts.revenue')}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-[3px] bg-chart-2" />
                {t('reports.charts.expenses')}
              </span>
            </div>
          }
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 8, right: 16, left: 4, bottom: 4 }} barCategoryGap="26%">
                <CartesianGrid strokeDasharray="3 6" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  tickFormatter={(value) => money.month(new Date(value))}
                />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_STYLE} width={44} tickFormatter={money.number} />
                <Tooltip
                  content={<ChartTooltip labelFormatter={(value) => money.month(new Date(value))} />}
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                />
                <Bar dataKey="revenue" name={t('reports.charts.revenue')} fill="hsl(var(--chart-1))" radius={[4, 4, 2, 2]} maxBarSize={18} />
                <Bar dataKey="expenses" name={t('reports.charts.expenses')} fill="hsl(var(--chart-2))" radius={[4, 4, 2, 2]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          title={t('reports.charts.roomPerformance')}
          description={t('reports.charts.roomPerformanceBody')}
        >
          {types.length === 0 ? (
            <p className="grid h-[260px] place-items-center text-[12px] text-muted-foreground">
              {t('reports.empty')}
            </p>
          ) : (
            <>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={types}
                      dataKey="revenue"
                      nameKey="type"
                      innerRadius={50}
                      outerRadius={74}
                      paddingAngle={2.5}
                      stroke="hsl(var(--card))"
                      strokeWidth={2}
                    >
                      {types.map((entry, index) => (
                        <Cell key={entry.type} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltip
                          labelFormatter={(value) => t(`rooms.type.${value}`, { defaultValue: value })}
                        />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 px-3 pb-2">
                {types.map((entry, index) => (
                  <div key={entry.type} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span
                        className="size-2 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate">{t(`rooms.type.${entry.type}`)}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] font-semibold numeric">
                      {money.currency(entry.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title={t('reports.charts.bookingTrends')}
          description={t('reports.charts.bookingTrendsBody')}
        >
          <div className="h-[230px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 6" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  tickFormatter={(value) => money.month(new Date(value))}
                />
                <YAxis tickLine={false} axisLine={false} tick={AXIS_STYLE} width={34} allowDecimals={false} />
                <Tooltip
                  content={<ChartTooltip labelFormatter={(value) => money.month(new Date(value))} valueFormatter={(value) => value} />}
                />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  name={t('reports.charts.bookings')}
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 3.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cancellations"
                  name={t('reports.charts.cancellations')}
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <div className="space-y-4 xl:col-span-5">
          <Card className="p-4">
            <div className="flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold-foreground">
                <Lightbulb className="size-4" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  {t('reports.insight.title')}
                </p>
                <ul className="mt-1.5 space-y-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {insight.strongestType ? (
                    <li>
                      {t('reports.insight.strongest', {
                        type: t(`rooms.type.${insight.strongestType}`),
                        occupancy: money.percent(insight.strongestOccupancy),
                      })}
                    </li>
                  ) : null}
                  {insight.outstanding > 0 ? (
                    <li>{t('reports.insight.balance', { amount: money.currency(insight.outstanding) })}</li>
                  ) : null}
                  {insight.largestCategory ? (
                    <li>
                      {t('reports.insight.cost', {
                        category: t(`expenses.categories.${insight.largestCategory}`),
                      })}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </Card>

          <ChartCard title={t('reports.charts.expensesByCategory')}>
            <div className="space-y-2 px-2 pb-2">
              {expenses.slice(0, 6).map((entry, index) => (
                <div key={entry.category}>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">{t(`expenses.categories.${entry.category}`)}</span>
                    <span className="font-semibold numeric">{money.currency(entry.amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, entry.share)}%`,
                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
              {expenses.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted-foreground">{t('reports.empty')}</p>
              ) : null}
            </div>
          </ChartCard>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/70 px-5 py-3">
          <BedDouble className="size-4 text-muted-foreground" />
          <h3 className="font-display text-[14px] font-semibold">{t('reports.charts.roomPerformance')}</h3>
        </div>
        <div className="divide-y divide-border/60 lg:hidden">
          {types.map((type, index) => (
            <div key={type.type} className="px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold">
                  <span
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="truncate">{t(`rooms.type.${type.type}`)}</span>
                </span>
                <span className="shrink-0 text-[12.5px] font-semibold numeric">
                  {money.currency(type.revenue)}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10.5px] text-muted-foreground">
                <span>
                  {t('reports.table.occupancy')}{' '}
                  <span className="font-semibold text-foreground numeric">
                    {money.percent(type.occupancy)}
                  </span>
                </span>
                <span>
                  {t('reports.table.adr')}{' '}
                  <span className="font-semibold text-foreground numeric">{money.currency(type.adr)}</span>
                </span>
                <span>
                  {t('reports.table.revpar')}{' '}
                  <span className="font-semibold text-foreground numeric">
                    {money.currency(type.revpar)}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, type.share)}%`,
                      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[10px] text-muted-foreground numeric">
                  {money.percent(type.share)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('reports.table.roomType')}</TableHead>
              <TableHead className="text-right">{t('reports.table.beds')}</TableHead>
              <TableHead className="text-right">{t('reports.table.occupancy')}</TableHead>
              <TableHead className="text-right">{t('reports.table.adr')}</TableHead>
              <TableHead className="text-right">{t('reports.table.revpar')}</TableHead>
              <TableHead className="text-right">{t('reports.table.revenue')}</TableHead>
              <TableHead className="text-right">{t('reports.table.share')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((type) => (
              <TableRow key={type.type}>
                <TableCell className="font-medium">{t(`rooms.type.${type.type}`)}</TableCell>
                <TableCell className="text-right numeric">{type.beds}</TableCell>
                <TableCell className="text-right numeric">{money.percent(type.occupancy)}</TableCell>
                <TableCell className="text-right numeric">{money.currency(type.adr)}</TableCell>
                <TableCell className="text-right numeric">{money.currency(type.revpar)}</TableCell>
                <TableCell className="text-right font-semibold numeric">{money.currency(type.revenue)}</TableCell>
                <TableCell className="text-right text-muted-foreground numeric">
                  {money.percent(type.share)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <div className="flex items-center gap-1.5 border-t border-border/70 px-5 py-2.5 text-[11px] text-muted-foreground">
          <CalendarRange className="size-3.5" />
          {range.start} → {range.end}
        </div>
      </Card>
    </div>
  );
}
