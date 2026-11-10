import type { Metadata } from "next";
import "./globals.css";
import fonts from "../fonts/root.module.css";

// DESIGN_SYSTEM.md #24: IBM Plex Sans is the approved V1 Latin typeface.
// FT-10A: its Arabic companion (IBM Plex Sans Arabic) is loaded as the
// fallback for Arabic glyphs, so Arabic Staff and Guest text is set in a
// matching professional face instead of whatever system font happens to be
// installed. Both are exposed as CSS variables and combined on <body> in
// globals.css (Latin glyphs still render in Plex Sans exactly as before).
// The files are self-hosted (src/fonts, see its README), not fetched from Google at build time.

export const metadata: Metadata = {
  metadataBase: new URL('https://waytaapp.com'),
  title: "Wayta",
  description: "Premium QR ordering platform for restaurants and cafes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${fonts.plexSans} ${fonts.plexSansArabic}`}>
        {children}
      </body>
    </html>
  );
}
