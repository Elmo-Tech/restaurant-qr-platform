import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

// DESIGN_SYSTEM.md #24: IBM Plex Sans is the approved V1 Latin typeface.
// Only the Latin subset/weights this foundation actually uses are loaded --
// Arabic font loading and full weight scale are deferred to whichever batch
// first needs them (Section 3: do not over-engineer this foundation).
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Restaurant QR Platform",
  description: "Premium QR ordering platform for restaurants and cafes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${ibmPlexSans.className} bg-[#FCFBF9] text-[#1D1A18]`}>
        {children}
      </body>
    </html>
  );
}
