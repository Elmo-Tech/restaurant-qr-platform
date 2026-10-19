'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { BranchItem } from '../../../../../lib/branches/types';
import type { CreateStaffUserResult, StaffRole } from '../../../../../lib/staff/types';
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
import { Input } from '../../../../../components/ui/Input';
import { Select } from '../../../../../components/ui/Select';
import { BranchScopeField } from './BranchScopeField';

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export interface NewUserDialogProps {
  open: boolean;
  restaurantId: string;
  branches: BranchItem[];
  /** Roles this user may assign (never Owner, nothing beyond their own permissions). */
  roles: StaffRole[];
  canGrantAll: boolean;
  onClose: () => void;
  /** Fires once the Backend created the user; `accountCreated` is false when the email already had an account. */
  onCreated: (email: string, result: CreateStaffUserResult) => void;
}

/**
 * New User (direct creation): email, password + confirmation, Role, Branch
 * access and Active. The admin sets the password directly; the new user signs
 * in with it normally. For an email that already has an account the Backend
 * ignores the password and only adds the Restaurant access. Mounted only while
 * open, so every open starts from a clean form and a typed password never
 * outlives the dialog.
 */
export function NewUserDialog({ open, ...rest }: NewUserDialogProps) {
  if (!open) return null;
  return <NewUserForm {...rest} />;
}

function NewUserForm({
  restaurantId,
  branches,
  roles,
  canGrantAll,
  onClose,
  onCreated,
}: Omit<NewUserDialogProps, 'open'>) {
  const { t } = useStaffI18n();
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string>(
    () => roles.find((role) => role.kind === 'WAITER')?.id ?? roles[0]?.id ?? '',
  );
  const [scope, setScope] = useState({ allBranches: canGrantAll, branchIds: [] as string[] });
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedEmail = email.trim();
    if (!roleId) {
      setFormError(t('staff.new.noRoles'));
      return;
    }
    const nextEmailError = !trimmedEmail
      ? t('staff.new.error.emailRequired')
      : !SIMPLE_EMAIL_PATTERN.test(trimmedEmail)
        ? t('staff.new.error.emailInvalid')
        : null;
    const nextScopeError =
      !scope.allBranches && scope.branchIds.length === 0 ? t('staff.scope.error.noneSelected') : null;
    const nextPasswordError =
      password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH
        ? t('staff.new.error.passwordLength')
        : null;
    // Confirmation is a form check only -- confirmPassword is never sent.
    const nextConfirmError = confirmPassword === password ? null : t('staff.new.error.passwordMismatch');
    setEmailError(nextEmailError);
    setScopeError(nextScopeError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);
    if (nextEmailError || nextScopeError || nextPasswordError || nextConfirmError) return;

    setIsSubmitting(true);
    try {
      const result = await staffApi.createStaffUser(restaurantId, {
        email: trimmedEmail,
        roleId,
        allBranches: scope.allBranches,
        branchIds: scope.allBranches ? [] : scope.branchIds,
        active,
        password,
      });
      onCreated(trimmedEmail.toLowerCase(), result);
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
      title={t('staff.new.title')}
      subtitle={t('staff.new.subtitle')}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? t('staff.new.submitting') : t('staff.new.submit')}
      onSubmit={handleSubmit}
      onClose={onClose}
      initialFocusRef={emailRef}
    >
      <div className="flex flex-col gap-5">
        {formError ? <Alert variant="error">{formError}</Alert> : null}

        <FormField label={t('staff.new.email')} htmlFor="new-user-email" error={emailError ?? undefined}>
          <Input
            ref={emailRef}
            id="new-user-email"
            type="email"
            dir="ltr"
            autoComplete="off"
            placeholder={t('staff.new.emailPlaceholder')}
            value={email}
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>

        <FormField label={t('staff.new.password')} htmlFor="new-user-password" error={passwordError ?? undefined}>
          <Input
            id="new-user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={isSubmitting}
            onChange={(event) => {
              setPassword(event.target.value);
              setPasswordError(null);
              setConfirmError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">{t('staff.new.password.hint')}</p>
        </FormField>

        <FormField label={t('staff.new.passwordConfirm')} htmlFor="new-user-password-confirm" error={confirmError ?? undefined}>
          <Input
            id="new-user-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={isSubmitting}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmError(null);
            }}
          />
          <p className="text-xs text-muted-foreground">{t('staff.new.password.existingNote')}</p>
        </FormField>

        <FormField label={t('staff.new.role')} htmlFor="new-user-role">
          <Select
            id="new-user-role"
            value={roleId}
            disabled={isSubmitting || roles.length === 0}
            onChange={(event) => setRoleId(event.target.value)}
          >
            {roles.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {roleDisplayName(candidate, t)}
              </option>
            ))}
          </Select>
          {roles.length === 0 ? <p className="text-xs text-muted-foreground">{t('staff.new.noRoles')}</p> : null}
        </FormField>

        <BranchScopeField
          idPrefix="new-user"
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-primary"
            checked={active}
            disabled={isSubmitting}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{t('staff.new.active')}</span>
            <span className="text-xs text-muted-foreground">{t('staff.new.activeHint')}</span>
          </span>
        </label>
      </div>
    </Dialog>
  );
}
