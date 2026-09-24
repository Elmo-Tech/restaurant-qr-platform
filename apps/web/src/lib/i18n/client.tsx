'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { directionOf, STAFF_LOCALE_COOKIE, type StaffLocale } from './locale';
import { formatDateTime, formatDayMonth, formatTime } from './format';
import { createTranslator, type Translator } from './translate';

export interface StaffI18nValue extends Translator {
  dir: 'ltr' | 'rtl';
  isRtl: boolean;
  formatDateTime: (value: string | Date) => string;
  formatTime: (value: string | Date) => string;
  formatDayMonth: (value: string | Date) => string;
  /** Saves the preference (cookie) and refreshes so Server Components re-render in the new language. */
  setLocale: (next: StaffLocale) => void;
}

const StaffI18nContext = createContext<StaffI18nValue | null>(null);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * FT-10A: provides the Staff UI language to every Client Component. The
 * `locale` prop comes from the server (cookie / Accept-Language), so the
 * first paint already has the right `lang`/`dir`. This wrapper also mirrors
 * them onto `<html>` -- dialogs and other portalled UI live outside this
 * subtree and inherit direction from the document -- and restores English/LTR
 * when the Staff area unmounts (Guest pages manage their own direction).
 *
 * Nothing here touches Menu CONTENT languages: those are separate data.
 */
export function StaffI18nProvider({
  locale,
  children,
  className,
}: {
  locale: StaffLocale;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const dir = directionOf(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dir;
    return () => {
      root.lang = 'en';
      root.dir = 'ltr';
    };
  }, [locale, dir]);

  const setLocale = useCallback(
    (next: StaffLocale) => {
      document.cookie = `${STAFF_LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const value = useMemo<StaffI18nValue>(
    () => ({
      ...createTranslator(locale),
      dir,
      isRtl: dir === 'rtl',
      formatDateTime: (v) => formatDateTime(v, locale),
      formatTime: (v) => formatTime(v, locale),
      formatDayMonth: (v) => formatDayMonth(v, locale),
      setLocale,
    }),
    [locale, dir, setLocale],
  );

  return (
    <StaffI18nContext.Provider value={value}>
      <div lang={locale} dir={dir} className={className}>
        {children}
      </div>
    </StaffI18nContext.Provider>
  );
}

/** Client Components: `const { t, tp, locale, formatDateTime } = useStaffI18n();` */
export function useStaffI18n(): StaffI18nValue {
  const value = useContext(StaffI18nContext);
  if (!value) {
    throw new Error('useStaffI18n must be used inside <StaffI18nProvider>.');
  }
  return value;
}
