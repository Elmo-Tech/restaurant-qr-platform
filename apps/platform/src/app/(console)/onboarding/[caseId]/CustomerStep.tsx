"use client";

import { CountrySelect } from "@/components/country-select";
import { Card, CardHeader, Select } from "@/components/ui";
import type { AcquisitionSourceType, RestaurantAcquisitionInput } from "@/lib/api/platform";
import { BUSINESS_TYPES, type AcquisitionDraft, type OnboardingDetails, type OwnerDraft, type RestaurantDraft } from "@/lib/api/onboarding";
import { useI18n } from "@/lib/i18n/client";
import { AcquisitionSourceFields } from "../../restaurants/new/AcquisitionSourceFields";
import { describedBy, Field, TextField } from "./fields";

const LOCALES = [
  { code: "ar", label: "العربية" },
  { code: "en", label: "English" },
] as const;

export type CustomerField = `restaurant.${keyof RestaurantDraft}` | `owner.${keyof OwnerDraft}` | "acquisition";

/** Step 1: the customer, the restaurant and how they found us. Every value is a draft until provisioning. */
export function CustomerStep({
  details,
  disabled,
  errorFor,
  onTouch,
  onRestaurant,
  onOwner,
  onAcquisition,
}: {
  details: OnboardingDetails;
  disabled: boolean;
  /** The localized server problem of a field, or null (only once the field was touched or Continue was pressed). */
  errorFor: (field: CustomerField) => string | null;
  onTouch: (field: CustomerField) => void;
  onRestaurant: <K extends keyof RestaurantDraft>(key: K, value: RestaurantDraft[K]) => void;
  onOwner: <K extends keyof OwnerDraft>(key: K, value: OwnerDraft[K]) => void;
  onAcquisition: (value: AcquisitionDraft | null) => void;
}) {
  const { t } = useI18n();
  const { restaurant, owner, acquisition } = details;
  const text = (key: keyof RestaurantDraft) => ({
    error: errorFor(`restaurant.${key}`),
    onBlur: () => onTouch(`restaurant.${key}`),
  });
  const ownerText = (key: keyof OwnerDraft) => ({
    error: errorFor(`owner.${key}`),
    onBlur: () => onTouch(`owner.${key}`),
  });
  const defaultLocale = restaurant.defaultLocale ?? "ar";
  const acquisitionValue: RestaurantAcquisitionInput | null = acquisition?.sourceType
    ? {
        sourceType: acquisition.sourceType as AcquisitionSourceType,
        referringRestaurantId: acquisition.referringRestaurantId,
        sourceName: acquisition.sourceName,
        sourcePlatform: acquisition.sourcePlatform,
        sourceDetail: acquisition.sourceDetail,
        campaign: acquisition.campaign,
      }
    : null;

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-6">
      <Card>
        <CardHeader title={t("onboarding.s1.restaurant")} description={t("onboarding.s1.restaurantHint")} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            id="ob-r-name"
            className="sm:col-span-2"
            label={t("restaurantNew.name")}
            value={restaurant.name}
            onValue={(value) => onRestaurant("name", value)}
            maxLength={100}
            {...text("name")}
          />
          <Field id="ob-r-type" label={t("onboarding.s1.businessType")} error={errorFor("restaurant.businessType")}>
            <Select
              id="ob-r-type"
              value={restaurant.businessType ?? ""}
              onChange={(event) => onRestaurant("businessType", event.target.value || null)}
              onBlur={() => onTouch("restaurant.businessType")}
              {...describedBy("ob-r-type", false, errorFor("restaurant.businessType"))}
            >
              <option value="">{t("onboarding.s1.chooseType")}</option>
              {BUSINESS_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`onboarding.businessType.${type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <TextField
            id="ob-r-branch"
            label={t("restaurantNew.branch")}
            value={restaurant.branchName}
            onValue={(value) => onRestaurant("branchName", value)}
            maxLength={100}
            {...text("branchName")}
          />
          <Field
            id="ob-r-country"
            className="sm:col-span-2"
            label={t("restaurantNew.country")}
            hint={t("restaurantNew.countryHint")}
            error={errorFor("restaurant.countryCode")}
          >
            <CountrySelect
              id="ob-r-country"
              value={restaurant.countryCode ?? ""}
              onChange={(code) => onRestaurant("countryCode", code)}
              disabled={disabled}
            />
          </Field>
          <TextField
            id="ob-r-currency"
            label={t("restaurantNew.currency")}
            value={restaurant.currencyCode}
            onValue={(value) => onRestaurant("currencyCode", value.toUpperCase())}
            maxLength={3}
            ltr
            {...text("currencyCode")}
          />
          <TextField
            id="ob-r-timezone"
            label={t("restaurantNew.timezone")}
            value={restaurant.timezone}
            onValue={(value) => onRestaurant("timezone", value)}
            maxLength={64}
            placeholder="Africa/Cairo"
            ltr
            {...text("timezone")}
          />
          <Field id="ob-r-locale" label={t("restaurantNew.language")} error={errorFor("restaurant.defaultLocale")}>
            <Select
              id="ob-r-locale"
              value={defaultLocale}
              onChange={(event) => {
                onRestaurant("defaultLocale", event.target.value);
                // The default language cannot also be an additional one.
                onRestaurant(
                  "additionalLocales",
                  restaurant.additionalLocales.filter((code) => code !== event.target.value),
                );
              }}
            >
              {LOCALES.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.label}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="min-w-0">
            <legend className="mb-1.5 block text-[13px] font-medium text-foreground">{t("onboarding.s1.additionalLocales")}</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              {LOCALES.filter((locale) => locale.code !== defaultLocale).map((locale) => (
                <label key={locale.code} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={restaurant.additionalLocales.includes(locale.code)}
                    onChange={(event) =>
                      onRestaurant(
                        "additionalLocales",
                        event.target.checked
                          ? [...restaurant.additionalLocales, locale.code]
                          : restaurant.additionalLocales.filter((code) => code !== locale.code),
                      )
                    }
                  />
                  {locale.label}
                </label>
              ))}
            </div>
            {errorFor("restaurant.additionalLocales") ? (
              <p className="mt-1.5 text-xs font-medium text-danger">{errorFor("restaurant.additionalLocales")}</p>
            ) : null}
          </fieldset>
          <TextField
            id="ob-r-phone"
            type="tel"
            label={t("onboarding.s1.restaurantPhone")}
            value={restaurant.phone}
            onValue={(value) => onRestaurant("phone", value)}
            maxLength={32}
            placeholder="+201000000001"
            ltr
            {...text("phone")}
          />
          <TextField
            id="ob-r-whatsapp"
            type="tel"
            label={t("onboarding.s1.whatsapp")}
            hint={t("onboarding.s1.whatsappHint")}
            value={restaurant.whatsapp}
            onValue={(value) => onRestaurant("whatsapp", value)}
            maxLength={32}
            placeholder="+201000000001"
            ltr
            {...text("whatsapp")}
          />
          <TextField
            id="ob-r-address"
            className="sm:col-span-2"
            label={t("onboarding.s1.address")}
            value={restaurant.address}
            onValue={(value) => onRestaurant("address", value)}
            maxLength={300}
            {...text("address")}
          />
          <TextField
            id="ob-r-facebook"
            label={t("onboarding.s1.facebook")}
            value={restaurant.facebookUrl}
            onValue={(value) => onRestaurant("facebookUrl", value)}
            maxLength={300}
            placeholder="https://facebook.com/..."
            ltr
            {...text("facebookUrl")}
          />
          <TextField
            id="ob-r-instagram"
            label={t("onboarding.s1.instagram")}
            value={restaurant.instagramUrl}
            onValue={(value) => onRestaurant("instagramUrl", value)}
            maxLength={300}
            placeholder="https://instagram.com/..."
            ltr
            {...text("instagramUrl")}
          />
          <TextField
            id="ob-r-website"
            className="sm:col-span-2"
            label={t("onboarding.s1.website")}
            value={restaurant.websiteUrl}
            onValue={(value) => onRestaurant("websiteUrl", value)}
            maxLength={300}
            placeholder="https://"
            ltr
            {...text("websiteUrl")}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("onboarding.s1.owner")} description={t("onboarding.s1.ownerHint")} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextField
            id="ob-o-name"
            label={t("ownerContact.name")}
            value={owner.fullName}
            onValue={(value) => onOwner("fullName", value)}
            maxLength={120}
            autoComplete="off"
            {...ownerText("fullName")}
          />
          <TextField
            id="ob-o-phone"
            type="tel"
            label={t("ownerContact.phone")}
            value={owner.phone}
            onValue={(value) => onOwner("phone", value)}
            maxLength={32}
            placeholder="+201000000001"
            autoComplete="off"
            ltr
            {...ownerText("phone")}
          />
          <TextField
            id="ob-o-email"
            type="email"
            className="sm:col-span-2"
            label={t("restaurantNew.ownerEmail")}
            hint={t("onboarding.s1.emailHint")}
            value={owner.email}
            onValue={(value) => onOwner("email", value)}
            maxLength={254}
            autoComplete="off"
            ltr
            {...ownerText("email")}
          />
          <TextField
            id="ob-o-facebook"
            className="sm:col-span-2"
            label={t("ownerContact.facebook")}
            value={owner.facebookUrl}
            onValue={(value) => onOwner("facebookUrl", value)}
            maxLength={300}
            placeholder="https://facebook.com/..."
            ltr
            {...ownerText("facebookUrl")}
          />
          <TextField
            id="ob-o-extra"
            className="sm:col-span-2"
            label={t("onboarding.s1.additionalContact")}
            hint={t("onboarding.s1.additionalContactHint")}
            value={owner.additionalContact}
            onValue={(value) => onOwner("additionalContact", value)}
            maxLength={300}
            {...ownerText("additionalContact")}
          />
          <p className="rounded-lg bg-surface-2 px-4 py-3 text-[13px] text-muted-foreground sm:col-span-2">
            {t("onboarding.s1.noPassword")}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title={t("acquisition.section")} description={t("acquisition.description")} />
        <AcquisitionSourceFields
          value={acquisitionValue}
          onChange={(next) => {
            onTouch("acquisition");
            onAcquisition(
              next
                ? {
                    sourceType: next.sourceType,
                    referringRestaurantId: next.referringRestaurantId ?? null,
                    sourceName: next.sourceName ?? null,
                    sourcePlatform: next.sourcePlatform ?? null,
                    sourceDetail: next.sourceDetail ?? null,
                    campaign: next.campaign ?? null,
                    // Keep the case-only ad reference while the source stays a paid ad.
                    adReference: next.sourceType === "PAID_AD" ? (acquisition?.adReference ?? null) : null,
                  }
                : null,
            );
          }}
        />
        {acquisition?.sourceType === "PAID_AD" ? (
          <div className="px-5 pb-5">
            <TextField
              id="ob-a-ad"
              label={t("onboarding.s1.adReference")}
              hint={t("onboarding.s1.adReferenceHint")}
              value={acquisition.adReference}
              onValue={(value) => onAcquisition({ ...acquisition, adReference: value })}
              maxLength={160}
              ltr
            />
          </div>
        ) : null}
        {errorFor("acquisition") ? (
          <p className="px-5 pb-5 text-xs font-medium text-danger" role="status">
            {errorFor("acquisition")}
          </p>
        ) : null}
      </Card>
    </fieldset>
  );
}
