"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { ApiError } from "@/lib/api/errors";
import { removeOnboardingCase, type OnboardingCaseSummary } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";
import { REFUSAL_MESSAGE, removalDialog, removalErrorKey, removalRequest } from "@/lib/onboarding-removal";
import { transportErrorKey } from "./shared";

/**
 * Confirms removing one case from the active onboarding list. A routine draft gets a short confirmation; anything
 * that affects a lead, a submitted case, a restaurant, a demo or a delivered account lists exactly what changes and
 * needs an explicit "I understand" (and, for a purged demo, the "never handed off" assertion) first. The server
 * re-checks everything under the case lock; the dialog only explains its decision.
 */
export function RemoveCaseDialog({
  item,
  onClose,
  onRemoved,
  onStale,
}: {
  item: OnboardingCaseSummary;
  onClose: () => void;
  onRemoved: (item: OnboardingCaseSummary) => void;
  /** The case changed or vanished meanwhile: the list must be reloaded. */
  onStale: (message: MessageKey) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [understood, setUnderstood] = useState(false);
  const [noHandoff, setNoHandoff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  const removal = item.removal;
  const name = item.restaurantName ?? t(item.mode === "DEMO" ? "onboarding.demo.unnamed" : "onboarding.unnamed");
  const copy = removal.allowed ? removalDialog(removal) : null;
  const ready = copy !== null && (!copy.needsAcknowledgement || understood) && (!copy.needsNoHandoffConfirmation || noHandoff);

  async function confirm() {
    if (!removal.allowed || !ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await removeOnboardingCase(item.id, removalRequest(item.revision, removal, noHandoff));
      onRemoved(item);
    } catch (caught) {
      const key = caught instanceof ApiError ? removalErrorKey(caught.code, caught.details.reason) : null;
      if (key) onStale(key);
      else setError(transportErrorKey(caught));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
      className="m-auto w-[calc(100%-24px)] max-w-[520px] rounded-2xl border border-border bg-surface p-0 text-foreground shadow-pop backdrop:bg-black/60"
    >
      <div className="space-y-4 p-5">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {copy ? t(copy.title) : t("onboarding.remove.refusedTitle")}
        </h2>
        <p className="text-sm font-medium">
          <bdi>{name}</bdi>
        </p>
        <div id={`${id}-body`} className="space-y-3 text-sm">
          {removal.allowed && copy ? (
            <>
              <p>{t(copy.intro)}</p>
              {copy.impacts.length > 0 ? (
                <ul className="list-disc space-y-1.5 ps-5">
                  {copy.impacts.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              ) : null}
              {copy.needsAcknowledgement ? <p className="text-muted-foreground">{t("onboarding.remove.kept")}</p> : null}
            </>
          ) : !removal.allowed ? (
            <p>{t(REFUSAL_MESSAGE[removal.refusal])}</p>
          ) : null}
        </div>

        {copy?.needsAcknowledgement ? (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={understood} disabled={busy}
              onChange={(event) => setUnderstood(event.target.checked)} />
            <span>{t("onboarding.remove.understand")}</span>
          </label>
        ) : null}
        {copy?.needsNoHandoffConfirmation ? (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-warning/50 bg-warning-soft px-3 py-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={noHandoff} disabled={busy}
              onChange={(event) => setNoHandoff(event.target.checked)} />
            <span>{t("onboarding.remove.noHandoff")}</span>
          </label>
        ) : null}

        {error ? <Alert tone="danger">{t(error)}</Alert> : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" disabled={busy} onClick={onClose}>
            {copy ? t("onboarding.remove.keep") : t("common.back")}
          </Button>
          {copy ? (
            <Button type="button" variant="danger" disabled={!ready || busy} onClick={() => void confirm()}>
              {busy ? t("onboarding.remove.removing") : t(copy.confirm)}
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
