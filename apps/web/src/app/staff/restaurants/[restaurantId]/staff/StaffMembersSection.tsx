'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { StaffMember } from '../../../../../lib/staff/types';
import { Badge } from '../../../../../components/ui/Badge';
import { Button } from '../../../../../components/ui/Button';
import { EmptyState } from '../../../../../components/ui/EmptyState';
import { SectionCard } from '../../../../../components/ui/SectionCard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/Table';
import { IconStaff } from '../../../../../components/staff/icons';
import { BranchAccessCell, MemberStatusBadge, RoleBadge } from './StaffCells';

export interface StaffMembersSectionProps {
  members: StaffMember[];
  currentMembershipId: string;
  canManage: boolean;
  onEdit: (member: StaffMember) => void;
  onDisable: (member: StaffMember) => void;
  onEnable: (member: StaffMember) => void;
}

function MemberIdentity({ member, isSelf }: { member: StaffMember; isSelf: boolean }) {
  const { t } = useStaffI18n();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span dir="ltr" className="min-w-0 truncate text-sm font-medium text-foreground">
        {member.user.email}
      </span>
      {isSelf ? <Badge variant="primary">{t('staff.you')}</Badge> : null}
    </div>
  );
}

function MemberActions({
  member,
  isSelf,
  canManage,
  onEdit,
  onDisable,
  onEnable,
}: { member: StaffMember; isSelf: boolean } & Pick<
  StaffMembersSectionProps,
  'canManage' | 'onEdit' | 'onDisable' | 'onEnable'
>) {
  const { t } = useStaffI18n();

  if (!canManage) return null;

  if (isSelf) {
    return <span className="text-xs text-muted-foreground">{t('staff.action.protectedSelf')}</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {member.role !== 'OWNER' ? (
        <Button variant="ghost" size="sm" onClick={() => onEdit(member)}>
          {t('staff.action.edit')}
        </Button>
      ) : null}
      {member.status === 'DISABLED' ? (
        <Button variant="ghost" size="sm" onClick={() => onEnable(member)}>
          {t('staff.action.enable')}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          onClick={() => onDisable(member)}
        >
          {t('staff.action.disable')}
        </Button>
      )}
    </div>
  );
}

/** Active, invited and disabled Staff Memberships -- a table from `md` up, stacked cards below it (a table does not become readable by shrinking). */
export function StaffMembersSection(props: StaffMembersSectionProps) {
  const { t } = useStaffI18n();
  const { members, currentMembershipId, canManage } = props;

  return (
    <SectionCard
      title={t('staff.members.heading')}
      description={t('staff.members.description')}
      icon={<IconStaff />}
    >
      {members.length === 0 ? (
        <EmptyState
          compact
          icon={<IconStaff />}
          title={t('staff.members.empty.title')}
          description={t('staff.members.empty.description')}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('staff.col.member')}</TableHead>
                  <TableHead>{t('staff.col.role')}</TableHead>
                  <TableHead>{t('staff.col.branchAccess')}</TableHead>
                  <TableHead>{t('staff.col.status')}</TableHead>
                  {canManage ? <TableHead>{t('staff.col.actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const isSelf = member.id === currentMembershipId;
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="max-w-[260px]">
                        <MemberIdentity member={member} isSelf={isSelf} />
                      </TableCell>
                      <TableCell>
                        <RoleBadge kind={member.role} name={member.roleName} />
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <BranchAccessCell allBranches={member.allBranches} branches={member.branches} />
                      </TableCell>
                      <TableCell>
                        <MemberStatusBadge status={member.status} />
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <MemberActions member={member} isSelf={isSelf} {...props} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {members.map((member) => {
              const isSelf = member.id === currentMembershipId;
              return (
                <li key={member.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <MemberIdentity member={member} isSelf={isSelf} />
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleBadge kind={member.role} name={member.roleName} />
                    <MemberStatusBadge status={member.status} />
                  </div>
                  <BranchAccessCell allBranches={member.allBranches} branches={member.branches} />
                  {canManage ? (
                    <div className="border-t border-border pt-2">
                      <MemberActions member={member} isSelf={isSelf} {...props} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}
