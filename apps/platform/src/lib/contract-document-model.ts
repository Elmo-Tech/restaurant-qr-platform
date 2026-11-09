import type { ContractData } from "./api/billing";
import { CONTRACT_TEXT } from "./contract-text";
import type { Locale } from "./i18n/locale";
import { MESSAGES } from "./i18n/messages";

export interface ContractFields {
  title: string;
  number: string;
  date: string;
  provider: string;
  providerDescription: string;
  client: string;
  contactName: string;
  contactPhone: string;
  email: string;
  menuUrl: string;
  statement: string;
  packageName: string;
  features: string;
  period: string;
  starts: string;
  ends: string;
  serviceStatement: string;
  listPrice: string;
  offerLabel: string;
  offerAmount: string;
  discount: string;
  total: string;
  notes: string;
  companyStatement: string;
  waytaUrl: string;
  elmotechUrl: string;
}

const KEYS: (keyof ContractFields)[] = [
  "title",
  "number",
  "date",
  "provider",
  "providerDescription",
  "client",
  "contactName",
  "contactPhone",
  "email",
  "menuUrl",
  "statement",
  "packageName",
  "features",
  "period",
  "starts",
  "ends",
  "serviceStatement",
  "listPrice",
  "offerLabel",
  "offerAmount",
  "discount",
  "total",
  "notes",
  "companyStatement",
  "waytaUrl",
  "elmotechUrl",
];

export function initialContractFields(
  data: ContractData,
  locale: Locale,
): ContractFields {
  const t = CONTRACT_TEXT[locale];
  const { terms } = data;
  const date = (v: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${v}T12:00:00Z`));
  const provider = locale === "ar" ? "ويتا" : "Wayta";
  const features = terms.package.features
    .map(
      (key) =>
        MESSAGES[locale][`feature.${key}` as keyof (typeof MESSAGES)["en"]] ??
        key,
    )
    .join(locale === "ar" ? "، " : ", ");
  const amount = (v: string) => `${v} ${terms.pricing.currencyCode}`;
  return {
    title: t.title,
    number: data.number,
    date: date(data.issuedAt.slice(0, 10)),
    provider,
    providerDescription: t.providerTagline,
    client: terms.restaurant.name,
    contactName: terms.restaurant.ownerContact?.fullName ?? "",
    contactPhone: terms.restaurant.ownerContact?.phone ?? "",
    email: terms.restaurant.ownerEmails.join(", "),
    menuUrl: terms.restaurant.menuUrl ?? "",
    statement: t.statement({
      client: terms.restaurant.name,
      provider,
      packageName: terms.package.name,
      from: date(terms.startsAt),
      to: date(terms.endsAt),
      period: terms.period === "YEARLY" ? t.yearly : t.monthly,
    }),
    packageName: terms.package.name,
    features: features || t.noFeatures,
    period: terms.period === "YEARLY" ? t.yearly : t.monthly,
    starts: date(terms.startsAt),
    ends: date(terms.endsAt),
    serviceStatement: t.serviceProvided(
      provider,
      date(terms.startsAt),
      date(terms.endsAt),
    ),
    listPrice: amount(terms.pricing.listPrice),
    offerLabel: terms.pricing.offer ? t.offer(terms.pricing.offer.percent) : "",
    offerAmount: terms.pricing.offer
      ? `- ${amount(terms.pricing.offer.amount)}`
      : "",
    discount: terms.pricing.discount
      ? `- ${amount(terms.pricing.discount.amount)}`
      : "",
    total: amount(terms.pricing.finalPrice),
    notes: terms.notes ?? "",
    companyStatement:
      locale === "ar"
        ? "ويتا تطبيق تابع لشركة ElmoTech."
        : "Wayta is an application by ElmoTech.",
    waytaUrl: "https://waytaapp.com/",
    elmotechUrl: "https://elmotech.it",
  };
}

export function serializeContract(
  fields: ContractFields,
  legacyText?: string,
): string {
  return JSON.stringify({
    format: "wayta-contract-v2",
    fields,
    ...(legacyText !== undefined ? { legacyText } : {}),
  });
}

/** Keep the generated sentences in sync until an administrator edits their wording. */
export function updateContractField(
  fields: ContractFields,
  key: keyof ContractFields,
  value: string,
  locale: Locale,
): ContractFields {
  const t = CONTRACT_TEXT[locale];
  const statement = (f: ContractFields) =>
    t.statement({
      client: f.client,
      provider: f.provider,
      packageName: f.packageName,
      from: f.starts,
      to: f.ends,
      period: f.period,
    });
  const service = (f: ContractFields) =>
    t.serviceProvided(f.provider, f.starts, f.ends);
  const next = { ...fields, [key]: value };
  if (key !== "statement" && fields.statement === statement(fields))
    next.statement = statement(next);
  if (key !== "serviceStatement" && fields.serviceStatement === service(fields))
    next.serviceStatement = service(next);
  return next;
}

export function parseContract(value: string | null): ContractFields | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("format" in parsed) ||
      parsed.format !== "wayta-contract-v2" ||
      !("fields" in parsed) ||
      !parsed.fields ||
      typeof parsed.fields !== "object" ||
      ("legacyText" in parsed && typeof parsed.legacyText !== "string")
    )
      return null;
    const raw = parsed.fields as Record<string, unknown>;
    if (!KEYS.every((key) => typeof raw[key] === "string")) return null;
    return Object.fromEntries(
      KEYS.map((key) => [key, raw[key]]),
    ) as unknown as ContractFields;
  } catch {
    return null;
  }
}

export function parseLegacyContractText(value: string | null): string | null {
  if (!value || !parseContract(value)) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed &&
      typeof parsed === "object" &&
      "legacyText" in parsed &&
      typeof parsed.legacyText === "string"
      ? parsed.legacyText
      : null;
  } catch {
    return null;
  }
}

/** Reconstructs only the previous unedited default; arbitrary saved text must be preserved verbatim. */
export function legacyDefaultText(data: ContractData, locale: Locale): string {
  const t = CONTRACT_TEXT[locale];
  const { terms } = data;
  const f = initialContractFields(data, locale);
  return [
    t.title,
    `${t.numberLabel}: ${data.number}`,
    `${t.provider}: ${f.provider} — https://waytaapp.com`,
    `${t.client}: ${f.client}`,
    terms.restaurant.menuUrl
      ? `${locale === "ar" ? "رابط المنيو" : "Menu link"}: ${terms.restaurant.menuUrl}`
      : "",
    terms.restaurant.ownerContact
      ? `${t.contactName}: ${f.contactName}\n${t.contactPhone}: ${f.contactPhone}`
      : "",
    f.email,
    "",
    f.statement,
    "",
    `${t.package}: ${f.packageName}`,
    `${t.includes}: ${f.features}`,
    `${t.starts}: ${f.starts}`,
    `${t.ends}: ${f.ends}`,
    `${t.listPrice}: ${f.listPrice}`,
    terms.pricing.offer ? `${f.offerLabel}: ${f.offerAmount}` : "",
    f.discount ? `${t.discount}: ${f.discount}` : "",
    `${t.total}: ${f.total}`,
    f.notes ? `${t.notes}: ${f.notes}` : "",
    "",
    f.serviceStatement,
  ]
    .filter(
      (line, index, lines) =>
        line !== "" || (index > 0 && lines[index - 1] !== ""),
    )
    .join("\n");
}
