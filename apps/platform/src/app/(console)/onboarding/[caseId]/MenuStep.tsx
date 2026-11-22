"use client";

import { useId, useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import type { OnboardingCase, OnboardingMenuDraft, RestaurantDraft } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { IMPORT_ATTEMPT_LIMIT, MENU_FILE_ACCEPT, menuFileProblem, menuProblemText } from "@/lib/onboarding-menu";
import { describedBy, Field } from "./fields";
import { MenuEditor } from "./MenuEditor";

const EMPTY_DRAFT: OnboardingMenuDraft = { menus: [] };

export function MenuStep({ data, restaurant, draft, disabled, busy, saving, dirty, expired, onChange, onImport, onReview, onDiscard }: {
  data: OnboardingCase;
  restaurant: RestaurantDraft;
  draft: OnboardingMenuDraft | null;
  disabled: boolean;
  busy: boolean;
  saving: boolean;
  dirty: boolean;
  expired: boolean;
  onChange: (draft: OnboardingMenuDraft) => void;
  onImport: (files: readonly File[]) => Promise<boolean>;
  onReview: () => void;
  onDiscard: () => Promise<boolean>;
}) {
  const { t, fmt } = useI18n();
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [confirm, setConfirm] = useState<"replace" | "discard" | null>(null);
  const expiresAt = data.importExpiresAt;
  const staged = expiresAt !== null;
  const fileProblem = files.length ? menuFileProblem(files) : null;
  const exhausted = data.importAttempts >= IMPORT_ATTEMPT_LIMIT;
  const actionsDisabled = disabled || busy || saving;
  const canReview = dirty || data.problems.menu.every((problem) => problem === "ONBOARDING_IMPORT_REVIEW_REQUIRED");
  const showImport = data.status === "DRAFT" || data.status === "READY_FOR_REVIEW" || staged;

  async function importFiles() {
    if (await onImport(files)) {
      setFiles([]);
      setFileInputKey((key) => key + 1);
    }
    setConfirm(null);
  }

  return (
    <div className="min-w-0 space-y-4" aria-busy={busy}>
      {showImport ? (
        <Card>
          <CardHeader title={t("onboarding.menu.import")} description={t("onboarding.menu.importHint")} />
          <div className="space-y-3 p-3 sm:p-5">
            {staged ? (
              <Alert tone={expired ? "warning" : data.importReviewed && !dirty ? "success" : "info"}>
                <p className="font-medium">{t(expired ? "onboarding.menu.error.expired" : data.importReviewed && !dirty ? "onboarding.menu.reviewed" : "onboarding.menu.reviewNeeded")}</p>
                {!expired && expiresAt ? <p>{t("onboarding.menu.expires", { when: fmt.dateTime(expiresAt) })}</p> : null}
                {!expired && (!data.importReviewed || dirty) ? <p className="mt-1">{t("onboarding.menu.reviewHint")}</p> : null}
              </Alert>
            ) : null}
            {staged && !disabled ? (
              <div className="flex flex-wrap gap-2">
                {!expired && (!data.importReviewed || dirty) ? (
                  <Button type="button" variant="primary" disabled={actionsDisabled || !canReview} onClick={onReview}>{t("onboarding.menu.review")}</Button>
                ) : null}
                <Button type="button" disabled={actionsDisabled} onClick={() => setConfirm("discard")}>{t("onboarding.menu.discard")}</Button>
              </div>
            ) : null}
            {!disabled && !exhausted ? (
              <div className="flex flex-wrap items-end gap-3">
                <Field id={id} className="min-w-0 flex-1 basis-56" label={t("onboarding.menu.file")} hint={t("onboarding.menu.fileHint")} error={fileProblem && t(fileProblem)}>
                  <Input key={fileInputKey} id={id} type="file" multiple accept={MENU_FILE_ACCEPT} disabled={actionsDisabled}
                    className="h-auto min-h-10 py-2 file:me-2" onChange={(event) => {
                      setFiles(Array.from(event.currentTarget.files ?? []));
                      setConfirm(null);
                    }} {...describedBy(id, true, fileProblem)} />
                </Field>
                <Button type="button" disabled={actionsDisabled || files.length === 0 || fileProblem !== null} onClick={() => {
                  if (draft?.menus.length || staged) setConfirm("replace");
                  else void importFiles();
                }}>{t("onboarding.menu.upload")}</Button>
              </div>
            ) : null}
            {!disabled ? (
              <p className="text-xs text-muted-foreground">{t(exhausted ? "onboarding.menu.error.quota" : "onboarding.menu.quota", {
                used: fmt.number(data.importAttempts), total: fmt.number(IMPORT_ATTEMPT_LIMIT),
              })}</p>
            ) : null}
            {busy ? <p role="status" className="text-sm text-muted-foreground">{t("onboarding.menu.working")}</p> : null}
            {confirm && !disabled ? (
              <Alert tone="warning">
                <p>{t(confirm === "replace" ? "onboarding.menu.replaceConfirm" : "onboarding.menu.discardConfirm")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant={confirm === "discard" ? "danger" : "primary"} disabled={actionsDisabled} onClick={() => {
                    if (confirm === "replace") void importFiles();
                    else void onDiscard().then(() => setConfirm(null));
                  }}>{t(confirm === "replace" ? "onboarding.menu.upload" : "onboarding.menu.discard")}</Button>
                  <Button type="button" disabled={busy} onClick={() => setConfirm(null)}>{t("common.back")}</Button>
                </div>
              </Alert>
            ) : null}
          </div>
        </Card>
      ) : null}
      <MenuProblems problems={dirty ? [] : data.problems.menu} />
      <MenuEditor key={`${staged}:${data.importExpiresAt ?? ""}`} draft={draft ?? EMPTY_DRAFT} restaurant={restaurant} disabled={disabled || busy || expired} onChange={onChange} />
    </div>
  );
}

export function MenuProblems({ problems }: { problems: string[] }) {
  const { t, fmt } = useI18n();
  if (!problems.length) return null;
  const list = (items: string[]) => (
    <ul className="mt-2 list-disc space-y-1 ps-5">
      {items.map((problem, i) => <li key={`${problem}-${i}`}>{menuProblemText(problem, t, fmt.number)}</li>)}
    </ul>
  );
  return (
    <Alert tone="warning">
      <p className="font-medium">{t("onboarding.menu.problems")} <Badge tone="warning">{fmt.number(problems.length)}</Badge></p>
      {list(problems.slice(0, 6))}
      {problems.length > 6 ? <details className="mt-2">
        <summary className="cursor-pointer font-medium">{t("onboarding.menu.moreProblems", { count: fmt.number(problems.length - 6) })}</summary>
        {list(problems.slice(6))}
      </details> : null}
    </Alert>
  );
}
