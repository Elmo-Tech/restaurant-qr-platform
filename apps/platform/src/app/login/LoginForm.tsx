"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type SVGProps } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { login } from "@/lib/api/platform";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n/client";

function PasswordVisibilityIcon({ visible, ...props }: SVGProps<SVGSVGElement> & { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
          <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15.8 15.8 0 0 1-2.2 3.1" />
          <path d="M6.2 6.2C4.2 7.6 3 10 3 12c0 0 3.5 7 9 7 1.4 0 2.7-.4 3.8-1" />
        </>
      ) : (
        <>
          <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      )}
    </svg>
  );
}

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setBusy(false);
      setError(
        isNetworkFailure(caught)
          ? t("common.unreachable")
          : caught instanceof ApiError && (caught.status === 401 || caught.status === 400)
            ? t("login.invalid")
            : t("common.error"),
      );
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Label htmlFor="email">{t("login.email")}</Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="password">{t("login.password")}</Label>
        <div className="relative" dir="ltr">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pe-11"
          />
          <button
            type="button"
            aria-label={t(showPassword ? "login.hidePassword" : "login.showPassword")}
            aria-pressed={showPassword}
            title={t(showPassword ? "login.hidePassword" : "login.showPassword")}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-1 end-1 inline-flex w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <PasswordVisibilityIcon visible={showPassword} className="size-5" />
          </button>
        </div>
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !email || !password}>
        {busy ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
