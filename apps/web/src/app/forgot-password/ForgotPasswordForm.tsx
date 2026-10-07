'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useStaffI18n } from '../../lib/i18n/client';
import * as accountApi from '../../lib/auth/account-api';
import { describeError } from '../../lib/menu/error-message';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';

/**
 * Forgot Password. The success message is identical whether or not the email
 * belongs to an account (the Backend answers the same way, and this UI never
 * branches on it). The one exception is the development-only recovery link:
 * outside production the Backend returns the reset token only when one was
 * actually issued, and no mail provider exists yet (FT-13), so that link is
 * shown for testing. In a production build `process.env.NODE_ENV` is
 * `production`, the Backend never returns a token, and this panel can never
 * render.
 */
export function ForgotPasswordForm() {
  const { t } = useStaffI18n();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError(t('auth.forgot.error.emailRequired'));
      return;
    }
    setEmailError(null);
    setFormError(null);
    setIsSubmitting(true);

    try {
      const token = await accountApi.requestPasswordReset(trimmedEmail);
      setDevResetToken(process.env.NODE_ENV !== 'production' ? token : null);
      setIsDone(true);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      {isDone ? (
        <div className="flex flex-col gap-4">
          <Alert variant="success">{t('auth.forgot.done')}</Alert>

          {devResetToken ? (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-warning/50 bg-warning-soft p-3">
              <p className="text-sm font-semibold text-warning">{t('auth.forgot.dev.title')}</p>
              <p className="text-xs text-secondary-foreground">{t('auth.forgot.dev.description')}</p>
              <Link
                href={`/reset-password?token=${encodeURIComponent(devResetToken)}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('auth.forgot.dev.open')}
              </Link>
            </div>
          ) : null}

          <Link href="/login" className="text-sm font-medium text-primary hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <FormField label={t('auth.email')} htmlFor="forgot-email" error={emailError ?? undefined}>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              value={email}
              disabled={isSubmitting}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
            />
          </FormField>

          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
          </Button>

          <Link href="/login" className="text-center text-sm font-medium text-primary hover:underline">
            {t('auth.backToSignIn')}
          </Link>
        </form>
      )}
    </Card>
  );
}
