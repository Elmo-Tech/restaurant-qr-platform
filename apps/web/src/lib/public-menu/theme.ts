/**
 * FT-13B: the Guest Menu theme. Dark is the default. The Guest's choice lives in
 * a cookie (not localStorage) so the SERVER can render the right theme on the
 * very first paint -- no flash -- the same pattern the Staff UI language uses.
 * Scoped to `/q` so it is never sent with Staff requests.
 */
export const GUEST_THEMES = ['dark', 'light'] as const;
export type GuestTheme = (typeof GUEST_THEMES)[number];

export const DEFAULT_GUEST_THEME: GuestTheme = 'dark';
export const GUEST_THEME_COOKIE = 'guest_theme';
export const GUEST_THEME_COOKIE_PATH = '/q';
export const GUEST_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Matches `--g-bg`; the browser chrome (address bar) follows the theme. */
export const GUEST_THEME_COLORS: Record<GuestTheme, string> = {
  dark: '#12100E',
  light: '#FBF6EE',
};

export function resolveGuestTheme(cookieValue: string | undefined): GuestTheme {
  return cookieValue === 'light' || cookieValue === 'dark' ? cookieValue : DEFAULT_GUEST_THEME;
}
