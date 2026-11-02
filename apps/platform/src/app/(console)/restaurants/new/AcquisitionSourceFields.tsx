"use client";

import { useEffect, useState } from "react";
import { Input, Label, Select } from "@/components/ui";
import {
  listRestaurants,
  type AcquisitionSourceType,
  type RestaurantAcquisitionInput,
  type RestaurantSummary,
} from "@/lib/api/platform";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/messages";

const SOURCES: { type: AcquisitionSourceType; title: MessageKey }[] = [
  { type: "CUSTOMER_REFERRAL", title: "acquisition.type.customer" },
  { type: "EMPLOYEE_REFERRAL", title: "acquisition.type.employee" },
  { type: "SALES", title: "acquisition.type.sales" },
  { type: "SOCIAL_MEDIA", title: "acquisition.type.social" },
  { type: "PAID_AD", title: "acquisition.type.ad" },
  { type: "WEBSITE", title: "acquisition.type.website" },
  { type: "DIRECT", title: "acquisition.type.direct" },
  { type: "OTHER", title: "acquisition.type.other" },
];

const SOCIAL: { code: string; title: string }[] = [
  { code: "FACEBOOK", title: "Facebook" },
  { code: "INSTAGRAM", title: "Instagram" },
  { code: "TIKTOK", title: "TikTok" },
  { code: "WHATSAPP", title: "WhatsApp" },
  { code: "LINKEDIN", title: "LinkedIn" },
  { code: "YOUTUBE", title: "YouTube" },
  { code: "X", title: "X" },
  { code: "OTHER", title: "Other" },
];
const ADS: { code: string; title: string }[] = [
  { code: "FACEBOOK", title: "Facebook Ads" },
  { code: "INSTAGRAM", title: "Instagram Ads" },
  { code: "TIKTOK", title: "TikTok Ads" },
  { code: "GOOGLE", title: "Google Ads" },
  { code: "YOUTUBE", title: "YouTube Ads" },
  { code: "OTHER", title: "Other" },
];

const empty = (sourceType: AcquisitionSourceType): RestaurantAcquisitionInput => ({
  sourceType,
  referringRestaurantId: null,
  sourceName: null,
  sourcePlatform: null,
  sourceDetail: null,
  campaign: null,
});

