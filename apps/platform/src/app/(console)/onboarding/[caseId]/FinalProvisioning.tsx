"use client";

import Link from "next/link";
import { useId, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input } from "@/components/ui";
import type { OnboardingCase } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { onboardingErrorKey, provisionAction } from "@/lib/onboarding-menu";
import { describedBy, Field } from "./fields";

export function FinalProvisioning({ data, disabled, busy, dirty, expired, onFinish, onReload }: {
  data: OnboardingCase;
  disabled: boolean;
  busy: boolean;
  dirty: boolean;
  expired: boolean;
  onFinish: (route: "provision" | "retry", password: string | undefined) => void;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const action = provisionAction(data);
  const isDemo = data.mode === "DEMO";
  const recovery = action !== null && data.status !== "READY_FOR_REVIEW";
  const ready = data.status === "READY" || data.status === "DELIVERED";
  const showForm = action !== null && !dirty && (isDemo || !expired || recovery) && !disabled;
  const passwordRequired = !isDemo && data.ownerPasswordRequired;
  const errorCode = data.lastErrorCode && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.lastErrorCode) ? data.lastErrorCode : null;
  const errorKey = onboardingErrorKey(errorCode) ?? (isDemo ? "onboarding.final.demoFailed" : "onboarding.final.provisionFailed");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy || !showForm) return;
    const input = event.currentTarget.querySelector<HTMLInputElement>("input[type=password]");
    const password = passwordRequired ? input?.value : undefined;
    // The password lives in this input and the active request only, never in wizard state.
    if (input) input.value = "";
    if (passwordRequired && password === undefined) return;
    onFinish(action, password);
  }

  if (data.status === "CANCELLED") return null;
  return (
    <Card>
      <CardHeader title={t("onboarding.final.title")} description={t(isDemo ? "onboarding.final.demoHint" : "onboarding.final.hint")} />
      <div className="space-y-3 p-5" aria-busy={busy}>
        {ready && isDemo ? <Alert tone="success">{t("onboarding.final.demoReady")}</Alert> : null}
        {ready && !isDemo ? (
          <Alert tone="success">
            <p>{t("onboarding.final.ready")}</p>
            {data.restaurantId ? <Link href={`/restaurants/${encodeURIComponent(data.restaurantId)}`} className="mt-1 inline-block font-medium underline">
              {t("onboarding.final.restaurant")}
            </Link> : null}
          </Alert>
        ) : null}
        {data.status === "FAILED" ? (
          <Alert tone="danger">
            <p className="font-medium">{t("onboarding.final.failed")}</p>
            <p>{t(errorKey)} {errorCode ? <bdi className="break-all font-mono text-xs">({errorCode})</bdi> : null}</p>
          </Alert>
        ) : null}
        {data.status === "PROVISIONING" || data.status === "MENU_SETUP" ? <Alert>{t("onboarding.final.resumeHint")}</Alert> : null}
        {!ready && !recovery && (!action || dirty || (!isDemo && expired)) ? (
          <p className="text-sm text-muted-foreground">{t(dirty ? "onboarding.final.pending" : isDemo ? "onboarding.final.demoIncomplete" : "onboarding.final.incomplete")}</p>
        ) : null}
        {showForm && action ? (
          <form key={`${data.status}:${passwordRequired}`} onSubmit={submit} className="space-y-3">
            {passwordRequired ? (
              <Field id={id} className="w-full max-w-sm" label={t("onboarding.final.password")} hint={t("onboarding.final.passwordHint")}>
                <Input id={id} type="password" required minLength={8} maxLength={128} autoComplete="new-password" dir="ltr"
                  disabled={busy} {...describedBy(id, true, null)} />
              </Field>
            ) : recovery && !isDemo ? <p className="text-sm text-muted-foreground">{t("onboarding.final.noPassword")}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={busy}>
                {t(busy ? "onboarding.final.working" : action === "retry" ? "onboarding.final.retry" : recovery ? "onboarding.final.resume" : isDemo ? "onboarding.final.demoStart" : "onboarding.final.start")}
              </Button>
              {recovery ? <Button type="button" disabled={busy} onClick={onReload}>{t("onboarding.final.refresh")}</Button> : null}
            </div>
          </form>
        ) : null}
      </div>
    </Card>
  );
}
