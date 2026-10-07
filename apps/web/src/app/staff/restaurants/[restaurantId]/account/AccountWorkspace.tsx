'use client';

import { useState, type FormEvent } from 'react';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import * as accountApi from '../../../../../lib/auth/account-api';
import { ApiError } from '../../../../../lib/api/errors';
import { describeError, redirectToLogin } from '../../../../../lib/menu/error-message';
import { Alert } from '../../../../../components/ui/Alert';
import { Button } from '../../../../../components/ui/Button';
import { FormField } from '../../../../../components/ui/FormField';
import { Input } from '../../../../../components/ui/Input';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { SectionCard } from '../../../../../components/ui/SectionCard';

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Account (FT-12): change password. Reached from the top bar's user area, not
 * the Restaurant navigation. Passwords live only in this component's local
 * state for the duration of the form -- never logged, stored, or put in a
 * URL -- and are cleared on success. A wrong current password is a normal
 * field error here (`401 INVALID_CURRENT_PASSWORD`), so this deliberately
 * does NOT use `isUnauthenticatedError`, which would treat every 401 as an
 * expired session.
 */
export function AccountWorkspace({ email }: { email: string }) {
  const { t } = useStaffI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const nextCurrentError = currentPassword ? null : t('account.password.error.currentRequired');
    const nextNewError =
      newPassword.length < PASSWORD_MIN_LENGTH
        ? t('account.password.error.tooShort')
        : newPassword.length > PASSWORD_MAX_LENGTH
          ? t('account.password.error.tooLong')
          : newPassword === currentPassword
            ? t('account.password.error.same')
            : null;
    const nextConfirmError = confirmPassword === newPassword ? null : t('account.password.error.mismatch');

    setCurrentError(nextCurrentError);
    setNewError(nextNewError);
    setConfirmError(nextConfirmError);
    setFormError(null);
    setSuccess(false);
    if (nextCurrentError || nextNewError || nextConfirmError) return;

    setIsSubmitting(true);
    try {
      await accountApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setCurrentError(describeError(error));
      } else if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
        redirectToLogin();
        return;
      } else {
        setFormError(describeError(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('account.title')} description={t('account.subtitle')} />

      <SectionCard title={t('account.password.heading')} description={t('account.password.description')}>
        <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-5" noValidate>
          <p className="text-sm text-muted-foreground">
            {t('account.email')}{' '}
            <span dir="ltr" className="font-medium text-foreground">
              {email}
            </span>
          </p>

          {success ? <Alert variant="success">{t('account.password.success')}</Alert> : null}
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <FormField label={t('account.password.current')} htmlFor="current-password" error={currentError ?? undefined}>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              disabled={isSubmitting}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setCurrentError(null);
              }}
            />
          </FormField>

          <FormField label={t('account.password.new')} htmlFor="new-password" error={newError ?? undefined}>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              disabled={isSubmitting}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setNewError(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t('account.password.hint')}</p>
          </FormField>

          <FormField label={t('account.password.confirm')} htmlFor="confirm-password" error={confirmError ?? undefined}>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              disabled={isSubmitting}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmError(null);
              }}
            />
          </FormField>

          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('account.password.submitting') : t('account.password.submit')}
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
