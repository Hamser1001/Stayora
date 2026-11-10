import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api } from '@/api';
import { useMoney } from '@/hooks/useMoney';
import { addDays, eachDay, monthMatrix, toISODate, todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/common/StatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Spinner } from '@/components/ui/loading';

const WEEKDAY_REF = new Date(2024, 0, 1); // Monday

export function ReservationCalendar({ onSelect }) {
  const { t } = useTranslation();
  const money = useMoney();
  const [month, setMonth] = useState(() => new Date());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(todayISO());

  const grid = useMemo(() => monthMatrix(month), [month]);
  const start = grid.find(Boolean);
  const end = [...grid].reverse().find(Boolean);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.reservations
      .calendar({ start, end })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const stays = useMemo(() => data?.reservations || [], [data]);

  const byDay = useMemo(() => {
    const map = new Map();
    eachDay(start, end).forEach((day) => {
      map.set(day, {
        inHouse: stays.filter((r) => r.arrival <= day && r.departure > day),
        arrivals: stays.filter((r) => r.arrival === day),
        departures: stays.filter((r) => r.departure === day),
      });
    });
    return map;
  }, [stays, start, end]);

  const selected = byDay.get(selectedDay) || { inHouse: [], arrivals: [], departures: [] };

  const shiftMonth = (amount) => {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
  };

  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    money.weekday(new Date(WEEKDAY_REF.getFullYear(), WEEKDAY_REF.getMonth(), WEEKDAY_REF.getDate() + index)),
  );

  if (error) return <ErrorState message={error.message} onRetry={() => setMonth(new Date(month))} />;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
          <div>
            <h3 className="font-display text-[14.5px] font-semibold">{t('reservations.calendar.title')}</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {t('reservations.calendar.subtitle', { month: money.month(month) })}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {loading ? <Spinner className="mr-1 text-muted-foreground" /> : null}
            <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label={t('common.back')}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => shiftMonth(1)} aria-label={t('common.next')}>
              <ChevronRight />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
          {weekdayLabels.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-[86px] border-b border-r border-border/40 bg-muted/10" />;
            const info = byDay.get(day) || { inHouse: [], arrivals: [], departures: [] };
            const isToday = day === todayISO();
            const isSelected = day === selectedDay;
            const total = info.inHouse.length;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'min-h-[86px] border-b border-r border-border/40 px-1.5 py-1.5 text-left align-top transition-colors',
                  isSelected ? 'bg-primary-soft/60 ring-1 ring-inset ring-primary/30' : 'hover:bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-full text-[11px] font-semibold numeric',
                      isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {Number(day.slice(-2))}
                  </span>
                  {total > 0 ? (
                    <span className="text-[10px] font-semibold text-muted-foreground numeric">{total}</span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-0.5">
                  {info.arrivals.slice(0, 2).map((r) => (
                    <span
                      key={`a-${r.id}`}
                      className="block truncate rounded-[3px] bg-status-available-soft px-1 text-[9.5px] font-medium leading-[14px] text-status-available"
                    >
                      {r.guestName}
                    </span>
                  ))}
                  {info.departures.slice(0, 2).map((r) => (
                    <span
                      key={`d-${r.id}`}
                      className="block truncate rounded-[3px] bg-status-cleaning-soft px-1 text-[9.5px] font-medium leading-[14px] text-status-cleaning"
                    >
                      {r.guestName}
                    </span>
                  ))}
                  {info.arrivals.length + info.departures.length < 2 && total > 0 ? (
                    <span className="block truncate rounded-[3px] bg-status-occupied-soft px-1 text-[9.5px] font-medium leading-[14px] text-status-occupied">
                      {t('reservations.calendar.inHouse')} · {total}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5">
          {[
            ['bg-status-available', 'legendArrival'],
            ['bg-status-cleaning', 'legendDeparture'],
            ['bg-status-occupied', 'legendStay'],
          ].map(([tone, key]) => (
            <span key={key} className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className={cn('size-2 rounded-[3px]', tone)} />
              {t(`reservations.calendar.${key}`)}
            </span>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden">
        <div className="border-b border-border/70 px-4 py-3">
          <h3 className="font-display text-[14px] font-semibold">
            {money.date(selectedDay, { style: 'long' })}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('reservations.calendar.dayDetails', { count: selected.inHouse.length })}
          </p>
        </div>
        <div className="flex-1 divide-y divide-border/50 overflow-y-auto">
          {selected.inHouse.length === 0 ? (
            <EmptyState compact icon={CalendarDays} title={t('reservations.calendar.noActivity')} />
          ) : (
            selected.inHouse.map((reservation) => (
              <button
                key={reservation.id}
                type="button"
                onClick={() => onSelect(reservation)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{reservation.guestName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t('rooms.room')} {reservation.roomNumber} ·{' '}
                    {money.date(reservation.arrival, { style: 'short' })} →{' '}
                    {money.date(reservation.departure, { style: 'short' })}
                  </p>
                </div>
                <StatusBadge status={reservation.status} dot={false} />
              </button>
            ))
          )}
        </div>
        <div className="space-y-1.5 border-t border-border/60 px-4 py-3 text-[11.5px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('reservations.calendar.arrivals')}</span>
            <span className="font-semibold numeric">{selected.arrivals.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('reservations.calendar.departures')}</span>
            <span className="font-semibold numeric">{selected.departures.length}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
