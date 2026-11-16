import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Lock, Minus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useAuth } from '@/contexts/AuthContext';
import { ROLES } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import { initials, cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RecordList, RecordRow } from '@/components/common/RecordList';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InviteMemberDialog } from '@/features/staff/InviteMemberDialog';

const MODULES = [
  'dashboard',
  'rooms',
  'reservations',
  'guests',
  'payments',
  'expenses',
  'housekeeping',
  'reports',
  'staff',
  'settings',
];

const ROLE_ACCESS = {
  owner: new Set(MODULES),
  manager: new Set(MODULES.filter((module) => module !== 'settings')),
  receptionist: new Set(['dashboard', 'rooms', 'reservations', 'guests', 'housekeeping']),
  accountant: new Set(['dashboard', 'payments', 'expenses', 'reports']),
  housekeeping: new Set(['dashboard', 'rooms', 'housekeeping']),
};

export function StaffPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useApiResource(() => api.staff.list(), []);
  const members = useMemo(() => data || [], [data]);

  const changeRole = async (member, role) => {
    try {
      await api.staff.update(member.id, { role });
      toast.success(t('common.success'));
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  const removeMember = async () => {
    setBusy(true);
    try {
      await api.staff.remove(removing.id);
      toast.success(t('staff.removed', { name: removing.name }));
      setRemoving(null);
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground numeric">
            <span className="size-1.5 rounded-full bg-status-available" />
            {t('staff.activeMembers', { count: members.length })}
          </span>
        }
        actions={
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" />
            {t('staff.invite')}
          </Button>
        }
      />

      <RecordList>
        {members.map((member) => {
          const isMe = member.name === user?.name;
          const isOwner = member.role === 'owner';
          return (
            <RecordRow key={member.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-[10.5px]">{initials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold leading-tight">
                      {member.name}
                      {isMe ? (
                        <span className="rounded bg-primary-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          {t('staff.you')}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-destructive disabled:text-muted-foreground/40"
                  disabled={isOwner}
                  aria-label={t('common.delete')}
                  onClick={() => setRemoving(member)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(value) => changeRole(member, value)}
                  disabled={isOwner}
                >
                  <SelectTrigger className="h-8 flex-1 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`staff.roles.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusBadge status={member.status} dot={false} />
                {isOwner ? <Lock className="size-3 shrink-0 text-muted-foreground/60" /> : null}
              </div>

              <p className="text-[10.5px] text-muted-foreground">
                {t('staff.lastActive')} ·{' '}
                {member.lastActive
                  ? formatDateTime(member.lastActive, { lang: i18n.language })
                  : t('staff.never')}
              </p>
            </RecordRow>
          );
        })}
      </RecordList>

      <Card className="hidden overflow-hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('staff.role')}</TableHead>
              <TableHead>{t('staff.status')}</TableHead>
              <TableHead>{t('staff.lastActive')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isMe = member.name === user?.name;
              const isOwner = member.role === 'owner';
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-[10px]">{initials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {member.name}
                          {isMe ? (
                            <span className="rounded bg-primary-soft px-1 text-[9.5px] font-semibold uppercase tracking-wide text-primary">
                              {t('staff.you')}
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-[10.5px] text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(value) => changeRole(member, value)}
                        disabled={isOwner}
                      >
                        <SelectTrigger className="h-7 w-[150px] text-[11.5px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`staff.roles.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isOwner ? <Lock className="size-3 text-muted-foreground/60" /> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.status} dot={false} />
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {member.lastActive
                      ? formatDateTime(member.lastActive, { lang: i18n.language })
                      : t('staff.never')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive disabled:text-muted-foreground/40"
                      disabled={isOwner}
                      aria-label={t('common.delete')}
                      onClick={() => setRemoving(member)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-start gap-2.5 border-b border-border/70 px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary">
            <ShieldCheck className="size-4" strokeWidth={1.9} />
          </span>
          <div>
            <h3 className="font-display text-[14px] font-semibold">{t('staff.permissionsTitle')}</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{t('staff.permissionMatrix')}</p>
          </div>
        </div>
        <div className="divide-y divide-border/60 lg:hidden">
          {ROLES.map((role) => (
            <div key={role} className="px-4 py-3">
              <p className="text-[12.5px] font-semibold">{t(`staff.roles.${role}`)}</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                {t(`staff.roleDescriptions.${role}`)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MODULES.filter((module) => ROLE_ACCESS[role]?.has(module)).map((module) => (
                  <span
                    key={module}
                    className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                  >
                    {t(`staff.modules.${module}`)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border/80">
                <th className="h-9 whitespace-nowrap px-4 pl-5 text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                  {t('staff.role')}
                </th>
                {MODULES.map((module) => (
                  <th
                    key={module}
                    className="h-9 whitespace-nowrap px-2 text-center text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
                  >
                    {t(`staff.modules.${module}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5 pl-5">
                    <p className="text-[12.5px] font-medium">{t(`staff.roles.${role}`)}</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {t(`staff.roleDescriptions.${role}`)}
                    </p>
                  </td>
                  {MODULES.map((module) => {
                    const allowed = ROLE_ACCESS[role]?.has(module);
                    return (
                      <td key={module} className="px-2 py-2.5 text-center">
                        {allowed ? (
                          <Check className="mx-auto size-3.5 text-status-available" strokeWidth={2.6} />
                        ) : (
                          <Minus className="mx-auto size-3.5 text-muted-foreground/30" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} onSaved={reload} />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? t('staff.removeTitle', { name: removing.name }) : ''}
        description={t('staff.removeBody')}
        confirmLabel={t('common.delete')}
        destructive
        loading={busy}
        onConfirm={removeMember}
      />
    </div>
  );
}
