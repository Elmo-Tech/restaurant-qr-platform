"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { IconActivity, IconGlobe, IconInbox, IconLogout, IconMenu, IconOverview, IconPackage, IconStore, IconUsers } from "@/components/icons";
import { WaytaLockup } from "@/components/brand/Wayta";
import { LanguageSwitch, ThemeSwitch } from "@/components/shell/Preferences";
import { logout, type Admin } from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const NAV: { href: string; label: MessageKey; icon: typeof IconOverview; match: (path: string) => boolean }[] = [
  { href: "/", label: "nav.overview", icon: IconOverview, match: (path) => path === "/" },
  { href: "/restaurants", label: "nav.restaurants", icon: IconStore, match: (path) => path.startsWith("/restaurants") },
  { href: "/packages", label: "nav.packages", icon: IconPackage, match: (path) => path.startsWith("/packages") },
  { href: "/leads", label: "nav.leads", icon: IconUsers, match: (path) => path.startsWith("/leads") },
  { href: "/requests", label: "nav.requests", icon: IconInbox, match: (path) => path.startsWith("/requests") },
  { href: "/team", label: "nav.team", icon: IconUsers, match: (path) => path.startsWith("/team") },
  { href: "/settings", label: "nav.settings", icon: IconGlobe, match: (path) => path.startsWith("/settings") },
  { href: "/activity", label: "nav.activity", icon: IconActivity, match: (path) => path.startsWith("/activity") },
];

function Rail({ admin, onNavigate }: { admin: Admin; onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex h-full flex-col bg-rail text-rail-foreground">
      <div className="px-5 pb-4 pt-5">
        <WaytaLockup tone="dark" size={36} />
        <p className="mt-2 truncate text-xs font-medium text-rail-muted">{t("app.name")}</p>
      </div>

      <nav aria-label={t("nav.menu")} className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                active ? "bg-rail-active text-white" : "text-rail-muted hover:bg-rail-hover hover:text-rail-foreground",
              )}
            >
              {active ? (
                <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-primary-text" />
              ) : null}
              <Icon />
              {t(label)}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-rail-border p-4">
        <div className="flex items-center justify-between gap-2">
          <LanguageSwitch tone="rail" />
          <ThemeSwitch tone="rail" />
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-rail-hover p-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {admin.displayName.trim().charAt(0).toUpperCase() || "P"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{admin.displayName}</p>
            <p dir="ltr" className="truncate text-start text-xs text-rail-muted">
              {admin.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            aria-label={t("nav.signOut")}
            title={t("nav.signOut")}
            className="grid size-8 shrink-0 place-items-center rounded-md text-rail-muted transition-colors hover:bg-rail-active hover:text-white disabled:opacity-50"
          >
            <IconLogout width={18} height={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The signed-in frame: a dark rail on the start side (a drawer on a phone) and the workspace beside it. */
export function ConsoleShell({ admin, children }: { admin: Admin; children: ReactNode }) {
  const { t } = useI18n();
  // The drawer closes when a link inside it is chosen (see `Rail`'s onNavigate).
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:ps-[256px]">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[256px] lg:block">
        <Rail admin={admin} />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={t("common.cancel")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 start-0 w-[280px] max-w-[85vw] shadow-pop">
            <Rail admin={admin} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("nav.menu")}
          className="grid size-9 place-items-center rounded-lg border border-border text-foreground hover:bg-surface-2"
        >
          <IconMenu />
        </button>
        <WaytaLockup size={30} />
        <p className="truncate text-xs font-medium text-muted-foreground">{t("app.name")}</p>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
