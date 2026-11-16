import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Mobile replacement for wide data tables. Renders stacked record cards below
 * the `lg` breakpoint, where the desktop table is hidden instead.
 */
export function RecordList({ className, children }) {
  return (
    <Card className={cn('divide-y divide-border/60 overflow-hidden lg:hidden', className)}>
      {children}
    </Card>
  );
}

export function RecordRow({ onClick, className, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-2 px-4 py-3.5 text-left',
        onClick && 'transition-colors hover:bg-muted/40 active:bg-muted/70',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
