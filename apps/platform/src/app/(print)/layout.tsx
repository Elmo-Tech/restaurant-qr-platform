import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { Admin } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";

/** Documents meant for paper or PDF (no console frame). Same sign-in rule as the console. */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  const me = await platformServerGet<Admin>("/auth/me");
  if (!me.ok && me.status === 401) redirect("/login");
  if (!me.ok) {
    const { t } = await getI18n();
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <Alert tone="danger">{t("common.unreachable")}</Alert>
      </main>
    );
  }
  return <>{children}</>;
}
