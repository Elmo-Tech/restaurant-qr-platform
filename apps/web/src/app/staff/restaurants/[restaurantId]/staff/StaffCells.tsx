'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { RestaurantMembershipRole } from '../../../../../lib/auth/types';
import { roleDisplayName } from '../../../../../lib/staff/role-display';
import type { MembershipStatus, StaffBranchRef } from '../../../../../lib/staff/types';
import { Badge } from '../../../../../components/ui/Badge';

export function RoleBadge({ kind, name }: { kind: RestaurantMembershipRole; name: string }) {
  const { t } = useStaffI18n();
  return (
    <Badge variant={kind === 'OWNER' ? 'primary' : 'neutral'}>
      <span dir="auto">{roleDisplayName({ kind, name }, t)}</span>
    </Badge>
  );
}

export function MemberStatusBadge({ status }: { status: MembershipStatus }) {
  const { t } = useStaffI18n();
  const variant = status === 'ACTIVE' ? 'success' : status === 'INVITED' ? 'info' : 'neutral';
  return (
    <Badge variant={variant} dot>
      {t(`staff.status.${status}` as const)}
    </Badge>
  );
}

/** "All branches", the assigned branch names (inactive ones muted), or an explicit "no branches" -- never an empty cell. */
export function BranchAccessCell({
  allBranches,
  branches,
}: {
  allBranches: boolean;
  branches: StaffBranchRef[];
}) {
  const { t } = useStaffI18n();

  if (allBranches) {
    return <Badge variant="primary">{t('staff.branchAccess.all')}</Badge>;
  }

  if (branches.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('staff.branchAccess.none')}</span>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {branches.map((branch) => (
        <li key={branch.id}>
          <Badge variant="neutral" className={branch.status === 'ACTIVE' ? undefined : 'opacity-60'}>
            <span dir="auto">
              {branch.status === 'ACTIVE'
                ? branch.name
                : t('staff.branchAccess.inactiveSuffix', { name: branch.name })}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
