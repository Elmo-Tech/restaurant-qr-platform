"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label } from "@/components/ui";
import type { OnboardingCase, OnboardingDemoHistory } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { directionOf, type Locale } from "@/lib/i18n/locale";
import { demoAccessStatus, handoffMessage, isHandoffStepOpen, restaurantHandoff } from "@/lib/onboarding-handoff";

export function HandoffStep({ data, demoLink, busy, disabled, onDeliver, onReload, onReview }: {
  data: OnboardingCase;
  demoLink: string | null;
  busy: boolean;
  disabled: boolean;
  onDeliver: () => void;
  onReload: () => void;
  onReview: () => void;
}) {
  const { t, fmt } = useI18n();
  const isDemo = data.mode === "DEMO";
  const history = isDemo ? data.demoHistory : null;
  const endsAt = data.demoExpiresAt;
  const [openedAt] = useState(Date.now);
  const [elapsedExpiry, setElapsedExpiry] = useState<string | null>(null);
  useEffect(() => {
    if (!endsAt || !Number.isFinite(Date.parse(endsAt))) return;
    const timer = window.setTimeout(() => setElapsedExpiry(endsAt), Math.max(0, Date.parse(endsAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [endsAt]);
  const demoState = demoAccessStatus(data, elapsedExpiry && elapsedExpiry === endsAt ? Infinity : openedAt);
  const links = restaurantHandoff(data);
  const delivered = data.status === "DELIVERED";
  const availableDemoLink = isDemo && !delivered && demoState === "active" ? demoLink : null;
  const canAffirm = data.status === "READY" && (isDemo ? demoState === "active" : links !== null);

  if (!isHandoffStepOpen(data)) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-sm font-semibold">{t("onboarding.handoff.notReady")}</p>
        <p className="text-sm text-muted-foreground">{t("onboarding.handoff.notReadyHint")}</p>
        {data.status !== "CANCELLED" ? <Button type="button" disabled={busy} onClick={onReview}>{t("onboarding.handoff.review")}</Button> : null}
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-4" aria-busy={busy}>
      {delivered ? (
        <Alert tone="success">{data.deliveredAt
          ? t("onboarding.handoff.deliveredAt", { when: fmt.dateTime(data.deliveredAt) })
          : t("onboarding.handoff.delivered")}</Alert>
      ) : null}
      {isDemo ? (
        <>
          {history ? <DemoHistory history={history} currentExpiry={demoState === "removed" ? null : endsAt} /> : null}
          {demoState === "removed" ? <Alert>{t("onboarding.handoff.demoRemoved")}</Alert> : null}
          {demoState === "expired" ? (
            <Alert tone="warning">
              <p className="font-medium">{t("onboarding.handoff.demoExpired")}</p>
              <DemoRecovery expired disabled={busy} onReload={onReload} />
            </Alert>
          ) : null}
          {availableDemoLink && endsAt ? (
            <>
              <Card className="border-primary/40">
                <CardHeader title={t("onboarding.handoff.demoTitle")} description={t("onboarding.handoff.demoOnce")} />
                <div className="p-5">
                  <ShareLink label={t("onboarding.handoff.demoLink")} copyLabel={t("onboarding.handoff.copyDemo")} value={availableDemoLink} disabled={disabled} />
                </div>
              </Card>
              <ShareMessages details={{ demoLink: availableDemoLink, expiresAt: endsAt }} disabled={disabled} />
            </>
          ) : demoState === "active" && !delivered ? (
            <Alert tone="warning">
              <p className="font-medium">{t("onboarding.handoff.demoInterrupted")}</p>
              <p className="mt-1">{t("onboarding.handoff.demoInterruptedHint")}</p>
              <DemoRecovery expired={false} disabled={busy} onReload={onReload} />
            </Alert>
          ) : null}
        </>
      ) : links ? (
        <>
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
            <Card>
              <CardHeader title={t("onboarding.handoff.links")} description={t("onboarding.handoff.linksHint")} />
              <div className="space-y-5 p-5">
                <ShareLink label={t("onboarding.handoff.guestLink")} copyLabel={t("onboarding.handoff.copyGuest")}
                  openLabel={t("onboarding.handoff.openGuest")} value={links.guestMenuUrl} disabled={disabled} />
                <ShareLink label={t("onboarding.handoff.staffLink")} copyLabel={t("onboarding.handoff.copyStaff")}
                  openLabel={t("onboarding.handoff.openStaff")} value={links.staffLoginUrl} disabled={disabled} />
                <p className="text-sm text-muted-foreground">{t("onboarding.handoff.passwordHint")}</p>
              </div>
            </Card>
            <GenericQr key={links.guestMenuUrl} guestMenuUrl={links.guestMenuUrl} disabled={disabled} />
          </div>
          <ShareMessages details={links} disabled={disabled} />
        </>
      ) : null}
      {(isDemo ? demoState === "missing" : !links) ? (
        <Alert tone="warning">
          <p>{t("onboarding.handoff.unavailable")}</p>
          <Button type="button" className="mt-2" disabled={busy} onClick={onReload}>{t("onboarding.final.refresh")}</Button>
        </Alert>
      ) : null}
      {canAffirm ? (
        <DeliveryConfirmation key={data.revision} isDemo={isDemo} disabled={disabled} busy={busy} onDeliver={() => {
          if (!isDemo || demoAccessStatus(data, Date.now()) === "active") onDeliver();
          else if (endsAt) setElapsedExpiry(endsAt);
        }} />
      ) : null}
    </div>
  );
}

function DemoRecovery({ expired, disabled, onReload }: { expired: boolean; disabled: boolean; onReload: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <p className="mt-2">{t(expired ? "onboarding.handoff.demoRecoveryExpired" : "onboarding.handoff.demoRecoveryActive")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href="/demos" className="inline-flex min-h-10 items-center font-semibold underline">{t("onboarding.handoff.openDemos")}</Link>
        <Button type="button" disabled={disabled} onClick={onReload}>{t("onboarding.final.refresh")}</Button>
      </div>
    </>
  );
}

function DemoHistory({ history, currentExpiry }: { history: OnboardingDemoHistory; currentExpiry: string | null }) {
  const { t, fmt } = useI18n();
  const dateTime = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? fmt.dateTime(value) : "—";
  const fields = [
    [t("demos.col.label"), history.label],
    [t("demos.col.kind"), t(`demos.kind.${history.kind}`)],
    [t("demos.col.package"), history.packageName ?? t("demos.package.all")],
    [t("onboarding.handoff.demoCreated"), dateTime(history.createdAt)],
    [t(currentExpiry && currentExpiry !== history.expiresAt ? "onboarding.handoff.originalExpiry" : "demos.col.ends"), dateTime(history.expiresAt)],
    ...(currentExpiry && currentExpiry !== history.expiresAt ? [[t("demos.col.ends"), dateTime(currentExpiry)]] : []),
    ...(history.removedAt ? [[t("onboarding.handoff.demoRemovedAt"), dateTime(history.removedAt)]] : []),
  ];
  return (
    <Card>
      <CardHeader title={t("onboarding.handoff.demoHistory")} />
      <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium wrap-break-word"><bdi>{value}</bdi></dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ShareLink({ label, copyLabel, openLabel, value, disabled }: { label: string; copyLabel: string; openLabel?: string; value: string; disabled: boolean }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} readOnly disabled={disabled} dir="ltr" value={value} className="text-start font-mono"
        spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
      <div className="flex flex-wrap items-start gap-x-3">
        <CopyButton label={copyLabel} value={value} disabled={disabled} />
        {openLabel && !disabled ? (
          <a href={value} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center text-sm font-medium text-primary-text hover:underline">{openLabel}</a>
        ) : null}
      </div>
    </div>
  );
}

function ShareMessages({ details, disabled }: { details: Parameters<typeof handoffMessage>[1]; disabled: boolean }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t("onboarding.handoff.messages")} description={t("onboarding.handoff.messagesHint")} />
      <div className="grid min-w-0 gap-4 p-5 md:grid-cols-2">
        {(["en", "ar"] as const).map((locale) => (
          <ShareMessage key={locale} locale={locale} value={handoffMessage(locale, details)} disabled={disabled} />
        ))}
      </div>
    </Card>
  );
}

function ShareMessage({ locale, value, disabled }: { locale: Locale; value: string; disabled: boolean }) {
  const { t } = useI18n();
  const id = useId();
  const arabic = locale === "ar";
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{t(arabic ? "onboarding.handoff.arMessage" : "onboarding.handoff.enMessage")}</Label>
      <textarea id={id} lang={locale} dir={directionOf(locale)} readOnly value={value} disabled={disabled} rows={6}
        spellCheck={false} onFocus={(event) => event.currentTarget.select()}
        className="w-full resize-y rounded-lg border border-border-strong bg-surface-2 p-3 text-start text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/25" />
      <CopyButton label={t(arabic ? "onboarding.handoff.copyAr" : "onboarding.handoff.copyEn")} value={value} disabled={disabled} />
    </div>
  );
}

function CopyButton({ label, value, disabled }: { label: string; value: string; disabled: boolean }) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);
  async function copy() {
    setFeedback(null);
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("copied");
    } catch {
      setFeedback("failed");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" className="min-h-10" disabled={disabled} onClick={() => void copy()}>{label}</Button>
      <span role="status" className="text-xs text-muted-foreground">{feedback ? t(`onboarding.handoff.copy.${feedback}`) : null}</span>
    </div>
  );
}

