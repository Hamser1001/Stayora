import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({ message, onRetry, className }) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive-soft/50 px-6 py-12 text-center ${className || ''}`}
    >
      <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <p className="mt-3 font-display text-[14px] font-semibold">{t('errors.title')}</p>
      <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
        {message || t('errors.body')}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
