'use client';

import type { ReactNode } from 'react';
import { useStaffI18n } from '../../lib/i18n/client';
import { StaffLanguageSwitcher } from '../staff/StaffLanguageSwitcher';

/**
 * The one shared frame for every signed-out screen (Login, Forgot Password,
 * Reset Password): the Restaurant Ops brand mark, a language switcher, a
 * single `h1`, and the form card below. Must render inside a
 * `StaffI18nProvider` (each auth page provides one) so it follows the same
 * EN/AR + RTL behavior as the Staff app.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  /** Page heading. Falls back to the product name (Login). */
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useStaffI18n();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              R
            </span>
            <span className="text-sm font-semibold text-foreground">{t('shell.productName')}</span>
          </div>
          <StaffLanguageSwitcher />
        </div>

        <h1 className="text-xl font-semibold text-foreground">{title ?? t('shell.productName')}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
