import { ApiError, isNetworkFailure } from "./errors";
import type { MessageKey } from "../i18n/messages";
import type { Translate } from "../i18n/translate";

const BY_CODE: Record<string, MessageKey> = {
  SUBSCRIPTION_OVERLAP: "billing.err.overlap",
  PACKAGE_PRICE_NOT_SET: "billing.err.priceNotSet",
  DISCOUNT_INVALID: "billing.err.discount",
  PACKAGE_ARCHIVED: "billing.err.archived",
  DATE_INVALID: "billing.err.date",
  AMOUNT_INVALID: "billing.err.amount",
  COUNTRY_INVALID: "billing.err.country",
  SUBSCRIPTION_CANCELLED: "billing.err.cancelled",
  SUBSCRIPTION_ALREADY_CANCELLED: "billing.err.cancelled",
  PACKAGE_NOT_FOUND: "package.notFound",
  RESTAURANT_NOT_FOUND: "detail.notFound",
};

/** The message for a refused billing request, or the generic network / session / server message. */
export function billingErrorMessage(caught: unknown, t: Translate): string {
  if (caught instanceof ApiError) {
    if (caught.code && BY_CODE[caught.code]) return t(BY_CODE[caught.code]);
    if (caught.status === 400) return t("billing.err.invalid");
    if (caught.status === 401) return t("common.sessionExpired");
  }
  return isNetworkFailure(caught) ? t("common.unreachable") : t("common.error");
}
