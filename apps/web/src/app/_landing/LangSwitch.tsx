'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { STAFF_LOCALE_COOKIE, type StaffLocale } from '../../lib/i18n/locale';
import styles from './landing.module.css';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** English | العربية. Saves the same cookie as the rest of the web app, so the choice follows the visitor. */
export function LangSwitch({ locale, label, names }: { locale: StaffLocale; label: string; names: Record<StaffLocale, string> }) {
  const router = useRouter();

  const choose = useCallback(
    (next: StaffLocale) => {
      if (next === locale) return;
      document.cookie = `${STAFF_LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      router.refresh();
    },
    [locale, router],
  );

  return (
    <div className={styles.langSwitch} role="group" aria-label={label}>
      {(['ar', 'en'] as const).map((option) => (
        <button key={option} type="button" lang={option} aria-pressed={option === locale} onClick={() => choose(option)}>
          {names[option]}
        </button>
      ))}
    </div>
  );
}
