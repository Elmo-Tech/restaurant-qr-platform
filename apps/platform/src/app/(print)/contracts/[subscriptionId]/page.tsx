import type { ReactNode } from "react";
import { WaytaLockup } from "@/components/brand/Wayta";
import { Alert } from "@/components/ui";
import type { ContractData } from "@/lib/api/billing";
import { platformServerGet } from "@/lib/api/server-fetch";
import { buildClauses } from "@/lib/contract-text";
import { getI18n } from "@/lib/i18n/server";
import { PrintButton } from "./PrintButton";

const dateEn = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });
const dateAr = new Intl.DateTimeFormat("ar-EG-u-nu-latn", { dateStyle: "long", timeZone: "UTC" });
const moneyFmt = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const day = (value: string, locale: "en" | "ar") =>
  (locale === "en" ? dateEn : dateAr).format(new Date(`${value}T12:00:00Z`));

/** One row of the fee table: English label, the value, the Arabic label. */
function Row({ en, ar, children, strong = false }: { en: string; ar: string; children: ReactNode; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t-2 border-neutral-800 font-semibold" : "border-t border-neutral-200"}>
      <td className="w-[34%] py-2 pe-3 text-start text-[12px] text-neutral-600">{en}</td>
      <td dir="ltr" className="py-2 text-center text-[13px] tabular-nums text-neutral-900">{children}</td>
      <td dir="rtl" lang="ar" className="w-[34%] py-2 ps-3 text-start text-[12px] text-neutral-600">{ar}</td>
    </tr>
  );
}

export default async function ContractPage({ params }: PageProps<"/contracts/[subscriptionId]">) {
  const { subscriptionId } = await params;
  const [result, { t }] = await Promise.all([
    platformServerGet<ContractData>(`/subscriptions/${encodeURIComponent(subscriptionId)}/contract`),
    getI18n(),
  ]);

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <Alert tone={result.status === 404 ? "warning" : "danger"}>
          {result.status === 404 ? t("contract.notFound") : t("common.unreachable")}
        </Alert>
      </main>
    );
  }

  const { terms, issuedAt, number } = result.data;
  const price = terms.pricing;
  const currency = price.currencyCode;
  const money = (value: string) => `${moneyFmt.format(Number(value))} ${currency}`;
  const clauses = buildClauses(terms);
  const yearly = terms.period === "YEARLY";

  return (
    <div className="bg-neutral-200 pb-10 print:bg-white print:pb-0">
      <style>{"@page { size: A4; margin: 12mm; } html, body { background: #fff; }"}</style>
      <PrintButton />

      <article className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[14mm] text-neutral-900 shadow-lg print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
          <WaytaLockup tone="light" size={46} />
          <div className="text-end">
            <h1 className="text-[17px] font-bold leading-tight">
              Subscription Agreement
              <span lang="ar" dir="rtl" className="mt-0.5 block text-[17px]">عقد اشتراك</span>
            </h1>
            <p dir="ltr" className="mt-2 text-[12px] text-neutral-600">
              No. <span className="font-semibold text-neutral-900">{number}</span>
            </p>
            <p className="text-[12px] text-neutral-600">
              {day(issuedAt.slice(0, 10), "en")} · <span lang="ar">{day(issuedAt.slice(0, 10), "ar")}</span>
            </p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-6">
          <div className="rounded-md border border-neutral-300 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              The Provider <span lang="ar" className="normal-case">· المزوِّد</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold">Wayta · <span lang="ar">ويتا</span></p>
            <p className="mt-0.5 text-[12px] text-neutral-600">Digital QR menu platform · <span lang="ar">منصة المنيو الرقمي</span></p>
          </div>
          <div className="rounded-md border border-neutral-300 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              The Client <span lang="ar" className="normal-case">· العميل</span>
            </p>
            <p className="mt-1 text-[15px] font-semibold">
              <bdi>{terms.restaurant.name}</bdi>
            </p>
            {terms.restaurant.ownerEmails.length > 0 ? (
              <p dir="ltr" className="mt-0.5 text-start text-[12px] text-neutral-600">
                {terms.restaurant.ownerEmails.join(", ")}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-6">
          <table className="w-full border-collapse">
            <tbody>
              <Row en="Package" ar="الباقة">{terms.package.name}</Row>
              <Row en="Billing period" ar="فترة الفوترة">
                {yearly ? "Yearly · سنوي" : "Monthly · شهري"}
              </Row>
              <Row en="Starts" ar="تاريخ البداية">{terms.startsAt}</Row>
              <Row en="Ends" ar="تاريخ النهاية">{terms.endsAt}</Row>
              <Row en="List price" ar="سعر الباقة">{money(price.listPrice)}</Row>
              {price.offer ? (
                <Row en={`Package offer (${Number(price.offer.percent)}%)`} ar={`عرض الباقة (${Number(price.offer.percent)}%)`}>
                  - {money(price.offer.amount)}
                </Row>
              ) : null}
              {price.discount ? (
                <Row en="Customer discount" ar="خصم العميل">- {money(price.discount.amount)}</Row>
              ) : null}
              <Row en="Total fee" ar="إجمالي الرسوم" strong>{money(price.finalPrice)}</Row>
            </tbody>
          </table>
        </section>

        <section className="mt-6 space-y-4">
          {clauses.map((clause) => (
            <div key={clause.en.title} className="grid grid-cols-2 gap-6 break-inside-avoid">
              <div dir="ltr" lang="en">
                <h2 className="text-[12px] font-bold">{clause.en.title}</h2>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-neutral-700">{clause.en.body}</p>
              </div>
              <div dir="rtl" lang="ar">
                <h2 className="text-[12.5px] font-bold">{clause.ar.title}</h2>
                <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-700">{clause.ar.body}</p>
              </div>
            </div>
          ))}
        </section>

        {terms.notes ? (
          <section className="mt-5 break-inside-avoid rounded-md border border-neutral-300 p-3 text-[12px]">
            <span className="font-semibold">Notes · ملاحظات: </span>
            {terms.notes}
          </section>
        ) : null}

        <section className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid">
          {[
            ["For the Provider", "عن المزوِّد", "Wayta · ويتا"],
            ["For the Client", "عن العميل", terms.restaurant.name],
          ].map(([en, ar, name]) => (
            <div key={en}>
              <p className="text-[12px] font-semibold">
                {en} <span lang="ar">· {ar}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-neutral-600">
                <bdi>{name}</bdi>
              </p>
              <div className="mt-12 border-t border-neutral-700 pt-1 text-[11px] text-neutral-500">
                Name &amp; signature · <span lang="ar">الاسم والتوقيع</span>
              </div>
              <div className="mt-6 border-t border-neutral-700 pt-1 text-[11px] text-neutral-500">
                Date · <span lang="ar">التاريخ</span>
              </div>
            </div>
          ))}
        </section>

        <footer className="mt-8 border-t border-neutral-200 pt-2 text-[10.5px] text-neutral-500">
          <span dir="ltr">{number}</span> · {terms.issuedBy}
        </footer>
      </article>
    </div>
  );
}
