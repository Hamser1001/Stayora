import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { useMoney } from '@/hooks/useMoney';

export const AXIS_STYLE = {
  fontSize: 10.5,
  fontFamily: 'Inter, sans-serif',
  fill: 'hsl(var(--muted-foreground))',
};

export const GRID_STROKE = 'hsl(var(--border))';

export function ChartCard({ title, description, action, children, footer, className }) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h3 className="font-display text-[14.5px] font-semibold">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="flex-1 px-2 pb-2">{children}</div>
      {footer ? <div className="border-t border-border/60 px-5 py-3">{footer}</div> : null}
    </Card>
  );
}

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  const { currency } = useMoney();
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-lg border border-border bg-popover px-3 py-2 shadow-lift">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <div className="mt-1.5 space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey || entry.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: entry.color || entry.payload?.fill }}
              />
              {entry.name}
            </span>
            <span className="text-[11.5px] font-semibold numeric">
              {valueFormatter
                ? valueFormatter(entry.value, entry)
                : typeof entry.value === 'number'
                  ? currency(entry.value)
                  : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendDot({ color, label, value }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-2 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
      {value ? <span className="font-semibold text-foreground numeric">{value}</span> : null}
    </span>
  );
}

export function ChartEmpty({ message }) {
  const { t } = useTranslation();
  return (
    <div className="grid h-[240px] place-items-center text-center">
      <div>
        <p className="text-[13px] font-medium">{message || t('reports.empty')}</p>
        <p className="mt-1 text-[11.5px] text-muted-foreground">{t('reports.emptyBody')}</p>
      </div>
    </div>
  );
}

export function compactNumber(value) {
  if (Math.abs(value) >= 1000) {
    const compact = value / 1000;
    return `${Number.isInteger(compact) ? compact : compact.toFixed(1)}k`;
  }
  return String(Math.round(value));
}
