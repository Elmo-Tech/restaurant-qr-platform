import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { WaytaLockup } from "@/components/brand/Wayta";
import { LanguageSwitch, ThemeSwitch } from "@/components/shell/Preferences";
import { Card } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { Admin } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const me = await platformServerGet<Admin>("/auth/me");
  if (me.ok) redirect("/");
  const { t } = await getI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <main className="relative grid place-items-center px-4 py-10">
        <div className="absolute end-4 top-4 flex items-center gap-2">
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
        <div className="w-full max-w-[400px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <WaytaLockup size={44} className="mb-5 lg:hidden" />
            <h1 className="text-[22px] font-semibold tracking-tight">{t("login.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </div>
          <Card className="p-6">
            <LoginForm />
          </Card>
          <p className="mt-5 text-center text-xs text-muted-foreground">{t("login.footer")}</p>
        </div>
      </main>
    </div>
  );
}
