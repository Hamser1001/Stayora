import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { ProfilePhotoCard } from '@/features/staff/ProfilePhotoCard';

function Detail({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-[12.5px]">{value}</span>
    </div>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      <PageHeader title={t('profile.pageTitle')} subtitle={t('profile.pageSubtitle')} />

      <ProfilePhotoCard user={user} />

      <Card className="overflow-hidden">
        <div className="border-b border-border/70 px-5 py-4">
          <h3 className="font-display text-[14px] font-semibold">{t('profile.accountTitle')}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('profile.accountBody')}</p>
        </div>
        <div className="grid gap-x-8 divide-y divide-border/60 px-5 py-2 sm:grid-cols-2 sm:divide-y-0">
          <Detail label={t('common.name')} value={user?.name} />
          <Detail label={t('auth.email')} value={user?.email} />
          <Detail label={t('staff.role')} value={t(`staff.roles.${user?.role || 'receptionist'}`)} />
          <Detail
            label={t('profile.language')}
            value={t(`common.${user?.language === 'fr' ? 'french' : 'english'}`)}
          />
        </div>
      </Card>
    </div>
  );
}
