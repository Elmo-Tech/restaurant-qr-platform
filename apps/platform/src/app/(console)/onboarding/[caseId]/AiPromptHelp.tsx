"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { MENU_AI_PROMPT } from "@/lib/menu-import-ai-prompt";

/** The same Excel template the Staff Import page offers (byte-identical copy, see `menu-import-ai-prompt.ts`). */
export const MENU_TEMPLATE_URL = "/templates/menu-import-template.xlsx";

/**
 * Optional helper of the onboarding Menu step: the canonical Menu Import instructions to paste into any AI chat with
 * the menu photos / PDF, so the chat prepares the Excel template, which is then uploaded here like any other file.
 *
 * Entirely client-side: opening it, copying or downloading the template sends nothing to Wayta or to any AI service,
 * and does not touch the case or its import attempts. Only the upload button of the Menu step does that.
 */
export function AiPromptHelp() {
  const { t } = useI18n();
  const id = useId();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const reset = useRef<number | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(
    () => () => {
      if (reset.current !== null) window.clearTimeout(reset.current);
    },
    [],
  );

  async function copyPrompt() {
    let next: "copied" | "failed" = "copied";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(MENU_AI_PROMPT);
    } catch {
      next = "failed";
      // Help a manual copy: select the whole text so Ctrl/Cmd+C works at once.
      promptRef.current?.focus();
      promptRef.current?.select();
    }
    setCopy(next);
    if (reset.current !== null) window.clearTimeout(reset.current);
    reset.current = window.setTimeout(() => setCopy("idle"), next === "copied" ? 4_000 : 8_000);
  }

  return (
    <details className="group rounded-lg border border-border bg-surface-2/50">
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 py-2.5 text-sm font-medium text-foreground">
        {t("onboarding.ai.summary")}
      </summary>
      <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
        <p className="text-muted-foreground">{t("onboarding.ai.intro")}</p>
        <ol className="list-decimal space-y-1.5 ps-5 text-foreground">
          <li>{t("onboarding.ai.step1")}</li>
          <li>{t("onboarding.ai.step2")}</li>
          <li>{t("onboarding.ai.step3")}</li>
          <li>{t("onboarding.ai.step4")}</li>
        </ol>
        <label htmlFor={`${id}-prompt`} className="block text-[13px] font-medium text-foreground">
          {t("onboarding.ai.label")}
        </label>
        <textarea
          ref={promptRef}
          id={`${id}-prompt`}
          readOnly
          dir="ltr"
          rows={8}
          value={MENU_AI_PROMPT}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-y rounded-lg border border-border bg-surface p-3 text-start font-mono text-xs leading-relaxed text-foreground"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="primary" onClick={() => void copyPrompt()}>
            {t("onboarding.ai.copy")}
          </Button>
          <a
            href={MENU_TEMPLATE_URL}
            download="menu-import-template.xlsx"
            className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-2"
          >
            {t("onboarding.ai.template")}
          </a>
          <span role="status" aria-live="polite" className={copy === "failed" ? "text-xs font-medium text-danger" : "text-xs font-medium text-success"}>
            {copy === "copied" ? t("onboarding.ai.copied") : copy === "failed" ? t("onboarding.ai.copyFailed") : ""}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t("onboarding.ai.templateHint")}</p>
        <p className="text-xs text-muted-foreground">{t("onboarding.ai.noFile")}</p>
        <p className="text-xs text-muted-foreground">{t("onboarding.ai.private")}</p>
      </div>
    </details>
  );
}
