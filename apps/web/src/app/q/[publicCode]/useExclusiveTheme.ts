'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useGuestTheme } from '../../../components/guest/GuestTheme';
import type { GuestTheme } from '../../../lib/public-menu/theme';

const QUERY = '(prefers-color-scheme: dark)';
const subscribeScheme = (listener: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const systemIsDark = () => window.matchMedia(QUERY).matches;

/**
 * Light / dark mode of an exclusive renderer, shared with the base Guest Menu: the guest's pick lives in the same
 * `guest_theme` cookie, so the SERVER renders it on the first paint (no flash). Order of precedence: the guest's own
 * pick (cookie), else the Restaurant's default (light, dark or "system", which CSS resolves from the device before
 * any script runs); the staff preview only ever starts from the Restaurant's default.
 */
export function useExclusiveTheme({
  guestTheme,
  defaultMode,
  designPreview,
}: {
  /** The guest's saved pick, read from the cookie on the server (null = never chose). */
  guestTheme: GuestTheme | null;
  defaultMode: GuestTheme | 'system';
  designPreview: boolean;
}) {
  const { setTheme } = useGuestTheme();
  const deviceDark = useSyncExternalStore(subscribeScheme, systemIsDark, () => false);
  const [pick, setPick] = useState<GuestTheme | null>(designPreview ? null : guestTheme);
  /** What the markup is rendered with (`system` is resolved by CSS from the device). */
  const attr: GuestTheme | 'system' = pick ?? defaultMode;
  /** The mode actually showing, for the switch's icon and state. */
  const effective: GuestTheme = attr === 'system' ? (deviceDark ? 'dark' : 'light') : attr;

  const toggle = useCallback(() => {
    const next: GuestTheme = effective === 'dark' ? 'light' : 'dark';
    setPick(next);
    setTheme(next, !designPreview);
  }, [designPreview, effective, setTheme]);

  // Keep the page chrome (background behind the menu) in step without remembering it as a pick.
  useEffect(() => {
    setTheme(effective, false);
  }, [effective, setTheme]);

  return { attr, effective, toggle };
}
