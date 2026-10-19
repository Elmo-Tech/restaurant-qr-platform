import type { ReactNode } from "react";
import { WaytaLockup } from "@/components/brand/Wayta";
import type { ContractData } from "@/lib/api/billing";
import { CONTRACT_TEXT } from "@/lib/contract-text";
import { directionOf, type Locale } from "@/lib/i18n/locale";
import { MESSAGES } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const intlTag = (locale: Locale) => (locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB");

function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <tr className={strong ? "border-t-2 border-neutral-800" : "border-t border-neutral-200"}>
      <th scope="row" className={cn("w-[38%] py-2.5 pe-4 text-start text-[13px] font-normal text-neutral-600", strong && "font-semibold text-neutral-900")}>
        {label}
      </th>
      <td className={cn("py-2.5 text-start text-[14px] text-neutral-900", strong && "text-[16px] font-bold")}>{children}</td>
    </tr>
  );
}

/** The contract itself, in ONE language: who subscribed to what, for which period, at what price. */
export function ContractDocument({ data, locale }: { data: ContractData; locale: Locale }) {
  const { terms, issuedAt, number } = data;
  const text = CONTRACT_TEXT[locale];
  const price = terms.pricing;
  const dir = directionOf(locale);

  const dateFmt = new Intl.DateTimeFormat(intlTag(locale), { dateStyle: "long", timeZone: "UTC" });
  const moneyFmt = new Intl.NumberFormat(intlTag(locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = (value: string) => dateFmt.format(new Date(`${value}T12:00:00Z`));
  const money = (value: string) => `${moneyFmt.format(Number(value))} ${price.currencyCode}`;
  const features = terms.package.features
    .map((key) => MESSAGES[locale][`feature.${key}` as keyof (typeof MESSAGES)["en"]] ?? key)
    .join(locale === "ar" ? "، " : ", ");
  const yearly = terms.period === "YEARLY";

  return (
    <article
      dir={dir}
      lang={locale}
      className="mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[16mm] text-neutral-900 shadow-lg print:min-h-0 print:max-w-none print:p-0 print:shadow-none"
    >
      <header className="flex items-start justify-between gap-6 border-b-2 border-neutral-900 pb-5">
        <WaytaLockup tone="light" size={46} />
        <div className="text-end">
          <h1 className="text-[20px] font-bold leading-tight">{text.title}</h1>
          <p className="mt-2 text-[13px] text-neutral-600">
            {text.numberLabel} <bdi dir="ltr" className="font-semibold text-neutral-900">{number}</bdi>
          </p>
          <p className="text-[13px] text-neutral-600">{day(issuedAt.slice(0, 10))}</p>
        </div>
      </header>

      <section className="mt-7 grid grid-cols-2 gap-6">
        <div className="rounded-md border border-neutral-300 p-4">
          <p className="text-[12px] font-semibold text-neutral-500">{text.provider}</p>
          <p className="mt-1 text-[16px] font-semibold">{locale === "ar" ? "ويتا" : "Wayta"}</p>
          <p className="mt-0.5 text-[13px] text-neutral-600">{text.providerTagline}</p>
        </div>
        <div className="rounded-md border border-neutral-300 p-4">
          <p className="text-[12px] font-semibold text-neutral-500">{text.client}</p>
          <p className="mt-1 text-[16px] font-semibold">
            <bdi>{terms.restaurant.name}</bdi>
          </p>
          {terms.restaurant.ownerEmails.length > 0 ? (
            <p dir="ltr" className="mt-0.5 text-start text-[13px] text-neutral-600">
              {terms.restaurant.ownerEmails.join(", ")}
            </p>
          ) : null}
        </div>
      </section>

      <p className="mt-8 text-[15px] leading-8">
        {text.statement({
          client: terms.restaurant.name,
          provider: locale === "ar" ? "ويتا" : "Wayta",
          packageName: terms.package.name,
          from: day(terms.startsAt),
          to: day(terms.endsAt),
          period: yearly ? text.yearly : text.monthly,
        })}
      </p>

      <section className="mt-6">
        <h2 className="mb-1 text-[13px] font-bold uppercase tracking-wide text-neutral-500">{text.service}</h2>
        <table className="w-full border-collapse">
          <tbody>
            <Row label={text.package}>
              <bdi className="font-semibold">{terms.package.name}</bdi>
            </Row>
            <Row label={text.includes}>{features || text.noFeatures}</Row>
            <Row label={text.billingPeriod}>
                <span className="capitalize">{yearly ? text.yearly : text.monthly}</span>
              </Row>
            <Row label={text.starts}>{day(terms.startsAt)}</Row>
            <Row label={text.ends}>{day(terms.endsAt)}</Row>
          </tbody>
        </table>
        <p className="mt-4 text-[14px] leading-7 text-neutral-700">
          {text.serviceProvided(locale === "ar" ? "ويتا" : "Wayta", day(terms.startsAt), day(terms.endsAt))}
        </p>
      </section>

      <section className="mt-7">
        <table className="w-full border-collapse">
          <tbody>
            <Row label={text.listPrice}>
              <bdi dir="ltr" className="tabular-nums">{money(price.listPrice)}</bdi>
            </Row>
            {price.offer ? (
              <Row label={text.offer(String(Number(price.offer.percent)))}>
                <bdi dir="ltr" className="tabular-nums">- {money(price.offer.amount)}</bdi>
              </Row>
            ) : null}
            {price.discount ? (
              <Row label={text.discount}>
                <bdi dir="ltr" className="tabular-nums">- {money(price.discount.amount)}</bdi>
              </Row>
            ) : null}
            <Row label={text.total} strong>
              <bdi dir="ltr" className="tabular-nums">{money(price.finalPrice)}</bdi>
            </Row>
          </tbody>
        </table>
      </section>

      {terms.notes ? (
        <section className="mt-6 break-inside-avoid rounded-md border border-neutral-300 p-3 text-[13px]">
          <span className="font-semibold">{text.notes}: </span>
          {terms.notes}
        </section>
      ) : null}

      <section className="mt-14 grid grid-cols-2 gap-12 break-inside-avoid">
        {[
          [text.forProvider, locale === "ar" ? "ويتا" : "Wayta"],
          [text.forClient, terms.restaurant.name],
        ].map(([label, name]) => (
          <div key={label}>
            <p className="text-[13px] font-semibold">{label}</p>
            <p className="mt-0.5 text-[13px] text-neutral-600">
              <bdi>{name}</bdi>
            </p>
            <div className="mt-14 border-t border-neutral-700 pt-1 text-[12px] text-neutral-500">{text.signature}</div>
            <div className="mt-7 border-t border-neutral-700 pt-1 text-[12px] text-neutral-500">{text.date}</div>
          </div>
        ))}
      </section>
    </article>
  );
}
