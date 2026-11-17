import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfilePhotoCard } from '@/features/staff/ProfilePhotoCard';
import { ProfileDetailsCard } from '@/features/profile/ProfileDetailsCard';
import { ProfilePasswordCard } from '@/features/profile/ProfilePasswordCard';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      <PageHeader title={t('profile.pageTitle')} subtitle={t('profile.pageSubtitle')} />

      <ProfilePhotoCard user={user} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ProfileDetailsCard user={user} />
        <ProfilePasswordCard />
      </div>
    </div>
  );
}
