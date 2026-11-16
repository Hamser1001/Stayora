import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium leading-5 transition-colors [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        neutral: 'border-border bg-muted/70 text-muted-foreground',
        outline: 'border-border bg-card text-foreground/75',
        gold: 'border-gold/25 bg-gold-soft text-gold-foreground',
        success: 'border-status-available/20 bg-status-available-soft text-status-available',
        info: 'border-status-occupied/20 bg-status-occupied-soft text-status-occupied',
        warning: 'border-status-reserved/25 bg-status-reserved-soft text-status-reserved',
        violet: 'border-status-cleaning/20 bg-status-cleaning-soft text-status-cleaning',
        danger: 'border-status-maintenance/20 bg-status-maintenance-soft text-status-maintenance',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, dot, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
