import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BedDouble,
  Brush,
  CalendarPlus,
  CircleAlert,
  DoorOpen,
  Gauge,
  LogIn,
  LogOut,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/contexts/AuthContext';
import { useMoney } from '@/hooks/useMoney';
import { useSettings } from '@/contexts/SettingsContext';
import { buildDateRange } from '@/lib/dates';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DateRangeFilter } from '@/components/common/DateRangeFilter';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PageSkeleton } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartCard, ChartTooltip, compactNumber, AXIS_STYLE, GRID_STROKE } from '@/components/charts/ChartKit';
import { BED_STATUS_CLASSES, BED_STATUS_DOT, CHART_COLORS } from '@/lib/constants';
import { initials, cn } from '@/lib/utils';

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

function BedMap({ rooms, t }) {
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h3 className="font-display text-[14.5px] font-semibold">{t('dashboard.bedMap.title')}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {t('dashboard.bedMap.subtitle')} · {rooms.length} {t('nav.rooms').toLowerCase()}
          </p>
        </div>
        <Button variant="ghost" size="xs" asChild className="text-[11.5px]">
          <Link to="/rooms">
            {t('dashboard.bedMap.viewRooms')}
            <ArrowRight className="size-3" />
          </Link>
        </Button>
      </div>
      <div className="max-h-[268px] flex-1 overflow-y-auto px-5 pb-3">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => navigate(`/rooms?room=${room.id}`)}
              className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/40"
            >
              <div className="min-w-0 w-[52px] shrink-0">
                <p className="text-[12px] font-semibold leading-tight numeric">{room.number}</p>
                <p className="truncate text-[9.5px] uppercase tracking-wide text-muted-foreground/70">
                  {t(`rooms.type.${room.type}`)}
                </p>
              </div>
              <div className="flex flex-1 flex-wrap gap-1">
                {room.beds.map((bed) => (
                  <span
                    key={bed.id}
                    title={`${t('rooms.bedLabel', { number: bed.number })} · ${t(`status.${bed.status}`)}`}
                    className={cn('size-3.5 rounded-[3px] border', BED_STATUS_CLASSES[bed.status])}
                  />
                ))}
              </div>
              <span className="shrink-0 text-[10px] font-medium text-muted-foreground numeric">
                {room.availableBeds}/{room.totalBeds}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-border/60 px-5 py-2.5">
        {['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', BED_STATUS_DOT[status])} />
            {t(`rooms.legend.${status}`)}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { settings } = useSettings();
  const money = useMoney();
  const navigate = useNavigate();
  const [range, setRange] = useState(() => ({ preset: 'month', ...buildDateRange('month') }));
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, reload } = useApiResource(
    async () => {
      const [snapshot, rooms] = await Promise.all([
        api.dashboard.get({ start: range.start, end: range.end }),
        api.rooms.list(),
      ]);
      return { ...snapshot, rooms };
    },
    [range.start, range.end],
  );

  const recent = useMemo(() => data?.recent || [], [data]);
  const sourcesTotal = useMemo(
    () => (data?.sources || []).reduce((sum, item) => sum + item.count, 0),
    [data],
  );

  const handleStatus = async (reservation, status) => {
    setBusyId(reservation.id);
    try {
      await api.reservations.setStatus(reservation.id, status);
      toast.success(
        status === 'checkedIn'
          ? t('reservations.checkedInToast', {
              name: reservation.guestName,
              room: reservation.roomNumber,
            })
          : t('reservations.checkedOutToast', { name: reservation.guestName }),
      );
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const { metrics, live, deltas, series, occupancy, sources, arrivals, departures } = data;
  const arrivalList = arrivals;
  const departureList = departures;

  const FrontDeskRow = ({ reservation, mode }) => (
    <div className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
      <Avatar className="size-8 ring-1 ring-border">
        <AvatarFallback className="text-[10px]">{initials(reservation.guestName)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold">{reservation.guestName}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t('rooms.room')} {reservation.roomNumber} · {t('rooms.bedLabel', { number: reservation.bed?.number })}
          {mode === 'arrival'
            ? ` · ${t('units.night', { count: reservation.nights })}`
            : reservation.balance > 0
              ? ` · ${money.currency(reservation.balance)} ${t('reservations.balanceDue').toLowerCase()}`
              : ` · ${t('reservations.fullyPaid')}`}
        </p>
      </div>
      <Button
        variant={mode === 'arrival' ? 'outline' : 'subtle'}
        size="xs"
        disabled={busyId === reservation.id}
        onClick={() => handleStatus(reservation, mode === 'arrival' ? 'checkedIn' : 'checkedOut')}
      >
        {mode === 'arrival' ? <LogIn className="size-3.5" /> : <LogOut className="size-3.5" />}
        <span className="hidden sm:inline">
          {mode === 'arrival' ? t('reservations.checkIn') : t('reservations.checkOut')}
        </span>
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t(`dashboard.${greetingKey()}`, { name: user?.name?.split(' ')[0] || 'Amina' })}
        subtitle={t('dashboard.subtitle', { hostel: settings.name })}
        actions={
          <>
            <DateRangeFilter value={range} onChange={setRange} presets={['today', 'week', 'month', 'custom']} />
            <Button size="sm" onClick={() => navigate('/reservations?new=1')}>
              <CalendarPlus className="size-4" />
              {t('dashboard.newReservation')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.kpi.occupancy')}
          value={money.percent(live.occupancy)}
          icon={Gauge}
          tone="primary"
          delta={deltas.occupancy}
          hint={t('dashboard.kpiHint.occupancy', { occupied: live.occupiedBeds, total: live.totalBeds })}
          footer={
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.min(100, live.occupancy)}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground numeric">
                {live.availableBeds} {t('status.available').toLowerCase()}
              </span>
            </div>
          }
        />
        <StatCard
          label={t('dashboard.kpi.revenue')}
          value={money.currency(metrics.revenue)}
          icon={TrendingUp}
          tone="success"
          delta={deltas.revenue}
          hint={t('dashboard.kpiHint.revenue', { count: metrics.paymentCount })}
        />
        <StatCard
          label={t('dashboard.kpi.inHouse')}
          value={money.number(live.inHouseGuests)}
          icon={Users}
          tone="info"
          hint={t('dashboard.guestsAcross', { count: live.inHouseStays })}
        />
        <StatCard
          label={t('dashboard.kpi.pendingPayments')}
          value={money.currency(metrics.outstanding)}
          icon={Wallet}
          tone="gold"
          hint={t('dashboard.openInvoices', { count: live.outstandingCount })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title={t('dashboard.charts.revenueVsExpenses')}
          description={t('dashboard.charts.revenueVsExpensesBody')}
          action={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="size-2 rounded-[3px] bg-chart-1" />
                {t('dashboard.charts.revenue')}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <span className="size-2 rounded-[3px] bg-chart-2" />
                {t('dashboard.charts.expenses')}
              </span>
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              <span className="text-[11px] text-muted-foreground">
                {t('dashboard.charts.totalRevenue')}{' '}
                <span className="font-semibold text-foreground">{money.currency(metrics.revenue)}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('dashboard.charts.totalExpenses')}{' '}
                <span className="font-semibold text-foreground">{money.currency(metrics.expenses)}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('dashboard.charts.net')}{' '}
                <span
                  className={cn(
                    'font-semibold',
                    metrics.netProfit >= 0 ? 'text-status-available' : 'text-destructive',
                  )}
                >
                  {money.currency(metrics.netProfit)}
                </span>
              </span>
            </div>
          }
        >
          <div className="h-[268px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 16, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  tickFormatter={(value) => money.date(value, { style: 'short' })}
                  interval={Math.max(0, Math.floor(series.length / 6) - 1)}
                  minTickGap={16}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  width={44}
                  tickFormatter={compactNumber}
                />
                <Tooltip
                  content={<ChartTooltip labelFormatter={(value) => money.date(value, { style: 'short' })} />}
                  cursor={{ stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name={t('dashboard.charts.revenue')}
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#revenueFill)"
                  activeDot={{ r: 3.5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name={t('dashboard.charts.expenses')}
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={1.6}
                  fill="url(#expenseFill)"
                  activeDot={{ r: 3, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          title={t('dashboard.charts.sources')}
          description={t('dashboard.charts.sourcesBody')}
        >
          <div className="relative h-[196px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sources}
                  dataKey="count"
                  nameKey="source"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={2.5}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {sources.map((entry, index) => (
                    <Cell key={entry.source} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(value) => `${value} · ${money.percent((value / (sourcesTotal || 1)) * 100)}`}
                      labelFormatter={(value) => t(`reservations.sourceLabels.${value}`, { defaultValue: value })}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[24px] font-bold leading-none numeric">{sourcesTotal}</span>
              <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {t('dashboard.charts.bookings')}
              </span>
            </div>
          </div>
          <div className="space-y-2 px-3 pb-2 pt-1">
            {sources.slice(0, 5).map((entry, index) => (
              <div key={entry.source} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
                  <span
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="truncate">{t(`reservations.sourceLabels.${entry.source}`)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11.5px] font-semibold numeric">{entry.count}</span>
                  <span className="w-9 text-right text-[10.5px] text-muted-foreground numeric">
                    {money.percent(entry.share)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="flex flex-col overflow-hidden xl:col-span-5">
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
            <div>
              <h3 className="font-display text-[14.5px] font-semibold">{t('dashboard.arrivals.title')}</h3>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {t('dashboard.arrivals.subtitle', { count: arrivalList.length })}
              </p>
            </div>
            <Button variant="ghost" size="xs" asChild>
              <Link to="/reservations">
                {t('common.viewAll')}
                <ArrowRight className="size-3" />
              </Link>
            </Button>
          </div>
          <Tabs defaultValue="arrivals" className="flex flex-1 flex-col">
            <div className="px-5 pt-2">
              <TabsList className="w-full">
                <TabsTrigger value="arrivals" className="flex-1">
                  {t('dashboard.arrivals.title')}
                  <span className="rounded bg-card px-1 text-[10px] font-semibold text-muted-foreground shadow-sm numeric">
                    {arrivalList.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="departures" className="flex-1">
                  {t('dashboard.departures.title')}
                  <span className="rounded bg-card px-1 text-[10px] font-semibold text-muted-foreground shadow-sm numeric">
                    {departureList.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="arrivals" className="mt-2 flex-1 divide-y divide-border/50">
              {arrivalList.length === 0 ? (
                <EmptyState
                  compact
                  icon={DoorOpen}
                  title={t('dashboard.arrivals.empty')}
                  description={t('dashboard.arrivals.emptyBody')}
                />
              ) : (
                arrivalList.map((reservation) => (
                  <FrontDeskRow key={reservation.id} reservation={reservation} mode="arrival" />
                ))
              )}
            </TabsContent>
            <TabsContent value="departures" className="mt-2 flex-1 divide-y divide-border/50">
              {departureList.length === 0 ? (
                <EmptyState
                  compact
                  icon={LogOut}
                  title={t('dashboard.departures.empty')}
                  description={t('dashboard.departures.emptyBody')}
                />
              ) : (
                departureList.map((reservation) => (
                  <FrontDeskRow key={reservation.id} reservation={reservation} mode="departure" />
                ))
              )}
            </TabsContent>
          </Tabs>
        </Card>

        <ChartCard
          className="xl:col-span-7"
          title={t('dashboard.charts.occupancy')}
          description={t('dashboard.charts.occupancyBody')}
          action={
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary numeric">
              {money.percent(live.occupancy)} {t('common.today').toLowerCase()}
            </span>
          }
          footer={
            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
              <span className="text-[11px] text-muted-foreground">
                {t('rooms.summary.occupied')}{' '}
                <span className="font-semibold text-foreground numeric">{live.occupiedBeds}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('rooms.summary.available')}{' '}
                <span className="font-semibold text-status-available numeric">{live.availableBeds}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('rooms.legend.reserved')}{' '}
                <span className="font-semibold text-foreground numeric">{live.reservedBeds}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('rooms.summary.attention')}{' '}
                <span className="font-semibold text-status-maintenance numeric">
                  {live.dirtyBeds + live.openTasks}
                </span>
              </span>
            </div>
          }
        >
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={occupancy} margin={{ top: 8, right: 16, left: 4, bottom: 4 }} barCategoryGap="26%">
                <defs>
                  <linearGradient id="occupancyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  tickFormatter={(value) => money.date(value, { style: 'short' })}
                  interval={Math.max(0, Math.floor(occupancy.length / 7) - 1)}
                  minTickGap={14}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={AXIS_STYLE}
                  width={34}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      labelFormatter={(value) => money.date(value, { style: 'long' })}
                      valueFormatter={(value, entry) =>
                        `${value}% · ${entry.payload.occupied} ${t('rooms.beds').toLowerCase()}`
                      }
                    />
                  }
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                />
                <ReferenceLine
                  y={Math.round(
                    occupancy.reduce((sum, day) => sum + day.occupancy, 0) / (occupancy.length || 1),
                  )}
                  stroke="hsl(var(--gold))"
                  strokeDasharray="4 4"
                  strokeWidth={1.2}
                />
                <Bar
                  dataKey="occupancy"
                  name={t('dashboard.charts.occupancyRate')}
                  fill="url(#occupancyFill)"
                  radius={[4, 4, 2, 2]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <BedMap rooms={data.rooms} t={t} />
        </div>

        <Card className="flex flex-col overflow-hidden xl:col-span-5">
          <div className="px-5 pb-3 pt-5">
            <h3 className="font-display text-[14.5px] font-semibold">{t('dashboard.actionCenter.title')}</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {t('dashboard.actionCenter.subtitle')}
            </p>
          </div>
          <div className="flex-1 space-y-1 px-3 pb-3">
            {[
              {
                icon: Brush,
                label: t('dashboard.actionCenter.dirtyRooms', { count: live.dirtyBeds }),
                to: '/housekeeping',
                tone: 'bg-status-cleaning-soft text-status-cleaning',
                count: live.dirtyBeds,
              },
              {
                icon: Sparkles,
                label: t('dashboard.actionCenter.openTasks', { count: live.openTasks }),
                to: '/housekeeping',
                tone: 'bg-status-maintenance-soft text-status-maintenance',
                count: live.openTasks,
              },
              {
                icon: CircleAlert,
                label: t('dashboard.actionCenter.pending', { count: live.pendingReservations }),
                to: '/reservations?status=pending',
                tone: 'bg-status-reserved-soft text-status-reserved',
                count: live.pendingReservations,
              },
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60"
              >
                <span className={cn('grid size-8 place-items-center rounded-lg', item.tone)}>
                  <item.icon className="size-4" strokeWidth={1.9} />
                </span>
                <span className="flex-1 text-[12.5px] font-medium leading-snug">{item.label}</span>
                <ArrowRight className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
          <div className="border-t border-border/60 p-3">
            <Button variant="outline" size="sm" className="w-full justify-between" asChild>
              <Link to="/housekeeping">
                {t('dashboard.actionCenter.reviewHousekeeping')}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div>
            <h3 className="font-display text-[14.5px] font-semibold">{t('dashboard.recent.title')}</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('dashboard.recent.subtitle')}</p>
          </div>
          <Button variant="ghost" size="xs" asChild>
            <Link to="/reservations">
              {t('common.viewAll')}
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            compact
            icon={BedDouble}
            title={t('dashboard.recent.empty')}
            description={t('dashboard.recent.emptyBody')}
          />
        ) : (
          <>
          <div className="divide-y divide-border/60 lg:hidden">
            {recent.map((reservation) => (
              <button
                key={reservation.id}
                type="button"
                onClick={() => navigate(`/reservations?focus=${reservation.id}`)}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 active:bg-muted/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className="text-[10.5px]">
                        {initials(reservation.guestName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight">
                        {reservation.guestName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                        {reservation.reference}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={reservation.status} />
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-medium numeric">
                      {money.date(reservation.arrival, { style: 'short' })} →{' '}
                      {money.date(reservation.departure, { style: 'short' })}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                      {t('rooms.room')} {reservation.roomNumber} ·{' '}
                      {t('rooms.bedLabel', { number: reservation.bed?.number })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={reservation.paymentStatus} dot={false} />
                    <span className="text-[13px] font-semibold numeric">
                      {money.currency(reservation.total)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('reservations.reference')}</TableHead>
                <TableHead>{t('reservations.guest')}</TableHead>
                <TableHead>{t('reservations.stay')}</TableHead>
                <TableHead className="text-right">{t('reservations.total')}</TableHead>
                <TableHead>{t('reservations.payment')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((reservation) => (
                <TableRow
                  key={reservation.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/reservations?focus=${reservation.id}`)}
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
                          {t('rooms.room')} {reservation.roomNumber} ·{' '}
                          {t('rooms.bedLabel', { number: reservation.bed?.number })}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                    {money.date(reservation.arrival, { style: 'short' })} →{' '}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}
