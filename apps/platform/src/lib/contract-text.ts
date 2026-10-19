import type { ContractData } from "./api/billing";
import { MESSAGES } from "./i18n/messages";

/**
 * The wording of a Wayta subscription contract, in English and Arabic side by side (DEC-049). It is a
 * working draft of the commercial terms and should be reviewed by a lawyer before it is relied on. The
 * numbers, dates and parties always come from the snapshot stored with the contract, never from the
 * current package, so an old contract never changes.
 */
export interface Clause {
  en: { title: string; body: string };
  ar: { title: string; body: string };
}

type Terms = ContractData["terms"];

const featureNames = (terms: Terms, locale: "en" | "ar") =>
  terms.package.features
    .map((key) => MESSAGES[locale][`feature.${key}` as keyof (typeof MESSAGES)["en"]] ?? key)
    .join(locale === "ar" ? "، " : ", ");

export function buildClauses(terms: Terms): Clause[] {
  const { graceDays } = terms;
  return [
    {
      en: {
        title: "1. Subject",
        body: `Wayta ("the Provider") grants the Restaurant named above ("the Client") a subscription to the Wayta platform (digital QR menu and the tools around it) on the package "${terms.package.name}"${
          terms.package.features.length > 0 ? `, which includes: ${featureNames(terms, "en")}` : ""
        }.`,
      },
      ar: {
        title: "١. الموضوع",
        body: `تمنح "ويتا" ("المزوِّد") المطعم المذكور أعلاه ("العميل") اشتراكًا في منصة ويتا (المنيو الرقمي بالـQR والأدوات المرتبطة به) على باقة "${terms.package.name}"${
          terms.package.features.length > 0 ? `، وتشمل: ${featureNames(terms, "ar")}` : ""
        }.`,
      },
    },
    {
      en: {
        title: "2. Term",
        body: `The subscription runs from ${terms.startsAt} until ${terms.endsAt} (${terms.period === "YEARLY" ? "one year" : "one month"}). The end date is the first day it is no longer covered.`,
      },
      ar: {
        title: "٢. المدة",
        body: `يسري الاشتراك من ${terms.startsAt} حتى ${terms.endsAt} (${terms.period === "YEARLY" ? "سنة واحدة" : "شهر واحد"}). تاريخ النهاية هو أول يوم لا يغطيه الاشتراك.`,
      },
    },
    {
      en: {
        title: "3. Fees",
        body: "The fees are those shown in the table above, in the stated currency. The price is fixed for this term: later changes to the Provider's prices do not affect it.",
      },
      ar: {
        title: "٣. الرسوم",
        body: "الرسوم هي المبيّنة في الجدول أعلاه بالعملة المذكورة. السعر ثابت طوال هذه المدة، ولا تؤثر عليه أي تغييرات لاحقة في أسعار المزوِّد.",
      },
    },
    {
      en: {
        title: "4. Payment",
        body: "The Client pays the fees by the means agreed with the Provider (cash, bank transfer, InstaPay or mobile wallet). The Provider records every payment received and gives the Client a confirmation on request.",
      },
      ar: {
        title: "٤. السداد",
        body: "يسدّد العميل الرسوم بالوسيلة المتفق عليها مع المزوِّد (نقدًا أو تحويلًا بنكيًا أو إنستا باي أو محفظة إلكترونية). يسجّل المزوِّد كل دفعة مستلمة ويعطي العميل إفادة بها عند الطلب.",
      },
    },
    {
      en: {
        title: "5. End of the term",
        body: `The subscription does not renew by itself. After it ends the service keeps running for ${graceDays} days; then the Client's account is suspended until a new subscription is recorded. Suspension does not delete the Client's menu or data.`,
      },
      ar: {
        title: "٥. انتهاء المدة",
        body: `لا يتجدد الاشتراك تلقائيًا. بعد انتهائه تستمر الخدمة ${graceDays} أيام، ثم يُوقَف حساب العميل إلى حين تسجيل اشتراك جديد. لا يؤدي الإيقاف إلى حذف المنيو أو بيانات العميل.`,
      },
    },
    {
      en: {
        title: "6. The Client's responsibilities",
        body: "The Client is responsible for the accuracy of its menu, prices and offers, for the content it uploads, and for keeping the passwords of its staff accounts confidential.",
      },
      ar: {
        title: "٦. التزامات العميل",
        body: "العميل مسؤول عن دقة المنيو والأسعار والعروض، وعن المحتوى الذي يرفعه، وعن سرّية كلمات مرور حسابات موظفيه.",
      },
    },
    {
      en: {
        title: "7. The service",
        body: "The Provider works to keep the service available and to fix faults promptly, but does not promise that it will be uninterrupted or free of errors. Planned maintenance is announced where possible.",
      },
      ar: {
        title: "٧. الخدمة",
        body: "يعمل المزوِّد على إبقاء الخدمة متاحة وإصلاح الأعطال سريعًا، لكنه لا يتعهد بأنها ستعمل دون انقطاع أو أخطاء. تُعلَن الصيانة المجدولة متى أمكن.",
      },
    },
    {
      en: {
        title: "8. Data",
        body: "The menu and the other content belong to the Client. The Provider uses the Client's data only to provide the service and does not sell it.",
      },
      ar: {
        title: "٨. البيانات",
        body: "المنيو وباقي المحتوى ملك للعميل. يستخدم المزوِّد بيانات العميل لتقديم الخدمة فقط ولا يبيعها.",
      },
    },
    {
      en: {
        title: "9. Cancellation",
        body: "Either party may end the subscription by written notice. Fees already paid for a period that has started are not refunded unless the Provider agrees in writing.",
      },
      ar: {
        title: "٩. الإلغاء",
        body: "يجوز لأي من الطرفين إنهاء الاشتراك بإخطار كتابي. لا تُردّ الرسوم المدفوعة عن فترة بدأت إلا بموافقة كتابية من المزوِّد.",
      },
    },
  ];
}
