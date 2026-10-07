'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as staffApi from '../../../../../lib/staff/api';
import * as branchesApi from '../../../../../lib/branches/api';
import type { BranchItem } from '../../../../../lib/branches/types';
import type { CreateStaffUserResult, StaffMember, StaffRole } from '../../../../../lib/staff/types';
import {
  describeError,
  isUnauthenticatedError,
  redirectToLogin,
} from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { ConfirmDialog } from '../../../../../components/ui/ConfirmDialog';
import { LoadingState } from '../../../../../components/ui/LoadingState';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { EditAccessDialog } from './EditAccessDialog';
import { NewUserDialog } from './NewUserDialog';
import { StaffMembersSection } from './StaffMembersSection';
import { StaffTabs } from './StaffTabs';

export interface StaffWorkspaceProps {
  restaurantId: string;
  /** The signed-in user's own Membership id -- their own row is protected from self-management (the Backend enforces this too). */
  currentMembershipId: string;
  /** `users.manage` -- UX only; the Backend remains the authority on every mutation. */
  canManage: boolean;
  /** Whether the signed-in Membership has Restaurant-wide Branch scope, i.e. may grant "all branches". */
  ownAllBranches: boolean;
  /** The signed-in user's own permissions -- only Roles that grant nothing beyond these are offered (the Backend enforces the same rule). */
  editorPermissions: readonly string[];
}

type PendingConfirm = { kind: 'disable' | 'enable'; member: StaffMember };

/**
 * Staff & Access -- Users (FT-12B). Direct user creation is the primary
 * action; the list shows each user's Role, Branch access and status. Every
 * mutation settles by re-fetching from the Backend (never optimistic -- the
 * Owner-safety rules live server-side, and a rejected change must not look
 * applied). Domain errors are mapped to localized text by `describeError`.
 */
export function StaffWorkspace({
  restaurantId,
  currentMembershipId,
  canManage,
  ownAllBranches,
  editorPermissions,
}: StaffWorkspaceProps) {
  const { t } = useStaffI18n();
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newUserOpen, setNewUserOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const loadRequestRef = useRef(0);
  const restaurantIdRef = useRef(restaurantId);
  useEffect(() => {
    restaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  const loadAll = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const requestedRestaurantId = restaurantId;
    const isStale = () =>
      loadRequestRef.current !== requestId || restaurantIdRef.current !== requestedRestaurantId;
    try {
      const nextMembers = await staffApi.listStaffMembers(restaurantId);
      if (isStale()) return;
      setMembers(nextMembers);
      setLoadError(null);
    } catch (error) {
      if (isStale()) return;
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setLoadError(describeError(error));
    }
    // Assignable Branches and Roles are only needed for the New user / Edit
    // pickers; a failure here must not hide the user list itself.
    try {
      const nextBranches = await branchesApi.listBranches(restaurantId);
      if (!isStale()) setBranches(nextBranches);
    } catch {
      if (!isStale()) setBranches([]);
    }
    try {
      const nextRoles = await staffApi.listStaffRoles(restaurantId);
      if (!isStale()) setRoles(nextRoles);
    } catch {
      if (!isStale()) setRoles([]);
    }
  }, [restaurantId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAll();
    });
  }, [loadAll]);

  async function refreshAfter(message: string) {
    setNotice(message);
    await loadAll();
  }

  const held = new Set(editorPermissions);
  // Never the protected Owner Role, and nothing that grants more than the editor holds.
  const assignableRoles = roles.filter(
    (role) => !role.isProtected && role.permissions.every((permission) => held.has(permission)),
  );

  function handleCreated(email: string, result: CreateStaffUserResult) {
    setNewUserOpen(false);
    void refreshAfter(
      t(result.accountCreated ? 'staff.new.success.created' : 'staff.new.success.attached', { email }),
    );
  }

  async function handleConfirm() {
    if (!confirm || isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      await staffApi.setStaffMembershipEnabled(restaurantId, confirm.member.id, confirm.kind === 'enable');
      setConfirm(null);
      await refreshAfter(
        t(confirm.kind === 'enable' ? 'staff.enable.success' : 'staff.disable.success', {
          email: confirm.member.user.email,
        }),
      );
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        redirectToLogin();
        return;
      }
      setConfirmError(describeError(error));
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('staff.title')}
        description={t('staff.subtitle')}
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setNotice(null);
                setNewUserOpen(true);
              }}
            >
              + {t('staff.newUser')}
            </Button>
          ) : null
        }
      />

      <StaffTabs restaurantId={restaurantId} active="users" />

      {!canManage ? <Alert variant="info">{t('staff.viewOnly')}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {loadError && !members ? (
        <Alert variant="error">
          <div className="flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => void loadAll()}>
              {t('common.retry')}
            </Button>
          </div>
        </Alert>
      ) : !members ? (
        <LoadingState label={t('staff.loading')} />
      ) : (
        <StaffMembersSection
          members={members}
          currentMembershipId={currentMembershipId}
          canManage={canManage}
          onEdit={(member) => {
            setNotice(null);
            setEditTarget(member);
          }}
          onDisable={(member) => {
            setNotice(null);
            setConfirm({ kind: 'disable', member });
          }}
          onEnable={(member) => {
            setNotice(null);
            setConfirm({ kind: 'enable', member });
          }}
        />
      )}

      <NewUserDialog
        open={newUserOpen}
        restaurantId={restaurantId}
        branches={branches}
        roles={assignableRoles}
        canGrantAll={ownAllBranches}
        onClose={() => setNewUserOpen(false)}
        onCreated={handleCreated}
      />

      <EditAccessDialog
        member={editTarget}
        restaurantId={restaurantId}
        branches={branches}
        roles={assignableRoles}
        allRoles={roles}
        canGrantAll={ownAllBranches}
        onClose={() => setEditTarget(null)}
        onSaved={(email) => {
          setEditTarget(null);
          void refreshAfter(t('staff.edit.success', { email }));
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        tone={confirm?.kind === 'enable' ? 'primary' : 'danger'}
        title={
          confirm
            ? t(confirm.kind === 'disable' ? 'staff.disable.title' : 'staff.enable.title', {
                email: confirm.member.user.email,
              })
            : ''
        }
        description={
          confirm ? t(confirm.kind === 'disable' ? 'staff.disable.description' : 'staff.enable.description') : ''
        }
        confirmLabel={
          confirm ? t(confirm.kind === 'disable' ? 'staff.disable.confirm' : 'staff.enable.confirm') : ''
        }
        isSubmitting={isConfirming}
        error={confirmError}
        onConfirm={() => void handleConfirm()}
        onClose={() => {
          setConfirm(null);
          setConfirmError(null);
        }}
      />
    </div>
  );
}