function GenericQr({ guestMenuUrl, disabled }: { guestMenuUrl: string; disabled: boolean }) {
  const { t } = useI18n();
  const [png, setPng] = useState<string | null | false>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let ignore = false;
    // Match the Staff export's high error correction, 4-module quiet zone and high-resolution PNG.
    void import("qrcode").then(({ default: qr }) => qr.toDataURL(guestMenuUrl, {
      errorCorrectionLevel: "H", margin: 4, width: 960, color: { dark: "#000000", light: "#ffffff" },
    })).then((result) => { if (!ignore) setPng(result); }, () => { if (!ignore) setPng(false); });
    return () => { ignore = true; };
  }, [guestMenuUrl, attempt]);
  return (
    <Card>
      <CardHeader title={t("onboarding.handoff.qrTitle")} description={t("onboarding.handoff.qrHint")} />
      <div className="space-y-3 p-5" aria-busy={png === null}>
        {png ? (
          <>
            {/* The same local PNG is shown and downloaded; no remote image optimization request. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={t("onboarding.handoff.qrAlt")} src={png} width={960} height={960} className="mx-auto h-auto w-full max-w-48 rounded-lg border border-border" />
            {!disabled ? <a href={png} download="guest-menu-qr.png"
              className="inline-flex min-h-10 items-center rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2">
              {t("onboarding.handoff.qrDownload")}
            </a> : null}
          </>
        ) : png === false ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-danger">{t("onboarding.handoff.qrError")}</p>
            <Button type="button" disabled={disabled} onClick={() => { setPng(null); setAttempt((value) => value + 1); }}>{t("common.retry")}</Button>
          </div>
        ) : <p role="status" className="text-sm text-muted-foreground">{t("onboarding.handoff.qrLoading")}</p>}
      </div>
    </Card>
  );
}

function DeliveryConfirmation({ isDemo, disabled, busy, onDeliver }: { isDemo: boolean; disabled: boolean; busy: boolean; onDeliver: () => void }) {
  const { t } = useI18n();
  const [affirmed, setAffirmed] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (affirmed && !disabled && !busy) {
      setAffirmed(false);
      onDeliver();
    }
  }
  return (
    <Card>
      <CardHeader title={t("onboarding.handoff.deliveryTitle")} description={t("onboarding.handoff.deliveryHint")} />
      <form onSubmit={submit} className="space-y-3 p-5">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input className="size-4 shrink-0 accent-primary" type="checkbox" required checked={affirmed} disabled={disabled || busy}
            onChange={(event) => setAffirmed(event.currentTarget.checked)} />
          {t(isDemo ? "onboarding.handoff.affirmDemo" : "onboarding.handoff.affirmRestaurant")}
        </label>
        <Button type="submit" variant="primary" disabled={!affirmed || disabled || busy}>
          {t(busy ? "onboarding.handoff.delivering" : "onboarding.handoff.deliver")}
        </Button>
      </form>
    </Card>
  );
}
