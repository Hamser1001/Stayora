import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';

/**
 * Icon-only action button with a consistent size and a tooltip that reuses the
 * same label as the accessible name.
 */
export function IconAction({ label, icon: Icon, variant = 'ghost', className, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="icon-sm"
          aria-label={label}
          className={className}
          {...props}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
