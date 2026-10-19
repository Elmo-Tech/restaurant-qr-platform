import { ApiError } from "./errors";
import type { MessageKey } from "../i18n/messages";

const BY_CODE: Record<string, MessageKey> = {
  PACKAGE_NAME_TAKEN: "package.err.nameTaken",
  PACKAGE_OFFER_INVALID: "package.err.offerInvalid",
  SUBSCRIPTION_DECIDES_PACKAGE: "package.err.bySubscription",
  PACKAGE_IN_USE: "package.err.inUse",
  PACKAGE_ARCHIVED: "package.err.archived",
  PACKAGE_NOT_FOUND: "package.notFound",
};

/** The message for a package refusal from the Backend, or null for anything else (network, session, 5xx). */
export function packageErrorKey(caught: unknown): MessageKey | null {
  if (!(caught instanceof ApiError)) return null;
  if (caught.code && BY_CODE[caught.code]) return BY_CODE[caught.code];
  return caught.status === 400 ? "package.err.invalid" : null;
}
