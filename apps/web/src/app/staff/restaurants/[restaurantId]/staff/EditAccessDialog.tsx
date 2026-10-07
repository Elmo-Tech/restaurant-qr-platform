'use client';

import { useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { BranchItem } from '../../../../../lib/branches/types';
import type { StaffMember, StaffRole } from '../../../../../lib/staff/types';
import { roleDisplayName } from '../../../../../lib/staff/role-display';
import * as staffApi from '../../../../../lib/staff/api';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Dialog } from '../../../../../components/ui/Dialog';
import { FormField } from '../../../../../components/ui/FormField';
import { Select } from '../../../../../components/ui/Select';
import { BranchScopeField } from './BranchScopeField';

export interface EditAccessDialogProps {
  member: StaffMember | null;
  restaurantId: string;
  branches: BranchItem[];
  /** Roles this user may assign (never Owner, nothing beyond their own permissions). */
  roles: StaffRole[];
  /** Every Role of the Restaurant, so the member's CURRENT role is always shown even if it is not one this user may assign. */
  allRoles: StaffRole[];
  canGrantAll: boolean;
  onClose: () => void;
  onSaved: (email: string) => void;
}

export function EditAccessDialog(props: EditAccessDialogProps) {
  const { member, ...rest } = props;
  if (!member) return null;
  // Keyed by member so reopening for another person never carries stale form state.
  return <EditAccessForm key={member.id} member={member} {...rest} />;
}

function EditAccessForm({
  member,
  restaurantId,
  branches,
  roles,
  allRoles,
  canGrantAll,
  onClose,
  onSaved,
}: Omit<EditAccessDialogProps, 'member'> & { member: StaffMember }) {
  const { t } = useStaffI18n();
  const [roleId, setRoleId] = useState<string>(member.roleId);
  const [scope, setScope] = useState({
    allBranches: member.allBranches,
    branchIds: member.branches.map((branch) => branch.id),
  });
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The assignable Roles, plus the member's current Role so it is never silently swapped.
  const optionRoles = roles.some((role) => role.id === member.roleId)
    ? roles
    : [...allRoles.filter((role) => role.id === member.roleId), ...roles];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextScopeError =
      !scope.allBranches && scope.branchIds.length === 0 ? t('staff.scope.error.noneSelected') : null;
    setScopeError(nextScopeError);
    setFormError(null);
    if (nextScopeError) return;

    setIsSubmitting(true);
    try {
      await staffApi.updateStaffMembership(restaurantId, member.id, {
        roleId,
        allBranches: scope.allBranches,
        branchIds: scope.allBranches ? [] : scope.branchIds,
      });
      onSaved(member.user.email);
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setFormError(describeError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      title={t('staff.edit.title')}
      subtitle={member.user.email}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('common.saving') : t('staff.edit.submit')}
      onSubmit={handleSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <FormField label={t('staff.new.role')} htmlFor="edit-role">
          <Select
            id="edit-role"
            value={roleId}
            disabled={isSubmitting}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {optionRoles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {roleDisplayName(candidate, t)}
              </option>
            ))}
          </Select>
        </FormField>

        <BranchScopeField
          idPrefix="edit"
          branches={branches}
          canGrantAll={canGrantAll}
          value={scope}
          onChange={(next) => {
            setScope(next);
            setScopeError(null);
          }}
          error={scopeError ?? undefined}
          disabled={isSubmitting}
        />
      </div>
    </Dialog>
  );
}
