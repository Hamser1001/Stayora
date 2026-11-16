import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

function DeltaChip({ value, invert = false, suffix = '%' }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const numeric = Math.round(Number(value) * 10) / 10;
  const positive = invert ? numeric < 0 : numeric > 0;
  const negative = invert ? numeric > 0 : numeric < 0;
  const Icon = numeric === 0 ? Minus : numeric > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold numeric',
        positive && 'bg-status-available-soft text-status-available',
        negative && 'bg-status-maintenance-soft text-status-maintenance',
        numeric === 0 && 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="size-3" strokeWidth={2.4} />
      {Math.abs(numeric)}
      {suffix}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  invertDelta = false,
  hint,
  tone = 'default',
  className,
  footer,
}) {
  const tones = {
    default: 'bg-muted text-foreground/60',
    primary: 'bg-primary-soft text-primary',
    gold: 'bg-gold-soft text-gold-foreground',
    success: 'bg-status-available-soft text-status-available',
    info: 'bg-status-occupied-soft text-status-occupied',
    danger: 'bg-status-maintenance-soft text-status-maintenance',
  };

  return (
    <div className={cn('surface surface-hover group flex flex-col p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:-translate-y-0.5',
              tones[tone] || tones.default,
            )}
          >
            <Icon className="size-4" strokeWidth={1.9} />
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 font-display text-[27px] font-bold leading-none tracking-[-0.03em] numeric">
        {value}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined ? <DeltaChip value={delta} invert={invertDelta} /> : null}
        {hint ? <p className="text-[11.5px] leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
      {footer ? <div className="mt-3 border-t border-border/60 pt-3">{footer}</div> : null}
    </div>
  );
}
