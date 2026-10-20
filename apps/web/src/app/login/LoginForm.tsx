'use client';

import { useState, type FormEvent, type SVGProps } from 'react';
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

function PasswordVisibilityIcon({ visible, ...props }: SVGProps<SVGSVGElement> & { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
          <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15.8 15.8 0 0 1-2.2 3.1" />
          <path d="M6.2 6.2C4.2 7.6 3 10 3 12c0 0 3.5 7 9 7 1.4 0 2.7-.4 3.8-1" />
        </>
      ) : (
        <>
          <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
    </svg>
  );
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
  const [showPassword, setShowPassword] = useState(false);
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
          <div className="relative" dir="ltr">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              className="pe-11"
            />
            <button
              type="button"
              aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
              aria-pressed={showPassword}
              title={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
              onClick={() => setShowPassword((visible) => !visible)}
              disabled={isSubmitting}
              className="absolute inset-y-1 end-1 inline-flex w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PasswordVisibilityIcon visible={showPassword} className="size-5" />
            </button>
          </div>
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
