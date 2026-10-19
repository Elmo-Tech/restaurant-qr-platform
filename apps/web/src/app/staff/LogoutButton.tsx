'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api/client';
import { ApiError } from '../../lib/api/errors';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { useStaffI18n } from '../../lib/i18n/client';

const HTTP_UNAUTHENTICATED = 401;

/**
 * Uses the real `POST /auth/logout` (AuthGuard + CsrfGuard, Section 17):
 * revokes the Backend AuthSession and clears the cookie via its own
 * `Set-Cookie`/`clearCookie` response before returning to `/login` --
 * frontend state is never cleared without the Backend session actually
 * ending first.
 *
 * Targeted fix (Section 1): a logout failure must not pretend success. Only
 * a genuine `204` or a `401` (the session was already invalid, so there is
 * nothing left to revoke) redirects to `/login`. Any other Backend error, or
 * a network/unknown failure, leaves the User in the Staff shell with a
 * small inline error and an enabled retry -- the Backend AuthSession may
 * still be valid, so silently redirecting would misrepresent that as a
 * successful sign-out.
 */
export function LogoutButton({ variant = 'default' }: { variant?: 'default' | 'sidebar' }) {
  const router = useRouter();
  const { t } = useStaffI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogout() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === HTTP_UNAUTHENTICATED) {
        router.push('/login');
        router.refresh();
        return;
      }

      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : t('error.network'),
      );
      setIsSubmitting(false);
    }
  }

  if (variant === 'sidebar') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isSubmitting}
          aria-label={isSubmitting ? t('shell.signingOut') : t('shell.logout')}
          title={isSubmitting ? t('shell.signingOut') : t('shell.logout')}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-sidebar-muted-foreground outline-none transition-colors hover:bg-sidebar hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="rtl:-scale-x-100"
          >
            <path d="M9.5 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
            <path d="M14 8.5 18 12l-4 3.5" />
            <path d="M18 12H9.5" />
          </svg>
        </button>
        {errorMessage ? (
          <div className="absolute bottom-full end-0 z-10 mb-2 w-60">
            <Alert variant="error">{errorMessage}</Alert>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <Button variant="secondary" onClick={handleLogout} disabled={isSubmitting}>
        {isSubmitting ? t('shell.signingOut') : t('shell.logout')}
      </Button>
      {errorMessage ? (
        <div className="absolute end-0 top-full z-10 mt-2 w-64">
          <Alert variant="error">{errorMessage}</Alert>
        </div>
      ) : null}
    </div>
  );
}
