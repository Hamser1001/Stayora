import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ChevronDown, LogOut, Settings2, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    toast.success(t('auth.signOutTitle'), { description: t('auth.signOutBody') });
    navigate('/login', { replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:pr-2">
        <StaffAvatar
          member={user}
          className="size-8 ring-1 ring-border"
          fallbackClassName="bg-primary text-[11px] text-primary-foreground"
        />
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block max-w-[140px] truncate text-[12.5px] font-semibold leading-tight">
            {user?.name}
          </span>
          <span className="block truncate text-[10.5px] capitalize text-muted-foreground">
            {t(`staff.roles.${user?.role || 'owner'}`)}
          </span>
        </span>
        <ChevronDown className="hidden size-3.5 text-muted-foreground/60 sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>{t('topbar.account')}</DropdownMenuLabel>
        <div className="px-2.5 pb-2">
          <p className="text-[13px] font-semibold">{user?.name}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserRound />
          {t('topbar.profile')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings2 />
          {t('topbar.preferences')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut />
          {t('topbar.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
