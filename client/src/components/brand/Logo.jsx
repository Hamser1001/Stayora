import { cn } from '@/lib/utils';

export function LogoMark({ className }) {
  return (
    <span
      className={cn(
        'relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-tile text-brand-ink shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]',
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="size-5" fill="none">
        <path
          d="M6 22.5V13a2 2 0 0 1 2-2h7a5.5 5.5 0 0 1 5.5 5.5v6"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path d="M6 18.5h14.5M15 11v7.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        <circle cx="24.5" cy="24" r="2.2" fill="hsl(var(--gold))" />
      </svg>
    </span>
  );
}

export function Brand({ collapsed = false, className }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed ? (
        <div className="min-w-0 leading-none">
          <p className="font-display text-[17px] font-extrabold tracking-[-0.03em] text-white">
            Stayora
          </p>
          <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
            Hostel OS
          </p>
        </div>
      ) : null}
    </div>
  );
}
