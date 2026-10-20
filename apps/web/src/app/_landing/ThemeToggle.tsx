'use client';

import { useCallback } from 'react';
import { THEME_COOKIE } from './theme';
import styles from './landing.module.css';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Light / dark switch for the landing page. The page starts in the visitor's system theme (or the one they
 * chose last time, kept in a cookie so the server renders it without a flash); one click flips it. The
 * icon shown is decided in CSS from the active theme, so it is right before any script runs.
 */
export function ThemeToggle({ labelDark, labelLight }: { labelDark: string; labelLight: string }) {
  const flip = useCallback(() => {
    const root = document.querySelector<HTMLElement>('[data-landing-root]');
    if (!root) return;
    const current = root.dataset.theme;
    const isDark = current === 'dark' || (current === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }, []);

  return (
    <button type="button" className={styles.themeToggle} onClick={flip} aria-label={`${labelDark} / ${labelLight}`} title={`${labelDark} / ${labelLight}`}>
      <svg className={styles.iconMoon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />
      </svg>
      <svg className={styles.iconSun} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
      </svg>
    </button>
  );
}
