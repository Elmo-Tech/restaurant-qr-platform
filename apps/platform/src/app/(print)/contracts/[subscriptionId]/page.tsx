import Link from "next/link";
import { Alert } from "@/components/ui";
import type { ContractData } from "@/lib/api/billing";
import { platformServerGet } from "@/lib/api/server-fetch";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { ContractDocument } from "./ContractDocument";
import { PrintButton } from "./PrintButton";

/** One contract, in ONE language (`?lang=ar` or `?lang=en`; the console language when missing). */
export default async function ContractPage({
  params,
  searchParams,
}: PageProps<"/contracts/[subscriptionId]">) {
  const [{ subscriptionId }, query, { t, locale: consoleLocale }] = await Promise.all([params, searchParams, getI18n()]);
  const asked = Array.isArray(query.lang) ? query.lang[0] : query.lang;
  const locale: Locale = isLocale(asked) ? asked : consoleLocale;

  const result = await platformServerGet<ContractData>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/contract`,
  );
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <Alert tone={result.status === 404 ? "warning" : "danger"}>
          {result.status === 404 ? t("contract.notFound") : t("common.unreachable")}
        </Alert>
      </main>
    );
  }

  const switchTo = (target: Locale, label: string) => (
    <Link
      key={target}
      href={`?lang=${target}`}
      className={cn(
        "rounded-md px-3 py-1.5 text-[13px] font-medium",
        target === locale ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-300",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="bg-neutral-200 pb-10 print:bg-white print:pb-0">
      <style>{"@page { size: A4; margin: 12mm; } html, body { background: #fff; }"}</style>
      <PrintButton
        languages={
          <div className="flex gap-1 rounded-lg bg-neutral-200 p-1" role="group">
            {switchTo("ar", "العربية")}
            {switchTo("en", "English")}
          </div>
        }
      />

      <ContractDocument data={result.data} locale={locale} />
    </div>
  );
}