export function AcquisitionSourceFields({
  value,
  onChange,
}: {
  value: RestaurantAcquisitionInput | null;
  onChange: (value: RestaurantAcquisitionInput | null) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<RestaurantSummary[]>([]);
  const [selectedReferrer, setSelectedReferrer] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);
  const sourceType = value?.sourceType ?? null;
  const isCustomer = sourceType === "CUSTOMER_REFERRAL";

  // Search only the Platform Admin's existing restaurant directory, never Staff or public APIs.
  useEffect(() => {
    if (!isCustomer || query.trim().length < 2 || value?.referringRestaurantId) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void listRestaurants({ search: query.trim(), status: "", page: 1 })
        .then((page) => {
          if (!cancelled) {
            setMatches(page.items);
            setSearchFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setMatches([]);
            setSearchFailed(true);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isCustomer, query, value?.referringRestaurantId]);

  const change = (patch: Partial<RestaurantAcquisitionInput>) => {
    if (value) onChange({ ...value, ...patch });
  };

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="acquisition-type">{t("acquisition.source")}</Label>
        <Select
          id="acquisition-type"
          value={sourceType ?? ""}
          onChange={(event) => {
            const next = event.target.value as AcquisitionSourceType | "";
            onChange(next ? empty(next) : null);
            setQuery("");
            setMatches([]);
            setSelectedReferrer("");
            setSearchFailed(false);
          }}
          required
        >
          <option value="">{t("acquisition.choose")}</option>
          {SOURCES.map((source) => (
            <option key={source.type} value={source.type}>
              {t(source.title)}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-muted-foreground">{t("acquisition.privateHint")}</p>
      </div>

      {isCustomer ? (
        <div className="sm:col-span-2">
          <Label htmlFor="acquisition-customer">{t("acquisition.customer")}</Label>
          {value?.referringRestaurantId ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{selectedReferrer}</p>
                <p className="text-xs text-muted-foreground">{t("acquisition.customerSelected")}</p>
              </div>
              <button
                type="button"
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary-text hover:bg-surface"
                onClick={() => {
                  change({ referringRestaurantId: null, sourceName: null });
                  setSelectedReferrer("");
                  setQuery("");
                  setMatches([]);
                }}
              >
                {t("acquisition.clear")}
              </button>
            </div>
          ) : (
            <>
              <Input
                id="acquisition-customer"
                value={value?.sourceName ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  setMatches([]);
                  change({ sourceName: next, referringRestaurantId: null });
                }}
                placeholder={t("acquisition.customerPlaceholder")}
                maxLength={200}
                autoComplete="off"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{t("acquisition.customerHint")}</p>
              {searchFailed ? (
                <p role="status" className="mt-2 text-xs text-warning">{t("acquisition.searchUnavailable")}</p>
              ) : null}
              {matches.length ? (
                <ul
                  aria-label={t("acquisition.matchingCustomers")}
                  className="mt-2 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border"
                >
                  {matches.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => {
                          change({ referringRestaurantId: candidate.id, sourceName: null });
                          setSelectedReferrer(candidate.name);
                          setQuery("");
                          setMatches([]);
                        }}
                      >
                        <span className="font-medium">{candidate.name}</span>
                        <span dir="ltr" className="text-xs text-muted-foreground">{candidate.publicId}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {sourceType === "EMPLOYEE_REFERRAL" || sourceType === "SALES" ? (
        <div className="sm:col-span-2">
          <Label htmlFor="acquisition-name">
            {t(sourceType === "SALES" ? "acquisition.salesName" : "acquisition.employeeName")}
          </Label>
          <Input
            id="acquisition-name"
            value={value?.sourceName ?? ""}
            onChange={(e) => change({ sourceName: e.target.value })}
            placeholder={t("acquisition.namePlaceholder")}
            maxLength={200}
            required
          />
        </div>
      ) : null}

      {sourceType === "SOCIAL_MEDIA" || sourceType === "PAID_AD" ? (
        <>
          <div className="sm:col-span-2">
            <Label htmlFor="acquisition-platform">{t("acquisition.platform")}</Label>
            <Select
              id="acquisition-platform"
              value={value?.sourcePlatform ?? ""}
              onChange={(e) => change({ sourcePlatform: e.target.value, sourceDetail: null })}
              required
            >
              <option value="">{t("acquisition.choosePlatform")}</option>
              {(sourceType === "SOCIAL_MEDIA" ? SOCIAL : ADS).map((platform) => (
                <option key={platform.code} value={platform.code}>{platform.title}</option>
              ))}
            </Select>
          </div>
          {value?.sourcePlatform === "OTHER" ? (
            <div className="sm:col-span-2">
              <Label htmlFor="acquisition-other-platform">{t("acquisition.otherPlatform")}</Label>
              <Input id="acquisition-other-platform" value={value?.sourceDetail ?? ""}
                onChange={(e) => change({ sourceDetail: e.target.value })} maxLength={300} required />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="acquisition-campaign">{t("acquisition.campaign")}</Label>
            <Input id="acquisition-campaign" value={value?.campaign ?? ""}
              onChange={(e) => change({ campaign: e.target.value })} maxLength={160}
              placeholder={t("acquisition.campaignPlaceholder")} />
          </div>
        </>
      ) : null}

      {sourceType === "WEBSITE" || sourceType === "DIRECT" || sourceType === "OTHER" ? (
        <div className="sm:col-span-2">
          <Label htmlFor="acquisition-detail">{t("acquisition.specificSource")}</Label>
          <Input
            id="acquisition-detail"
            value={value?.sourceDetail ?? ""}
            onChange={(e) => change({ sourceDetail: e.target.value })}
            placeholder={t("acquisition.detailPlaceholder")}
            maxLength={300}
            required
          />
        </div>
      ) : null}
    </div>
  );
}
