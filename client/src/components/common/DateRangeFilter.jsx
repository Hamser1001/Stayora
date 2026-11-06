import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
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
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-[0_1px_1px_hsl(200_20%_10%/0.02)]',
        className,
      )}
    >
      {presets.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => selectPreset(preset)}
          className={cn(
            'h-8 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors',
            value.preset === preset
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
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
              <Input
                id="range-start"
                type="date"
                value={draft.start}
                onChange={(event) => setDraft((prev) => ({ ...prev, start: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-end">{t('common.to')}</Label>
              <Input
                id="range-end"
                type="date"
                value={draft.end}
                onChange={(event) => setDraft((prev) => ({ ...prev, end: event.target.value }))}
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
