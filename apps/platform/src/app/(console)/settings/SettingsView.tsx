"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Card, CardHeader, Input, Label, PageHeader, Skeleton } from "@/components/ui";
import { ApiError, isNetworkFailure } from "@/lib/api/errors";
import {
  getPublicSettings,
  updatePublicSettings,
  type PlatformPublicSettings,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function SettingsView() {
  const { t, fmt } = useI18n();
  const [settings, setSettings] = useState<PlatformPublicSettings | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((loaded) => {
        if (cancelled) return;
        setSettings(loaded);
        setUrl(loaded.poweredByUrl);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setFeedback({
          tone: "danger",
          text: isNetworkFailure(caught)
            ? t("common.unreachable")
            : caught instanceof ApiError && caught.status === 401
              ? t("common.sessionExpired")
              : t("common.error"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = url.trim();
    if (next.length > 2048 || !validHttpsUrl(next)) {
      setUrlError(t("settings.poweredBy.invalid"));
      return;
    }
    setBusy(true);
    setFeedback(null);
    setUrlError(null);
    try {
      const saved = await updatePublicSettings(next);
      setSettings(saved);
      setUrl(saved.poweredByUrl);
      setFeedback({ tone: "success", text: t("settings.saved") });
    } catch (caught) {
      setFeedback({
        tone: "danger",
        text: isNetworkFailure(caught)
          ? t("common.unreachable")
          : caught instanceof ApiError && caught.status === 401
            ? t("common.sessionExpired")
            : t("common.error"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      {feedback ? <Alert tone={feedback.tone} className="mb-4">{feedback.text}</Alert> : null}

      <Card className="max-w-3xl">
        <CardHeader title={t("settings.poweredBy.title")} description={t("settings.poweredBy.description")} />
        {settings ? (
          <form onSubmit={(event) => void save(event)} className="space-y-4 p-5" noValidate>
            <div>
              <Label htmlFor="powered-by-url">{t("settings.poweredBy.label")}</Label>
              <Input
                id="powered-by-url"
                type="url"
                dir="ltr"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setUrlError(null);
                  setFeedback(null);
                }}
                placeholder="https://menu.elmotechsoft.online/"
                maxLength={2048}
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? "powered-by-url-error" : "powered-by-url-hint"}
                className={cn(
                  "text-start",
                  urlError && "border-danger focus:border-danger focus:ring-danger/25",
                )}
              />
              {urlError ? (
                <p id="powered-by-url-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
                  {urlError}
                </p>
              ) : (
                <p id="powered-by-url-hint" className="mt-1.5 text-xs text-muted-foreground">
                  {t("settings.poweredBy.hint")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={busy || url.trim() === settings.poweredByUrl}>
                {busy ? t("common.saving") : t("common.save")}
              </Button>
              <a
                href={settings.poweredByUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary-text underline-offset-4 hover:underline"
              >
                {t("settings.poweredBy.open")}
              </a>
            </div>

            {settings.updatedAt ? (
              <p className="text-xs text-muted-foreground">
                {t("settings.updatedAt", { date: fmt.date(settings.updatedAt) })}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="space-y-3 p-5"><Skeleton className="h-4 w-32" /><Skeleton className="h-10 w-full" /></div>
        )}
      </Card>
    </>
  );
}
