import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { buildDateRange } from '@/lib/dates';
import { cn } from '@/lib/utils';

const ORDER = ['today', 'week', 'month', 'quarter', 'year', 'custom'];

export function DateRangeFilter({ value, onChange, presets = ['today', 'week', 'month'], className }) {
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ start: value.start, end: value.end });

  const selectPreset = (preset) => {
    if (preset === 'custom') {
      setDraft({ start: value.start, end: value.end });
      setCustomOpen(true);
      return;
    }
    onChange({ preset, ...buildDateRange(preset) });
  };

  const applyCustom = () => {
    if (!draft.start || !draft.end) return;
    const [start, end] = draft.start <= draft.end ? [draft.start, draft.end] : [draft.end, draft.start];
    onChange({ preset: 'custom', start, end });
    setCustomOpen(false);
  };

  return (
    <div
      className={cn(
        'grid w-full grid-cols-2 gap-1.5 sm:inline-flex sm:w-auto sm:items-center sm:gap-0.5 sm:rounded-lg sm:border sm:border-border sm:bg-card sm:p-0.5 sm:shadow-xs',
        className,
      )}
    >
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => selectPreset(preset)}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-medium transition-colors sm:h-8 sm:justify-start sm:rounded-md sm:border-0',
            value.preset === preset
              ? 'border-primary/25 bg-primary-soft text-primary'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground sm:border-0 sm:bg-transparent',
          )}
        >
          {preset === 'custom' ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {t('dates.quick.custom')}
            </span>
          ) : (
            t(`dates.quick.${preset}`)
          )}
        </button>
      ))}
      {value.preset === 'custom' ? (
        <span className="ml-1 hidden whitespace-nowrap border-l border-border pl-2 pr-1 text-[11px] font-medium text-muted-foreground md:inline">
          {value.start} → {value.end}
        </span>
      ) : null}

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[280px]">
          <p className="text-[13px] font-semibold">{t('common.customRange')}</p>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="range-start">{t('common.from')}</Label>
              <DatePicker
                id="range-start"
                value={draft.start}
                onChange={(next) => setDraft((prev) => ({ ...prev, start: next }))}
                max={draft.end}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-end">{t('common.to')}</Label>
              <DatePicker
                id="range-end"
                value={draft.end}
                onChange={(next) => setDraft((prev) => ({ ...prev, end: next }))}
                min={draft.start}
              />
            </div>
            <Button size="sm" className="w-full" onClick={applyCustom}>
              {t('common.apply')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export const DATE_PRESET_ORDER = ORDER;
