import type { Viewport } from 'next';
import { cookies } from 'next/headers';
import { Archivo, Lalezar } from 'next/font/google';
import { GuestThemeProvider } from '../../components/guest/GuestTheme';
import {
  GUEST_THEME_COLORS,
  GUEST_THEME_COOKIE,
  resolveGuestTheme,
} from '../../lib/public-menu/theme';

// FT-13B "Ember & Saffron" type: Lalezar is the display voice (section titles, product
// titles, "طلبك"); Archivo -- with its width axis -- carries the Latin brand name and every
// number. Body copy keeps the root layout's IBM Plex pair. Scoped to `/q/*`, so Staff never
// loads them.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  axes: ['wdth'],
  weight: 'variable',
  display: 'swap',
});

const lalezar = Lalezar({
  subsets: ['arabic', 'latin'],
  variable: '--font-lalezar',
  weight: '400',
  display: 'swap',
});

// `viewportFit: cover` lets the cart bar respect the home-indicator inset; the browser
// chrome colour follows the Guest's theme cookie.
export async function generateViewport(): Promise<Viewport> {
  const cookieStore = await cookies();
  const theme = resolveGuestTheme(cookieStore.get(GUEST_THEME_COOKIE)?.value);
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: GUEST_THEME_COLORS[theme],
  };
}

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = resolveGuestTheme(cookieStore.get(GUEST_THEME_COOKIE)?.value);
  return (
    <div className={`${archivo.variable} ${lalezar.variable}`}>
      <GuestThemeProvider initialTheme={theme}>{children}</GuestThemeProvider>
    </div>
  );
}
