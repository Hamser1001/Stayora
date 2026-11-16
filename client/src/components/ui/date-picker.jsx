import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { monthMatrix, parseDate, todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';

const LOCALES = { en: 'en-GB', fr: 'fr-FR' };
const localeFor = (language) => LOCALES[String(language || 'en').slice(0, 2)] || 'en-GB';

/**
 * Styled date picker that replaces the browser's native calendar popup.
 * Controlled: works with react-hook-form's Controller via value / onChange.
 */
export function DatePicker({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  min,
  max,
  disabled,
  className,
  'aria-invalid': ariaInvalid,
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const locale = localeFor(i18n.language);
  const [viewMonth, setViewMonth] = useState(() => parseDate(value) || parseDate(todayISO()));

  useEffect(() => {
    if (!open) return;
    const parsed = parseDate(value);
    setViewMonth(parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), 1) : parseDate(todayISO()));
  }, [open, value]);

  const formatters = useMemo(() => {
    const weekdayShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return {
      weekdays: Array.from({ length: 7 }, (_, index) =>
        weekdayShort.format(new Date(2024, 0, 1 + index)).replace('.', ''),
      ),
      monthYear: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
      display: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }),
    };
  }, [locale]);

  const today = todayISO();
  const days = useMemo(() => monthMatrix(viewMonth), [viewMonth]);
  const parsedValue = parseDate(value);

  const shiftMonth = (delta) => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  };

  const isUnavailable = (iso) => Boolean((min && iso < min) || (max && iso > max));

  const selectDay = (iso) => {
    onChange?.(iso);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          name={name}
          disabled={disabled}
          onBlur={onBlur}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={ariaInvalid || undefined}
          className={cn(
            'flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-xs transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60',
            ariaInvalid && 'border-destructive/50',
            className,
          )}
        >
          <span className={cn('truncate', !parsedValue && 'text-muted-foreground/70')}>
            {parsedValue ? formatters.display.format(parsedValue) : placeholder || t('common.selectDate')}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-[292px] p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={t('dates.previousMonth')}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="whitespace-nowrap text-[13px] font-semibold capitalize">
            {formatters.monthYear.format(viewMonth)}
          </p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={t('dates.nextMonth')}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-y-1">
          {formatters.weekdays.map((day) => (
            <span
              key={day}
              className="flex h-6 items-center justify-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              {day}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5" role="grid">
          {days.map((iso, index) => {
            if (!iso) return <span key={`blank-${index}`} className="size-9" />;
            const date = parseDate(iso);
            const selected = value === iso;
            const isToday = iso === today;
            const unavailable = isUnavailable(iso);
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                disabled={unavailable}
                onClick={() => selectDay(iso)}
                aria-current={isToday ? 'date' : undefined}
                aria-selected={selected}
                className={cn(
                  'inline-flex size-9 items-center justify-center rounded-lg text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary'
                    : 'text-foreground hover:bg-muted',
                  !selected && isToday && 'text-primary ring-1 ring-inset ring-primary/30',
                  unavailable && 'cursor-not-allowed text-muted-foreground/40 hover:bg-transparent',
                )}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
          <button
            type="button"
            disabled={!value}
            onClick={() => {
              onChange?.('');
              setOpen(false);
            }}
            className="rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            {t('common.clear')}
          </button>
          <button
            type="button"
            disabled={isUnavailable(today)}
            onClick={() => selectDay(today)}
            className="rounded-md px-2 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary-soft disabled:pointer-events-none disabled:opacity-40"
          >
            {t('dates.today')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
