'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStaffI18n } from '../../lib/i18n/client';
import * as accountApi from '../../lib/auth/account-api';
import { ApiError } from '../../lib/api/errors';
import { describeError } from '../../lib/menu/error-message';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/**
 * Reset Password. An invalid, expired or already-used token all arrive as the
 * one `PASSWORD_RESET_TOKEN_INVALID` outcome (the Backend deliberately does
 * not distinguish them), so the message covers all three and offers a new
 * link. This deliberately does not use `isUnauthenticatedError`: the Backend
 * answers a bad token with a 401, which here is a normal form error, not an
 * expired Staff session. Passwords stay in local state only, never in a URL.
 */
export function ResetPasswordForm({ token }: { token: string | null }) {
  const { t } = useStaffI18n();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!token) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <Alert variant="error">{t('auth.reset.missingToken')}</Alert>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t('auth.reset.requestNew')}
          </Link>
        </div>
      </Card>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !token) return;

    const nextNewError =
      newPassword.length < PASSWORD_MIN_LENGTH
        ? t('auth.reset.error.tooShort')
        : newPassword.length > PASSWORD_MAX_LENGTH
          ? t('auth.reset.error.tooLong')
          : null;
    const nextConfirmError = confirmPassword === newPassword ? null : t('auth.reset.error.mismatch');
    setNewError(nextNewError);
    setConfirmError(nextConfirmError);
    setFormError(null);
    setTokenRejected(false);
    if (nextNewError || nextConfirmError) return;

    setIsSubmitting(true);
    try {
      await accountApi.resetPassword({ token, newPassword });
      router.push('/login?reset=success');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PASSWORD_RESET_TOKEN_INVALID') {
        setTokenRejected(true);
      }
      setFormError(describeError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {tokenRejected ? (
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            {t('auth.reset.requestNew')}
          </Link>
        ) : null}

        <FormField label={t('auth.reset.new')} htmlFor="reset-new-password" error={newError ?? undefined}>
          <Input
            id="reset-new-password"
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

        <FormField label={t('auth.reset.confirm')} htmlFor="reset-confirm-password" error={confirmError ?? undefined}>
          <Input
            id="reset-confirm-password"
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

        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
        </Button>

        <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">
          {t('auth.backToSignIn')}
        </Link>
      </form>
    </Card>
  );
}
