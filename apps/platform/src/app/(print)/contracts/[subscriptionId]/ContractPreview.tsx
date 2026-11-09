import Image from "next/image";
import type { ReactNode } from "react";
import { WaytaLockup } from "@/components/brand/Wayta";
import type { ContractFields } from "@/lib/contract-document-model";
import { CONTRACT_TEXT } from "@/lib/contract-text";
import type { Locale } from "@/lib/i18n/locale";
import { SignatureImage } from "./SignatureImage";

function safeHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <tr
      className={
        strong ? "border-t-2 border-neutral-800" : "border-t border-neutral-200"
      }
    >
      <th
        scope="row"
        className={`w-[38%] py-2 pe-4 text-start text-[12px] ${strong ? "font-bold text-neutral-900" : "font-normal text-neutral-600"}`}
      >
        {label}
      </th>
      <td
        className={`py-2 text-start text-[13px] ${strong ? "font-bold text-neutral-900" : "text-neutral-800"}`}
      >
        <bdi>{value}</bdi>
      </td>
    </tr>
  );
}

export function ContractPreview({
  fields: f,
  locale,
  assets,
  legacyText,
}: {
  fields: ContractFields;
  locale: Locale;
  assets: { seal: string | null; signature: string | null };
  legacyText?: string;
}) {
  const t = CONTRACT_TEXT[locale];
  const ar = locale === "ar";
  const stamp = ar ? "الختم" : "Seal";
  return (
    <article
      dir={ar ? "rtl" : "ltr"}
      lang={locale}
      className="mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-[16mm] text-neutral-900 shadow-[0_14px_40px_rgba(15,23,42,0.12)] print:min-h-0 print:max-w-none print:p-0 print:shadow-none"
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-5">
        <WaytaLockup tone="light" size={46} />
        <div className="text-end">
          <h1 className="text-[20px] font-bold leading-tight">{f.title}</h1>
          <p className="mt-2 text-[12px] text-neutral-600">
            {t.numberLabel}{" "}
            <bdi dir="ltr" className="font-semibold text-neutral-900">
              {f.number}
            </bdi>
          </p>
          <p className="text-[12px] text-neutral-600">{f.date}</p>
        </div>
      </header>
      {legacyText !== undefined ? (
        <section className="mt-7 whitespace-pre-wrap break-words text-[14px] leading-7">
          {legacyText}
        </section>
      ) : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-md border border-neutral-300 p-4">
              <p className="text-[12px] font-semibold text-neutral-500">
                {t.provider}
              </p>
              <p className="mt-1 text-[16px] font-semibold">
                <bdi>{f.provider}</bdi>
              </p>
              <p className="mt-1 text-[12px] text-neutral-600">
                {f.providerDescription}
              </p>
            </div>
            <div className="rounded-md border border-neutral-300 p-4">
              <p className="text-[12px] font-semibold text-neutral-500">
                {t.client}
              </p>
              <p className="mt-1 text-[16px] font-semibold">
                <bdi>{f.client}</bdi>
              </p>
              {f.contactName ? (
                <p className="mt-1 text-[12px] text-neutral-600">
                  {t.contactName}: <bdi>{f.contactName}</bdi>
                </p>
              ) : null}
              {f.contactPhone ? (
                <p className="text-[12px] text-neutral-600">
                  {t.contactPhone}: <bdi dir="ltr">{f.contactPhone}</bdi>
                </p>
              ) : null}
              {f.email ? (
                <p
                  dir="ltr"
                  className="break-all text-start text-[12px] text-neutral-600"
                >
                  {f.email}
                </p>
              ) : null}
              {f.menuUrl ? (
                <p
                  dir="ltr"
                  className="break-all text-start text-[12px] text-neutral-600"
                >
                  {f.menuUrl}
                </p>
              ) : null}
            </div>
          </section>
          <p className="mt-6 whitespace-pre-wrap text-[14px] leading-7">
            {f.statement}
          </p>
          <section className="mt-5">
            <h2 className="mb-1 text-[12px] font-bold text-neutral-500">
              {t.service}
            </h2>
            <table className="w-full border-collapse">
              <tbody>
                <Row label={t.package} value={f.packageName} />
                <Row label={t.includes} value={f.features} />
                <Row label={t.billingPeriod} value={f.period} />
                <Row label={t.starts} value={f.starts} />
                <Row label={t.ends} value={f.ends} />
              </tbody>
            </table>
            <p className="mt-4 whitespace-pre-wrap text-[13px] leading-6 text-neutral-700">
              {f.serviceStatement}
            </p>
          </section>
          <section className="mt-5">
            <table className="w-full border-collapse">
              <tbody>
                <Row label={t.listPrice} value={f.listPrice} />
                {f.offerLabel || f.offerAmount ? (
                  <Row label={f.offerLabel} value={f.offerAmount} />
                ) : null}
                {f.discount ? (
                  <Row label={t.discount} value={f.discount} />
                ) : null}
                <Row label={t.total} value={f.total} strong />
              </tbody>
            </table>
          </section>
          {f.notes ? (
            <section className="mt-4 whitespace-pre-wrap rounded-md border border-neutral-300 p-3 text-[12px]">
              <span className="font-semibold">{t.notes}: </span>
              {f.notes}
            </section>
          ) : null}
        </>
      )}
      <section className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid">
        {[
          {
            label: t.forProvider,
            name: f.provider,
            signature: assets.signature,
            seal: assets.seal,
          },
          { label: t.forClient, name: f.client, signature: null, seal: null },
        ].map((side) => (
          <div key={side.label}>
            <p className="text-[13px] font-semibold">{side.label}</p>
            <p className="mt-1 text-[12px] text-neutral-600">
              <bdi>{side.name}</bdi>
            </p>
            <div className="mt-3 flex h-20 items-end justify-start">
              {side.signature ? (
                <SignatureImage
                  source={side.signature}
                  label={ar ? "التوقيع" : "Signature"}
                />
              ) : null}
            </div>
            <p className="border-t border-neutral-600 pt-1 text-[11px] text-neutral-500">
              {t.signature}
            </p>
            <div className="mt-3 flex h-16 items-end justify-start">
              {side.seal ? (
                <Image
                  unoptimized
                  src={side.seal}
                  width={180}
                  height={64}
                  alt={stamp}
                  className="h-auto max-h-14 w-auto max-w-[85%] object-contain"
                />
              ) : null}
            </div>
            <p className="border-t border-neutral-600 pt-1 text-[11px] text-neutral-500">
              {stamp}
            </p>
          </div>
        ))}
      </section>
      <footer className="mt-6 break-inside-avoid border-t border-neutral-200 pt-3 text-center text-[11px] leading-5 text-neutral-500">
        <p>{f.companyStatement}</p>
        <p dir="ltr" className="break-all">
          <a href={safeHttpsUrl(f.waytaUrl)}>
            <bdi>{f.waytaUrl}</bdi>
          </a>{" "}
          <span className="mx-2">·</span>{" "}
          <a href={safeHttpsUrl(f.elmotechUrl)}>
            <bdi>{f.elmotechUrl}</bdi>
          </a>
        </p>
      </footer>
    </article>
  );
}
