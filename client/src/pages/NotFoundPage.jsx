import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-12 place-items-center">
          <LogoMark className="size-12 bg-primary text-primary-foreground" />
        </div>
        <p className="mt-6 font-display text-[64px] font-bold leading-none tracking-[-0.05em] text-primary/15">
          404
        </p>
        <h1 className="mt-2 font-display text-[22px] font-bold tracking-[-0.02em]">
          {t('errors.notFound')}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {t('errors.notFoundBody')}
        </p>
        <Button asChild className="mt-6">
          <Link to="/">
            <ArrowLeft className="size-4" />
            {t('errors.goHome')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
