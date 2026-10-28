import { ApiError, isNetworkFailure } from "./errors";
import type { MessageKey } from "../i18n/messages";

const BY_CODE: Record<string, MessageKey> = {
  ENCRYPTION_NOT_CONFIGURED: "ai.err.encryptionNotConfigured",
  KEYS_MISSING: "ai.err.keysMissing",
  KEY_DUPLICATE: "ai.err.keyDuplicate",
  KEY_LIMIT: "ai.err.keyLimit",
  KEY_UNREADABLE: "ai.err.keyUnreadable",
  KEY_INVALID: "ai.err.keyInvalid",
  LABEL_INVALID: "ai.err.labelInvalid",
  MODEL_INVALID: "ai.err.modelInvalid",
  KEY_NOT_FOUND: "ai.err.keyNotFound",
};

/** The message for a failed AI settings call: the Backend's refusal by its stable code, else network, session or generic. */
export function aiErrorKey(caught: unknown): MessageKey {
  if (isNetworkFailure(caught)) return "common.unreachable";
  if (!(caught instanceof ApiError)) return "common.error";
  if (caught.code && BY_CODE[caught.code]) return BY_CODE[caught.code];
  return caught.status === 401 ? "common.sessionExpired" : "common.error";
}
