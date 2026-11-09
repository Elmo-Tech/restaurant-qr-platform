"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ContractData } from "@/lib/api/billing";
import { platformFetch } from "@/lib/api/client";
import { PLATFORM_API } from "@/lib/api/config";
import {
  initialContractFields,
  legacyDefaultText,
  parseContract,
  parseLegacyContractText,
  serializeContract,
  updateContractField,
  type ContractFields,
} from "@/lib/contract-document-model";
import type { Locale } from "@/lib/i18n/locale";
import { ContractPreview } from "./ContractPreview";

function Field({
  label,
  value,
  onChange,
  multiline = false,
  direction,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  direction?: "ltr";
}) {
  const classes =
    "mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100";
  return (
    <label className="block text-[13px] font-medium text-slate-700">
      {label}
      {multiline ? (
        <textarea
          rows={3}
          className={`${classes} resize-y leading-6`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          dir={direction}
          className={classes}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function ContractEditor({
  data,
  locale,
}: {
  data: ContractData;
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const copy = (arabic: string, english: string) => (ar ? arabic : english);
  const previousFields = parseContract(data.documentText);
  const previousLegacyText = parseLegacyContractText(data.documentText);
  const legacyMode =
    previousLegacyText !== null ||
    (data.documentText !== null &&
      previousFields === null &&
      data.documentText !== legacyDefaultText(data, locale));
  const [fields, setFields] = useState<ContractFields>(
    () => previousFields ?? initialContractFields(data, locale),
  );
  const [legacyText, setLegacyText] = useState(
    previousLegacyText ?? (legacyMode ? (data.documentText ?? "") : ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(data.revision);
  const [assets, setAssets] = useState(data.assets);
  const base = `/subscriptions/${encodeURIComponent(data.subscriptionId)}/contract`;
  const field = (
    key: keyof ContractFields,
    label: string,
    options?: { multiline?: boolean; direction?: "ltr" },
  ) => (
    <Field
      key={key}
      label={label}
      value={fields[key]}
      onChange={(value) =>
        setFields((current) => updateContractField(current, key, value, locale))
      }
      {...options}
    />
  );

  async function write(issue: boolean) {
    const text = serializeContract(fields, legacyMode ? legacyText : undefined);
    if ((legacyMode && !legacyText.trim()) || text.length > 20000) {
      setError(
        copy(
          "راجع نص العقد؛ يجب ألا يتجاوز ٢٠ ألف حرف.",
          "Check the document text; it must be at most 20,000 characters.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await platformFetch(`${base}/${issue ? "issue" : "draft"}`, {
        method: issue ? "POST" : "PUT",
        body: { revision, locale, text },
      });
      if (issue) router.refresh();
      else {
        setRevision((value) => value + 1);
        setMessage(copy("تم حفظ المسودة.", "Draft saved."));
      }
    } catch {
      setError(
        copy(
          "تعذر الحفظ. قد يكون العقد تغيّر؛ أعد تحميل الصفحة وحاول مجددًا.",
          "Could not save. The contract may have changed; reload and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError("");
    try {
      await platformFetch(`${base}/reopen`, { method: "POST" });
      router.refresh();
    } catch {
      setError(
        copy("تعذر إعادة العقد لمسودة.", "Could not reopen the contract."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function upload(
    kind: "seal" | "signature",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (
      file.size > 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    ) {
      setError(
        copy(
          "استخدم صورة PNG أو JPEG أو WebP بحجم لا يزيد عن 1 ميجابايت.",
          "Use a PNG, JPEG or WebP image up to 1 MB.",
        ),
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("revision", String(revision));
      const response = await fetch(`${PLATFORM_API}${base}/images/${kind}`, {
        method: "PUT",
        credentials: "include",
        body,
      });
      if (response.status === 409) throw new Error("CONFLICT");
      if (!response.ok) throw new Error("UPLOAD_FAILED");
      setRevision((value) => value + 1);
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("READ_FAILED"));
        reader.onerror = () => reject(new Error("READ_FAILED"));
        reader.readAsDataURL(file);
      });
      setAssets((current) => ({ ...current, [kind]: source }));
      setMessage(
        copy(
          "تم حفظ الصورة في هذا العقد فقط.",
          "Image saved only in this contract.",
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === "CONFLICT"
          ? copy(
              "العقد اتغيّر؛ أعد تحميل الصفحة قبل رفع الصورة.",
              "The contract changed; reload before uploading.",
            )
          : copy(
              "تعذر رفع الصورة أو عرضها. أعد تحميل الصفحة وحاول مجددًا.",
              "Could not upload or display the image. Reload and try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!data.isDraft && !data.documentText)
    return (
      <div
        dir={ar ? "rtl" : "ltr"}
        className="mx-auto max-w-[210mm] rounded-xl bg-white p-5 text-slate-900 print:hidden"
      >
        <p className="font-semibold">{copy("عقد صادر", "Issued contract")}</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void reopen()}
          className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm"
        >
          {copy("إعادة لمسودة وتعديل", "Reopen as draft")}
        </button>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );

  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className="mx-auto max-w-[1540px] px-4 pb-12 print:max-w-none print:p-0"
    >
      {data.isDraft ? (
        <header className="mx-auto mb-6 flex max-w-[1440px] flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-5 print:hidden">
          <div>
            <p className="text-xs font-bold tracking-wide text-indigo-700">
              {copy("العقود / مسودة", "CONTRACTS / DRAFT")}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">
              {copy("تجهيز عقد الاشتراك", "Prepare subscription agreement")}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {copy(
                "راجع البيانات وشاهد شكل العقد قبل إصداره.",
                "Review the details and preview the agreement before issuing.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="#contract-preview"
              className="flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50 xl:hidden"
            >
              {copy("معاينة العقد", "Preview agreement")}
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void write(false)}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {copy("حفظ المسودة", "Save draft")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void write(true)}
              className="min-h-11 rounded-lg bg-indigo-700 px-5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {copy("إصدار العقد", "Issue contract")}
            </button>
          </div>
        </header>
      ) : (
        <div className="mx-auto mb-4 max-w-[210mm] rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-700 print:hidden">
          {copy("عقد صادر", "Issued contract")}
        </div>
      )}
      {message ? (
        <p
          role="status"
          className="mx-auto mb-4 max-w-[1440px] rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mx-auto mb-4 max-w-[1440px] rounded-lg bg-red-50 p-3 text-sm text-red-800 print:hidden"
        >
          {error}
        </p>
      ) : null}
      <div
        className={`mx-auto max-w-[1440px] ${data.isDraft ? "grid items-start gap-6 xl:grid-cols-[minmax(330px,440px)_minmax(0,1fr)]" : ""} print:block`}
      >
        {data.isDraft ? (
          <div className="space-y-4 print:hidden">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              {copy(
                "تعديل العقد لا يغيّر الاشتراك أو المدفوعات. راجع المبالغ والتواريخ قبل الإصدار.",
                "Editing this document does not change the subscription or payments. Check amounts and dates before issuing.",
              )}
            </div>
            {!legacyMode ? (
              <>
                <Group
                  title={copy("بيانات العقد والعميل", "Agreement and client")}
                  description={copy(
                    "البيانات الأساسية التي تظهر في بداية العقد.",
                    "The details shown at the top of the agreement.",
                  )}
                >
                  {field("title", copy("عنوان العقد", "Agreement title"))}
                  {field("number", copy("رقم العقد", "Agreement number"), {
                    direction: "ltr",
                  })}
                  {field("date", copy("تاريخ العقد", "Agreement date"))}
                  {field("provider", copy("اسم المزوّد", "Provider name"))}
                  {field(
                    "providerDescription",
                    copy("وصف الخدمة", "Provider description"),
                  )}
                  {field("client", copy("اسم البراند", "Brand name"))}
                  {field("contactName", copy("اسم المسؤول", "Contact person"))}
                  {field("contactPhone", copy("رقم الهاتف", "Telephone"), {
                    direction: "ltr",
                  })}
                  {field("email", copy("البريد الإلكتروني", "Email"), {
                    direction: "ltr",
                  })}
                  {field("menuUrl", copy("رابط المنيو", "Menu link"), {
                    direction: "ltr",
                  })}
                </Group>
                <Group
                  title={copy("الخدمة والمدة", "Service and period")}
                  description={copy(
                    "صياغة الاشتراك وتفاصيل الباقة كما ستظهر للعميل.",
                    "The subscription wording and package details shown to the client.",
                  )}
                >
                  {field(
                    "statement",
                    copy("نص الاتفاق", "Agreement statement"),
                    { multiline: true },
                  )}
                  {field("packageName", copy("الباقة", "Package"))}
                  {field("features", copy("تشمل", "Includes"), {
                    multiline: true,
                  })}
                  {field("period", copy("فترة الفوترة", "Billing period"))}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("starts", copy("تاريخ البداية", "Start date"))}
                    {field("ends", copy("تاريخ النهاية", "End date"))}
                  </div>
                  {field(
                    "serviceStatement",
                    copy("وصف تقديم الخدمة", "Service statement"),
                    { multiline: true },
                  )}
                </Group>
                <Group
                  title={copy("القيمة والملاحظات", "Amount and notes")}
                  description={copy(
                    "القيم هنا تخص نسخة العقد القابلة للطباعة.",
                    "These values appear on the printable agreement.",
                  )}
                >
                  {field("listPrice", copy("سعر الباقة", "Package price"), {
                    direction: "ltr",
                  })}
                  {field("offerLabel", copy("اسم العرض", "Offer label"))}
                  {field("offerAmount", copy("قيمة العرض", "Offer amount"), {
                    direction: "ltr",
                  })}
                  {field("discount", copy("خصم العميل", "Customer discount"), {
                    direction: "ltr",
                  })}
                  {field("total", copy("المبلغ المستحق", "Amount due"), {
                    direction: "ltr",
                  })}
                  {field("notes", copy("ملاحظات", "Notes"), {
                    multiline: true,
                  })}
                </Group>
                <Group
                  title={copy("بيانات الشركة", "Company details")}
                  description={copy(
                    "تظهر أسفل العقد بشكل مختصر ورسمي.",
                    "Shown in the footer of the agreement.",
                  )}
                >
                  {field(
                    "companyStatement",
                    copy("تعريف الشركة", "Company statement"),
                    { multiline: true },
                  )}
                  {field("waytaUrl", copy("رابط Wayta", "Wayta website"), {
                    direction: "ltr",
                  })}
                  {field(
                    "elmotechUrl",
                    copy("رابط ElmoTech", "ElmoTech website"),
                    { direction: "ltr" },
                  )}
                </Group>
              </>
            ) : (
              <Group
                title={copy("نص العقد المحفوظ", "Saved agreement text")}
                description={copy(
                  "هذا النص محفوظ من النسخة السابقة ويمكن تعديله كما هو.",
                  "This text was saved in the previous editor and can be edited as-is.",
                )}
              >
                {field("title", copy("عنوان العقد", "Agreement title"))}
                {field("number", copy("رقم العقد", "Agreement number"), {
                  direction: "ltr",
                })}
                {field("date", copy("تاريخ العقد", "Agreement date"))}
                {field("provider", copy("اسم المزوّد", "Provider name"))}
                {field(
                  "client",
                  copy("اسم العميل في التوقيع", "Client signature name"),
                )}
                <Field
                  label={copy("نص العقد", "Agreement text")}
                  value={legacyText}
                  onChange={setLegacyText}
                  multiline
                />
                {field(
                  "companyStatement",
                  copy("تعريف الشركة", "Company statement"),
                  { multiline: true },
                )}
                {field("waytaUrl", copy("رابط Wayta", "Wayta website"), {
                  direction: "ltr",
                })}
                {field(
                  "elmotechUrl",
                  copy("رابط ElmoTech", "ElmoTech website"),
                  { direction: "ltr" },
                )}
              </Group>
            )}
            <Group
              title={copy("التوقيع والختم", "Signature and seal")}
              description={copy(
                "ارفع صور التوقيع والختم لهذا العقد؛ لن تُستخدم في العقود الأخرى.",
                "Upload the signature and seal for this contract; they are not used in other agreements.",
              )}
            >
              {(["signature", "seal"] as const).map((kind) => (
                <label
                  key={kind}
                  className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:border-indigo-500"
                >
                  <span>
                    {kind === "signature"
                      ? copy("صورة التوقيع", "Signature image")
                      : copy("صورة الختم", "Seal image")}
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {assets[kind]
                        ? copy(
                            "الصورة مرفوعة · اضغط للاستبدال",
                            "Uploaded · select to replace",
                          )
                        : copy(
                            "PNG أو JPG أو WebP · حتى 1 ميجابايت",
                            "PNG, JPG or WebP · up to 1 MB",
                          )}
                    </span>
                  </span>
                  <span className="rounded-md bg-slate-100 px-3 py-1.5 text-xs">
                    {copy("اختيار صورة", "Choose image")}
                  </span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) => void upload(kind, event)}
                  />
                </label>
              ))}
            </Group>
          </div>
        ) : null}
        <div id="contract-preview" className="min-w-0">
          <div className="mx-auto mb-3 flex max-w-[210mm] items-center justify-between text-xs font-semibold text-slate-600 print:hidden">
            <span>{copy("معاينة العقد", "Agreement preview")}</span>
            <span dir="ltr">A4</span>
          </div>
          <ContractPreview
            fields={fields}
            locale={locale}
            assets={assets}
            {...(legacyMode ? { legacyText } : {})}
          />
        </div>
      </div>
    </main>
  );
}
