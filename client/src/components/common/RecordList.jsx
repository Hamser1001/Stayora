import { cn } from '@/lib/utils';

/**
 * Mobile replacement for wide data tables: a stack of standalone record cards
 * shown below the `lg` breakpoint, where the desktop table is hidden instead.
 */
export function RecordList({ className, children }) {
  return <div className={cn('space-y-2.5 lg:hidden', className)}>{children}</div>;
}

export function RecordRow({ onClick, className, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-stretch gap-2.5 rounded-xl border border-border/80 bg-card px-4 py-3.5 text-left shadow-card',
        onClick && 'transition-colors hover:bg-muted/30 active:bg-muted/60',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
