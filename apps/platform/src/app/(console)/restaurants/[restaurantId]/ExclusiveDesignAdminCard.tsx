"use client";

import { useState } from "react";
import { Alert, Button, Card, CardHeader, Label, Select } from "@/components/ui";
import {
  EXCLUSIVE_RENDERERS,
  PACKAGE_TEMPLATES,
  type ExclusiveRendererKey,
  setExclusiveDesign,
  type ExclusiveBaseTemplate,
  type ExclusiveDesignStatus,
  type ExclusiveDesignView,
} from "@/lib/api/platform";
import { ApiError } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n/client";

export function ExclusiveDesignAdminCard({
  restaurantId,
  current,
  onSaved,
}: {
  restaurantId: string;
  current: ExclusiveDesignView | null;
  onSaved: (value: ExclusiveDesignView) => void;
}) {
  const { t } = useI18n();
  const [baseTemplate, setBaseTemplate] = useState<ExclusiveBaseTemplate>(
    current?.baseTemplate ?? "CLASSIC",
  );
  const [status, setStatus] = useState<ExclusiveDesignStatus>(
    current?.status ?? "RESERVED",
  );
  // No silent default: assigning a bespoke design is a deliberate choice of exactly one of them.
  const [rendererKey, setRendererKey] = useState<ExclusiveRendererKey | "">(current?.rendererKey ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"conflict" | "generic" | null>(null);
  const [saved, setSaved] = useState(false);
  const rendererMissing = status === "ACTIVE_CUSTOM" && rendererKey === "";
  const changed = !current || baseTemplate !== current.baseTemplate || status !== current.status ||
    (status === "ACTIVE_CUSTOM" && rendererKey !== current.rendererKey);
  const needsConfirmation = (status === "ACTIVE_BASE" || status === "ACTIVE_CUSTOM") &&
    (current?.status !== status || current?.baseTemplate !== baseTemplate || current?.rendererKey !== rendererKey);

  async function save() {
    if (busy || !changed || rendererMissing || (needsConfirmation && !confirmed)) return;
    setBusy(true);
    setSaved(false);
    setProblem(null);
    try {
      const next = await setExclusiveDesign(restaurantId, { baseTemplate, status,
      ...(status === "ACTIVE_CUSTOM" && rendererKey !== "" ? { rendererKey } : {}) });
      onSaved(next);
      setSaved(true);
      setConfirmed(false);
    } catch (error) {
      setProblem(error instanceof ApiError && error.status === 409 ? "conflict" : "generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("exclusive.title")}
        description={t("exclusive.description")}
      />
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t("exclusive.current")}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {current
              ? `${current.baseTemplate} · ${t(
                  current.status === "RESERVED"
                    ? "exclusive.reserved"
                    : current.status === "ACTIVE_BASE"
                      ? "exclusive.active"
                      : current.status === "ACTIVE_CUSTOM"
                        ? "exclusive.custom"
                        : "exclusive.disabled",
                )}`
              : t("exclusive.none")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="exclusive-base">{t("exclusive.base")}</Label>
            <Select
              id="exclusive-base"
              value={baseTemplate}
              disabled={busy}
              onChange={(e) => {
                setBaseTemplate(e.target.value as ExclusiveBaseTemplate);
                setConfirmed(false);
                setSaved(false);
              }}
            >
              {(["CLASSIC", ...PACKAGE_TEMPLATES] as const).map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="exclusive-status">{t("exclusive.mode")}</Label>
            <Select
              id="exclusive-status"
              value={status}
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value as ExclusiveDesignStatus);
                setConfirmed(false);
                setSaved(false);
              }}
            >
              <option value="RESERVED">{t("exclusive.reserved")}</option>
              <option value="ACTIVE_BASE">{t("exclusive.active")}</option>
              <option value="ACTIVE_CUSTOM">Bespoke design (exclusive)</option>
              <option value="DISABLED">{t("exclusive.disabled")}</option>
            </Select>
          </div>
        </div>
        {status === "ACTIVE_CUSTOM" ? (
          <div>
            <Label htmlFor="exclusive-renderer">Bespoke renderer</Label>
            <Select
              id="exclusive-renderer"
              value={rendererKey}
              disabled={busy}
              onChange={(e) => {
                setRendererKey(e.target.value as ExclusiveRendererKey | "");
                setProblem(null);
                setConfirmed(false);
                setSaved(false);
              }}
            >
              <option value="">{t("exclusive.rendererChoose")}</option>
              {EXCLUSIVE_RENDERERS.map((renderer) => (
                <option key={renderer.key} value={renderer.key}>{renderer.label}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {status === "ACTIVE_CUSTOM" ? (
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs leading-6 text-foreground">
            The selected bespoke renderer will be shown only for this Restaurant’s QR. Before activating, verify this is the contracted tenant for that design and review its live menu. This is not a stock template.
          </p>
        ) : null}
        {status === "RESERVED" ? (
          <p className="rounded-lg bg-surface-2 p-3 text-xs leading-6 text-muted-foreground">
            {t("exclusive.reservedHint")}
          </p>
        ) : null}
        {needsConfirmation ? (
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-surface-2 p-3 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            {t("exclusive.publishConfirm")}
          </label>
        ) : null}
        {problem ? (
          <Alert tone="danger">{problem === "conflict" ? t("exclusive.rendererConflict") : t("common.error")}</Alert>
        ) : null}
        {rendererMissing ? <Alert tone="warning">{t("exclusive.rendererRequired")}</Alert> : null}
        {saved ? <Alert tone="success">{t("exclusive.saved")}</Alert> : null}
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !changed || (needsConfirmation && !confirmed)}
        >
          {busy ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </Card>
  );
}
