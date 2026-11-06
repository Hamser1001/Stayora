import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions, meta, className }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 pb-6 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-[24px] font-bold leading-tight tracking-[-0.025em] sm:text-[26px]">
            {title}
          </h1>
          {meta}
        </div>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
