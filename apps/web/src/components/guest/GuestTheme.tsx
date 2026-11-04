'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  GUEST_THEME_COOKIE,
  GUEST_THEME_COOKIE_MAX_AGE,
  GUEST_THEME_COOKIE_PATH,
  type GuestTheme,
} from '../../lib/public-menu/theme';

interface GuestThemeValue {
  theme: GuestTheme;
  toggleTheme: () => void;
  /** Sets the theme; `persist` also remembers it in the guest's cookie (a guest's own pick), default true. */
  setTheme: (theme: GuestTheme, persist?: boolean) => void;
}

const GuestThemeContext = createContext<GuestThemeValue | null>(null);

/**
 * The root of every `/q/*` page: carries `data-guest-theme` (which switches the
 * `--g-*` tokens), the page background and the base text colour. The initial
 * theme comes from the cookie on the server, so the first paint is already right;
 * toggling updates state and rewrites the cookie. Colours cross-fade (0.3s, off
 * under reduced motion -- see globals.css).
 */
export function GuestThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: GuestTheme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<GuestTheme>(initialTheme);

  const remember = useCallback((next: GuestTheme) => {
    try {
      document.cookie = `${GUEST_THEME_COOKIE}=${next}; Path=${GUEST_THEME_COOKIE_PATH}; Max-Age=${GUEST_THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch {
      // A blocked cookie only means the choice does not survive a refresh.
    }
  }, []);

  const setTheme = useCallback(
    (next: GuestTheme, persist = true) => {
      setThemeState(next);
      if (persist) remember(next);
    },
    [remember],
  );

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: GuestTheme = current === 'dark' ? 'light' : 'dark';
      remember(next);
      return next;
    });
  }, [remember]);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return (
    <GuestThemeContext.Provider value={value}>
      <div
        data-guest-theme={theme}
        className="guest-root min-h-dvh bg-g-bg text-g-text transition-colors duration-300"
      >
        {children}
      </div>
    </GuestThemeContext.Provider>
  );
}

export function useGuestTheme(): GuestThemeValue {
  const value = useContext(GuestThemeContext);
  if (!value) throw new Error('useGuestTheme must be used inside <GuestThemeProvider>');
  return value;
}
