import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-[38px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[80px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'whitespace-nowrap text-[13px] font-medium leading-none text-foreground/85',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

function Field({ label, htmlFor, hint, error, required, className, children }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <Label htmlFor={htmlFor}>
            {label}
            {required ? <span className="ml-0.5 text-destructive">*</span> : null}
          </Label>
          {hint ? (
            // Hints never break mid-sentence: they stay on one line and drop to
            // their own row when the label leaves no room.
            <span className="ml-auto whitespace-nowrap text-right text-[11px] leading-snug text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </div>
      ) : null}
      {children}
      {error ? <p className="text-[11.5px] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

export { Input, Textarea, Label, Field };
