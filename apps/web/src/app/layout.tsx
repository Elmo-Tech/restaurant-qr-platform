import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

// DESIGN_SYSTEM.md #24: IBM Plex Sans is the approved V1 Latin typeface.
// FT-10A: its Arabic companion (IBM Plex Sans Arabic) is loaded as the
// fallback for Arabic glyphs, so Arabic Staff and Guest text is set in a
// matching professional face instead of whatever system font happens to be
// installed. Both are exposed as CSS variables and combined on <body> in
// globals.css (Latin glyphs still render in Plex Sans exactly as before).
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans-arabic",
});

export const metadata: Metadata = {
  title: "Restaurant QR Platform",
  description: "Premium QR ordering platform for restaurants and cafes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${ibmPlexSans.variable} ${ibmPlexSansArabic.variable}`}>
        {children}
      </body>
    </html>
  );
}
