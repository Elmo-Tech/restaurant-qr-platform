import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/ConsoleShell";
import { Alert } from "@/components/ui";
import { platformServerGet } from "@/lib/api/server-fetch";
import type { Admin } from "@/lib/api/platform";
import { getI18n } from "@/lib/i18n/server";

/**
 * Everything behind the sign-in. The session is checked on the server for every request: a real 401 goes
 * to the sign-in page, while an unreachable API shows a clear message instead of looking "signed out".
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
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
  return <ConsoleShell admin={me.data}>{children}</ConsoleShell>;
}
