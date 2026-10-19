"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { login } from "@/lib/api/platform";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n/client";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <Input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={busy || !email || !password}>
        {busy ? t("login.submitting") : t("login.submit")}
      </Button>
    </form>
  );
}
