import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      {Icon ? (
        <div className="grid size-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm">
          <Icon className="size-5" strokeWidth={1.8} />
        </div>
      ) : null}
      <p className="mt-4 font-display text-[15px] font-semibold">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
