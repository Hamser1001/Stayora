import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Ban,
  Check,
  History,
  KeyRound,
  Lock,
  Minus,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { api } from '@/api';
import { useApiResource } from '@/hooks/useApiResource';
import { useMoney } from '@/hooks/useMoney';
import { useAuth } from '@/contexts/AuthContext';
import { MODULES, ROLE_MODULES, ROLES } from '@/lib/constants';
import { StaffAvatar } from '@/components/common/StaffAvatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { RecordList, RecordRow } from '@/components/common/RecordList';
import { IconAction } from '@/components/common/IconAction';
import { ErrorState } from '@/components/common/ErrorState';
import { PageSkeleton } from '@/components/ui/loading';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StaffFormDialog } from '@/features/staff/StaffFormDialog';
import { StaffCredentialsDialog } from '@/features/staff/StaffCredentialsDialog';
import { StaffActivitySheet } from '@/features/staff/StaffActivitySheet';

function useMemberActions({ reload, setCredentials }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const changeRole = async (member, role) => {
    try {
      await api.staff.update(member.id, { role });
      toast.success(t('common.success'));
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    }
  };

  const resetPassword = async (member) => {
    setBusy(true);
    try {
      const result = await api.staff.resetPassword(member.id);
      setCredentials({
        name: result.member.name,
        email: result.member.email,
        password: result.temporaryPassword,
      });
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setBusy(false);
    }
  };

  return { busy, changeRole, resetPassword };
}

