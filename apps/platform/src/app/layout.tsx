import type { Metadata } from "next";
import "./globals.css";
import fonts from "@/fonts/fonts.module.css";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Wayta Console",
  description: "Internal console of the Wayta platform team.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, dir } = await getI18n();
  return (
    // `data-theme` is set by the init script before paint, so React must not treat it as a mismatch.
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${fonts.inter} ${fonts.plexArabic}`}>
        <ThemeProvider>
          <I18nProvider locale={locale}>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
