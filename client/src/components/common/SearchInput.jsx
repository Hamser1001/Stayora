import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function SearchInput({ value, onChange, placeholder, className, ...props }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}
