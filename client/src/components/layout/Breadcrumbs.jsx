import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

const SEGMENT_KEYS = {
  rooms: 'rooms',
  reservations: 'reservations',
  guests: 'guests',
  payments: 'payments',
  expenses: 'expenses',
  housekeeping: 'housekeeping',
  staff: 'staff',
  reports: 'reports',
  settings: 'settings',
};

export function Breadcrumbs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <p className="truncate font-display text-[13.5px] font-semibold text-foreground/80">
        {t('nav.dashboard')}
      </p>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
      <Link
        to="/"
        className="hidden shrink-0 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
      >
        {t('nav.dashboard')}
      </Link>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const label = t(`nav.${SEGMENT_KEYS[segment] || 'dashboard'}`);
        return (
          <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="hidden size-3 shrink-0 text-muted-foreground/40 sm:block" />
            {isLast ? (
              <span className="truncate text-[13px] font-semibold text-foreground/85">{label}</span>
            ) : (
              <span className="truncate text-[12.5px] font-medium text-muted-foreground">{label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
