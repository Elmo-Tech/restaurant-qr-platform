"use client";

import { Button } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

/** Opens the browser's print dialog; "Save as PDF" there makes the PDF. Hidden when printing. */
export function PrintButton() {
  const { t } = useI18n();
  return (
    <div className="print:hidden mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-2 pt-6">
      <p className="text-[13px] text-neutral-600">{t("contract.printHint")}</p>
      <Button variant="primary" onClick={() => window.print()}>
        {t("contract.print")}
      </Button>
    </div>
  );
}
