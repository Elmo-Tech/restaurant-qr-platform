'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FormField } from '../../components/ui/FormField';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { useStaffI18n } from '../../lib/i18n/client';
import { messages, type MessageKey } from '../../lib/i18n/messages';

interface LoginResponse {
  data: { userId: string };
}

/**
 * Real login against the existing Backend contract (`POST /auth/login`,
 * Section 5): no frontend-generated token, no password storage -- a
 * successful call sets the Backend's HttpOnly session cookie directly via
 * `Set-Cookie`, and this component only reacts to that outcome.
 */
export function LoginForm({ showResetSuccess = false }: { showResetSuccess?: boolean }) {
  const router = useRouter();
  const { t } = useStaffI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      router.push('/staff');
    } catch (error) {
      if (error instanceof ApiError) {
        const key = `error.${error.code}`;
        setErrorMessage(key in messages.en ? t(key as MessageKey) : error.message);
      } else {
        setErrorMessage(t('error.network'));
      }
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {showResetSuccess && !errorMessage ? <Alert variant="success">{t('auth.resetSuccess')}</Alert> : null}
        {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

        <FormField label={t('auth.email')} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
          />
        </FormField>

        <FormField label={t('auth.password')} htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
          />
          <Link
            href="/forgot-password"
            className="self-end text-sm font-medium text-primary hover:underline"
          >
            {t('auth.forgotLink')}
          </Link>
        </FormField>

        <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
          {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
    </Card>
  );
}