function MemberMenu({ member, canManage, disabled, onEdit, onActivity, onReset, onStatus, onDelete }) {
  const { t } = useTranslation();
  if (!canManage || member.role === 'owner') {
    return (
      <span className="grid size-8 place-items-center text-muted-foreground/50" title={t('staff.ownerLocked')}>
        <Lock className="size-3.5" />
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('staff.actions')} disabled={disabled}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[196px]">
        <DropdownMenuItem onSelect={() => onEdit(member)}>
          <Pencil className="size-3.5" />
          {t('common.edit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onReset(member)}>
          <KeyRound className="size-3.5" />
          {t('staff.resetPassword')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onActivity(member)}>
          <History className="size-3.5" />
          {t('staff.activity.open')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {member.status === 'suspended' ? (
          <DropdownMenuItem onSelect={() => onStatus(member, 'active')}>
            <PlayCircle className="size-3.5" />
            {t('staff.reactivate')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onStatus(member, 'suspended')}>
            <Ban className="size-3.5" />
            {t('staff.suspend')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(member)}>
          <Trash2 className="size-3.5" />
          {t('common.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StaffPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const money = useMoney();
  const canManage = ['owner', 'manager'].includes(user?.role);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [activityMember, setActivityMember] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [working, setWorking] = useState(false);

  const { data, loading, error, reload } = useApiResource(() => api.staff.list(), []);
  const members = useMemo(() => data || [], [data]);
  const { busy, changeRole, resetPassword } = useMemberActions({ reload, setCredentials });

  const activeCount = members.filter((member) => member.status === 'active').length;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (member) => {
    setEditing(member);
    setFormOpen(true);
  };

  const confirmStatus = async () => {
    setWorking(true);
    try {
      await api.staff.updateStatus(statusTarget.id, statusTarget.nextStatus);
      toast.success(
        statusTarget.nextStatus === 'suspended'
          ? t('staff.suspendedToast', { name: statusTarget.name })
          : t('staff.reactivatedToast', { name: statusTarget.name }),
      );
      setStatusTarget(null);
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setWorking(false);
    }
  };

  const confirmRemove = async () => {
    setWorking(true);
    try {
      await api.staff.remove(removing.id);
      toast.success(t('staff.removed', { name: removing.name }));
      setRemoving(null);
      await reload();
    } catch (err) {
      toast.error(err.message || t('errors.body'));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;

  const actionsFor = (member) => ({
    onEdit: openEdit,
    onReset: resetPassword,
    onActivity: setActivityMember,
    onStatus: (target, nextStatus) => setStatusTarget({ ...target, nextStatus }),
    onDelete: setRemoving,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('staff.title')}
        subtitle={t('staff.subtitle')}
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground numeric">
            <span className="size-1.5 rounded-full bg-status-available" />
            {t('staff.activeMembers', { count: activeCount })}
            <span className="text-muted-foreground/50">/ {members.length}</span>
          </span>
        }
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <UserPlus className="size-4" />
              {t('staff.create')}
            </Button>
          ) : null
        }
      />

      <RecordList>
        {members.map((member) => {
          const isMe = member.id === user?.id;
          const owner = member.role === 'owner';
          const customAccess =
            member.permissions?.length > 0 &&
            member.role !== 'owner' &&
            [...member.permissions].sort().join(',') !==
              [...(ROLE_MODULES[member.role] || [])].sort().join(',');
          return (
            <RecordRow key={member.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StaffAvatar
                    member={member}
                    className="size-9 shrink-0"
                    fallbackClassName="text-[10.5px]"
                  />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 truncate text-[13px] font-semibold leading-tight">
                      {member.name}
                      {isMe ? (
                        <span className="rounded bg-primary-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-primary">
                          {t('staff.you')}
                        </span>
                      ) : null}
                      {member.mustChangePassword ? (
                        <span className="rounded bg-status-reserved-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-status-reserved">
                          {t('staff.pendingPassword')}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <MemberMenu
                  member={member}
                  canManage={canManage}
                  disabled={busy}
                  {...actionsFor(member)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(value) => changeRole(member, value)}
                  disabled={!canManage || owner}
                >
                  <SelectTrigger className="h-8 flex-1 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role} disabled={role === 'owner' && user?.role !== 'owner'}>
                        {t(`staff.roles.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusBadge status={member.status} dot={false} />
              </div>

              <p className="text-[10.5px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{t('staff.moduleAccess')}:</span>{' '}
                {owner
                  ? t('staff.allModules')
                  : customAccess
                    ? t('staff.customModules', { count: member.permissions.length })
                    : t('staff.rolePresetModules')}
              </p>

              <p className="text-[10.5px] text-muted-foreground">
                {t('staff.lastActive')} ·{' '}
                {member.lastActive ? money.dateTime(member.lastActive) : t('staff.never')}
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
              <TableHead>{t('staff.moduleAccess')}</TableHead>
              <TableHead>{t('staff.status')}</TableHead>
              <TableHead>{t('staff.lastActive')}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isMe = member.id === user?.id;
              const owner = member.role === 'owner';
              const customAccess =
                member.permissions?.length > 0 &&
                member.role !== 'owner' &&
                [...member.permissions].sort().join(',') !==
                  [...(ROLE_MODULES[member.role] || [])].sort().join(',');
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <StaffAvatar member={member} className="size-8" fallbackClassName="text-[10px]" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {member.name}
                          {isMe ? (
                            <span className="rounded bg-primary-soft px-1 text-[9.5px] font-semibold uppercase tracking-wide text-primary">
                              {t('staff.you')}
                            </span>
                          ) : null}
                          {member.mustChangePassword ? (
                            <span className="rounded bg-status-reserved-soft px-1 text-[9px] font-semibold uppercase tracking-wide text-status-reserved">
                              {t('staff.pendingPassword')}
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
                        disabled={!canManage || owner}
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
                      {owner ? <Lock className="size-3 text-muted-foreground/60" /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-[11.5px] text-muted-foreground">
                    {owner
                      ? t('staff.allModules')
                      : customAccess
                        ? t('staff.customModules', { count: member.permissions.length })
                        : t('staff.rolePresetModules')}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={member.status} dot={false} />
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">
                    {member.lastActive ? money.dateTime(member.lastActive) : t('staff.never')}
                  </TableCell>
                  <TableCell>
                    <MemberMenu
                      member={member}
                      canManage={canManage}
                      disabled={busy}
                      {...actionsFor(member)}
                    />
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
                {MODULES.filter((module) => ROLE_MODULES[role]?.includes(module)).map((module) => (
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
                    className="h-9 whitespace-nowrap px-2 text-center text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
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
                    const allowed = ROLE_MODULES[role]?.includes(module);
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

      <StaffFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        member={editing}
        onSaved={reload}
        onCreated={setCredentials}
      />

      <StaffCredentialsDialog
        open={Boolean(credentials)}
        onOpenChange={(open) => {
          if (!open) setCredentials(null);
        }}
        credentials={credentials}
      />

      <StaffActivitySheet
        open={Boolean(activityMember)}
        onOpenChange={(open) => {
          if (!open) setActivityMember(null);
        }}
        member={activityMember}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing ? t('staff.removeTitle', { name: removing.name }) : ''}
        description={t('staff.removeBody')}
        confirmLabel={t('staff.deletePermanently')}
        destructive
        loading={working}
        onConfirm={confirmRemove}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title={
          statusTarget
            ? t(
                statusTarget.nextStatus === 'suspended'
                  ? 'staff.suspendTitle'
                  : 'staff.reactivateTitle',
                { name: statusTarget.name },
              )
            : ''
        }
        description={
          statusTarget?.nextStatus === 'suspended'
            ? t('staff.suspendBody')
            : t('staff.reactivateBody')
        }
        confirmLabel={
          statusTarget?.nextStatus === 'suspended' ? t('staff.suspend') : t('staff.reactivate')
        }
        destructive={statusTarget?.nextStatus === 'suspended'}
        loading={working}
        onConfirm={confirmStatus}
      />
    </div>
  );
}
