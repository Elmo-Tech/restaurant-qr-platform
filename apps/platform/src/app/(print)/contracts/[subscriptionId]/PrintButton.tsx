"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/**
 * The bar above the contract (not printed): the language of the contract and the print button. The
 * browser's print dialog has "Save as PDF", which is how the PDF is made.
 */
export function PrintButton({ languages }: { languages: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="print:hidden mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-2 py-5">
      <div className="flex items-center gap-3">
        {languages}
        <p className="hidden text-[13px] text-neutral-600 sm:block">{t("contract.printHint")}</p>
      </div>
      <Button variant="primary" onClick={() => window.print()}>
        {t("contract.print")}
      </Button>
    </div>
  );
}
