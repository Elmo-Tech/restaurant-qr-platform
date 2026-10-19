import type { Locale } from "./i18n/locale";

/**
 * The words of a subscription contract (DEC-049). A contract is in ONE language, chosen when it is
 * opened or printed; it states who subscribed to what, for which period, at what price and that the
 * service is provided. It carries no legal clauses. Every number, date and name comes from the
 * snapshot stored with the contract, so an old contract never changes.
 */
export interface ContractText {
  title: string;
  numberLabel: string;
  provider: string;
  client: string;
  providerTagline: string;
  /** The one sentence the contract is about. */
  statement: (input: { client: string; provider: string; packageName: string; from: string; to: string; period: string }) => string;
  service: string;
  serviceProvided: (provider: string, from: string, to: string) => string;
  package: string;
  includes: string;
  noFeatures: string;
  billingPeriod: string;
  monthly: string;
  yearly: string;
  starts: string;
  ends: string;
  listPrice: string;
  offer: (percent: string) => string;
  discount: string;
  total: string;
  notes: string;
  forProvider: string;
  forClient: string;
  signature: string;
  date: string;
}

export const CONTRACT_TEXT: Record<Locale, ContractText> = {
  en: {
    title: "Subscription Agreement",
    numberLabel: "No.",
    provider: "The Provider",
    client: "The Client",
    providerTagline: "Digital QR menu platform",
    statement: ({ client, provider, packageName, from, to, period }) =>
      `This agreement records that ${client} has subscribed to the ${provider} service on the "${packageName}" package, billed ${period}, for the period from ${from} to ${to}.`,
    service: "The service",
    serviceProvided: (provider, from, to) =>
      `${provider} will provide the service described above to the Client from ${from} until ${to}.`,
    package: "Package",
    includes: "Includes",
    noFeatures: "Digital menu",
    billingPeriod: "Billing period",
    monthly: "monthly",
    yearly: "yearly",
    starts: "Starts",
    ends: "Ends",
    listPrice: "Package price",
    offer: (percent) => `Package offer (${percent}%)`,
    discount: "Customer discount",
    total: "Amount due",
    notes: "Notes",
    forProvider: "For the Provider",
    forClient: "For the Client",
    signature: "Name and signature",
    date: "Date",
  },
  ar: {
    title: "عقد اشتراك",
    numberLabel: "رقم",
    provider: "المزوِّد",
    client: "العميل",
    providerTagline: "منصة المنيو الرقمي بالـQR",
    statement: ({ client, provider, packageName, from, to, period }) =>
      `يفيد هذا العقد بأن ${client} اشترك في خدمة ${provider} على باقة "${packageName}" بنظام الدفع ${period}، عن الفترة من ${from} إلى ${to}.`,
    service: "الخدمة",
    serviceProvided: (provider, from, to) => `تقدّم ${provider} للعميل الخدمة الموضحة أعلاه من ${from} حتى ${to}.`,
    package: "الباقة",
    includes: "تشمل",
    noFeatures: "المنيو الرقمي",
    billingPeriod: "فترة الفوترة",
    monthly: "الشهري",
    yearly: "السنوي",
    starts: "تاريخ البداية",
    ends: "تاريخ النهاية",
    listPrice: "سعر الباقة",
    offer: (percent) => `عرض الباقة (${percent}%)`,
    discount: "خصم العميل",
    total: "المبلغ المستحق",
    notes: "ملاحظات",
    forProvider: "عن المزوِّد",
    forClient: "عن العميل",
    signature: "الاسم والتوقيع",
    date: "التاريخ",
  },
};
