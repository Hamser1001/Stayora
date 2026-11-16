import { cn } from '@/lib/utils';

/**
 * Compact segmented control used for filters, view switches and tabs.
 * Active state is a soft green chip so it never competes with solid primary buttons.
 */
export function SegmentedControl({ className, children, ...props }) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SegmentedOption({
  active = false,
  icon: Icon,
  iconOnly = false,
  children,
  className,
  ...props
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50',
        iconOnly ? 'w-8' : 'px-2.5',
        active
          ? 'bg-primary-soft text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      {iconOnly ? null : children}
    </button>
  );
}
