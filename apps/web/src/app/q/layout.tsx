import type { Viewport } from 'next';
import { Archivo, Cairo } from 'next/font/google';

// FT-13A: the Guest Menu's display voice. Archivo's width axis gives a
// confident, menu-board condensed headline; Cairo is its Arabic counterpart
// (heavy, legible, familiar to Egyptian guests). Body copy keeps the root
// layout's IBM Plex pair. Scoped to `/q/*` so Staff screens never pay for them.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  axes: ['wdth'],
  weight: 'variable',
  display: 'swap',
});

const cairo = Cairo({
  subsets: ['arabic'],
  variable: '--font-cairo',
  weight: 'variable',
  display: 'swap',
});

// `viewportFit: cover` lets the bottom cart bar respect the iOS home-indicator inset.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3f1ec',
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${archivo.variable} ${cairo.variable}`}>{children}</div>;
}
