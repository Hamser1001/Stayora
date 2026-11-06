import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { STATUS_BADGE_VARIANT } from '@/lib/constants';

export function StatusBadge({ status, dot = true, className }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status] || 'neutral'} dot={dot} className={className}>
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
