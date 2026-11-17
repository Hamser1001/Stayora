import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Trash2, Upload } from 'lucide-react';
import { api } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loading';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { AvatarCropDialog } from '@/features/staff/AvatarCropDialog';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function ProfilePhotoCard({ user }) {
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const chooseFile = () => inputRef.current?.click();

  const onFileChange = (event) => {
    const picked = event.target.files?.[0];
    // Reset so picking the same file again still fires a change event.
    event.target.value = '';
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      toast.error(t('profile.invalidType'));
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      toast.error(t('profile.tooLarge'));
      return;
    }
    setFile(picked);
    setCropOpen(true);
  };

  const handleSave = async (dataUrl) => {
    setSaving(true);
    try {
      const result = await api.auth.uploadAvatar(dataUrl);
      setUser(result.user);
      setCropOpen(false);
      setFile(null);
      toast.success(t('profile.uploaded'));
    } catch (error) {
      toast.error(error.message || t('errors.body'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const result = await api.auth.removeAvatar();
      setUser(result.user);
      setRemoveOpen(false);
      toast.success(t('profile.removed'));
    } catch (error) {
      toast.error(error.message || t('errors.body'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-2.5 border-b border-border/70 px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Camera className="size-4" strokeWidth={1.9} />
        </span>
        <div>
          <h3 className="font-display text-[14px] font-semibold">{t('profile.title')}</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('profile.body')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <StaffAvatar
            member={user}
            className="size-16 ring-1 ring-border"
            fallbackClassName="bg-primary text-[18px] text-primary-foreground"
          />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{user?.name}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{user?.email}</p>
            <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {t(`staff.roles.${user?.role || 'receptionist'}`)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="sr-only"
            onChange={onFileChange}
            tabIndex={-1}
          />
          <Button variant="outline" size="sm" onClick={chooseFile}>
            {user?.avatarUrl ? <Camera className="size-3.5" /> : <Upload className="size-3.5" />}
            {user?.avatarUrl ? t('profile.change') : t('profile.upload')}
          </Button>
          {user?.avatarUrl ? (
            <Button variant="destructive-ghost" size="sm" onClick={() => setRemoveOpen(true)}>
              <Trash2 className="size-3.5" />
              {t('profile.remove')}
            </Button>
          ) : null}
        </div>
      </div>

      <AvatarCropDialog
        open={cropOpen}
        onOpenChange={(next) => {
          setCropOpen(next);
          if (!next && !saving) setFile(null);
        }}
        file={file}
        onSave={handleSave}
        saving={saving}
      />

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('profile.removeTitle')}
        description={t('profile.removeBody')}
        confirmLabel={t('profile.remove')}
        destructive
        loading={removing}
        onConfirm={handleRemove}
      />
    </Card>
  );
}

