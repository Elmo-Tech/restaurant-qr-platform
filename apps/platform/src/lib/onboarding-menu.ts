import { ApiError, isNetworkFailure } from "./api/errors";
import type { OnboardingCase, OnboardingMenuDraft, OnboardingProvisionInput } from "./api/onboarding";
import type { PackageSummary } from "./api/platform";
import type { MessageKey } from "./i18n/messages";
import type { Translate } from "./i18n/translate";
import { hasRequiredSteps } from "./onboarding-steps";

export const IMPORT_ATTEMPT_LIMIT = 3;
export const MENU_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.xlsx,.xls,image/jpeg,image/png,image/webp,application/pdf";
const MB = 1024 * 1024;

/** A client-side hint for obvious file size/count problems; the API checks actual content and eligibility. */
export function menuFileProblem(files: readonly Pick<File, "size">[]): MessageKey | null {
  if (files.length === 0 || files.length > 10 || files.some((file) => file.size === 0)) return "onboarding.menu.error.file";
  if (files.some((file) => file.size > 10 * MB) || files.reduce((size, file) => size + file.size, 0) > 40 * MB) {
    return "onboarding.menu.error.fileSize";
  }
  return null;
}

export function menuCounts(draft: OnboardingMenuDraft) {
  let categories = 0;
  let products = 0;
  for (const menu of draft.menus) {
    categories += menu.categories.length;
    for (const category of menu.categories) products += category.products.length;
  }
  return { menus: draft.menus.length, categories, products };
}

const ENTITY_LABEL = {
  menus: "onboarding.menu.item.menu",
  categories: "onboarding.menu.item.category",
  products: "onboarding.menu.item.product",
  variants: "onboarding.menu.item.variant",
  modifierGroups: "onboarding.menu.item.group",
  options: "onboarding.menu.item.option",
  translations: "onboarding.menu.item.translation",
} as const satisfies Record<string, MessageKey>;

const MENU_PROBLEM = new Map<string, MessageKey>([
  ["menuDraft", "onboarding.menu.problem.menus"],
  ["menus", "onboarding.menu.problem.menus"],
  ["categories", "onboarding.menu.problem.categories"],
  ["products", "onboarding.menu.problem.products"],
  ["translations", "onboarding.menu.problem.translations"],
  ["name", "onboarding.menu.problem.translations"],
  ["locale", "onboarding.menu.problem.locale"],
  ["description", "onboarding.menu.problem.description"],
  ["price", "onboarding.menu.problem.price"],
  ["minSelections", "onboarding.menu.problem.selections"],
  ["maxSelections", "onboarding.menu.problem.selections"],
  ["options", "onboarding.menu.problem.options"],
]);

export function menuProblemText(problem: string, t: Translate, number: (value: number) => string) {
  const codeKey = onboardingErrorKey(problem);
  if (codeKey) return t(codeKey);
  const path = problem.split(".");
  const field = path.at(-1) ?? "";
  const description = t(MENU_PROBLEM.get(field) ?? "onboarding.menu.problem.invalid");
  const location = path.flatMap((part) => {
    const match = /^(menus|categories|products|variants|modifierGroups|options|translations)\[(\d{1,4})\]$/.exec(part);
    if (!match) return [];
    return [t(ENTITY_LABEL[match[1] as keyof typeof ENTITY_LABEL], { n: number(Number(match[2]) + 1) })];
  });
  // Never show raw backend paths or values. The editor uses the same localized row numbers.
  return location.length ? t("onboarding.menu.problem.at", { location: location.join(" / "), description }) : description;
}

const ACTION_ERROR = new Map<string, MessageKey>([
  ["ONBOARDING_INCOMPLETE", "onboarding.final.incomplete"],
  ["ONBOARDING_INVALID_TRANSITION", "onboarding.final.stateChanged"],
  ["ONBOARDING_NOT_EDITABLE", "onboarding.final.stateChanged"],
  ["ONBOARDING_PROVISIONING_KEY_CONFLICT", "onboarding.final.stateChanged"],
  ["OWNER_PASSWORD_REQUIRED", "onboarding.final.passwordHint"],
  ["ONBOARDING_OWNER_EMAIL_IN_USE", "onboarding.final.emailInUse"],
  ["ONBOARDING_GUEST_MENU_NOT_READY", "onboarding.final.menuNotReady"],
  ["ONBOARDING_PROVISIONING_FAILED", "onboarding.final.provisionFailed"],
  ["ONBOARDING_TRIAL_FAILED", "onboarding.final.trialFailed"],
  ["ONBOARDING_DEMO_EXPIRED", "onboarding.handoff.demoExpired"],
  ["ONBOARDING_HANDOFF_UNAVAILABLE", "onboarding.handoff.unavailable"],
  ["ONBOARDING_DEMO_PROVISIONING_FAILED", "onboarding.final.demoFailed"],
  ["ONBOARDING_DEMO_LIMIT_REACHED", "onboarding.final.demoLimit"],
  ["ONBOARDING_RESTAURANT_NOT_ELIGIBLE", "onboarding.final.notEligible"],
  ["PACKAGE_NOT_AVAILABLE", "onboarding.problem.PACKAGE_NOT_AVAILABLE"],
  ["TRIAL_DISABLED", "onboarding.problem.TRIAL_DISABLED"],
  ["FEATURE_NOT_AVAILABLE", "onboarding.menu.error.feature"],
  ["ONBOARDING_IMPORT_EXPIRED", "onboarding.menu.error.expired"],
  ["ONBOARDING_IMPORT_REVIEW_REQUIRED", "onboarding.menu.error.review"],
  ["ONBOARDING_IMPORT_QUOTA", "onboarding.menu.error.quota"],
  ["ONBOARDING_IMPORT_FAILED", "onboarding.menu.error.extraction"],
  ["IMPORT_ALREADY_RUNNING", "onboarding.menu.error.running"],
  ["ONBOARDING_MENU_INCOMPLETE", "onboarding.menu.problem.menus"],
  ["ONBOARDING_MENU_PUBLISH_FAILED", "onboarding.final.menuPublishFailed"],
  ["ONBOARDING_MENU_TARGET_NOT_EMPTY", "onboarding.final.menuTargetNotEmpty"],
  ["IMPORT_FILE_INVALID", "onboarding.menu.error.file"],
  ["IMPORT_FILE_TOO_LARGE", "onboarding.menu.error.fileSize"],
]);
export const onboardingErrorKey = (code: string | null) => (code ? ACTION_ERROR.get(code) : undefined);

/**
 * How the wizard shows a failed request. `case`: the case itself cannot be shown (it does not exist), so the wizard is
 * replaced by the message. `inline`: the wizard, the step and every unsaved edit stay on screen and the message is shown
 * above it. Platform onboarding has no per-case authorization, so a 403 is never "you may not open this case": it is a
 * refused action (FEATURE_NOT_AVAILABLE for a package without Menu import) or a refused Origin (CSRF_VALIDATION_FAILED).
 */
export type OnboardingFailure = { scope: "case" | "inline"; key: MessageKey };

function failureKey(caught: unknown): MessageKey {
  if (isNetworkFailure(caught)) return "common.unreachable";
  if (!(caught instanceof ApiError)) return "common.error";
  if (caught.status === 401) return "onboarding.error.sessionExpired";
  if (caught.code === "CSRF_VALIDATION_FAILED") return "onboarding.error.requestRejected";
  if (caught.code === "PERMISSION_DENIED") return "onboarding.error.permissionDenied";
  const mapped = onboardingErrorKey(caught.code);
  if (mapped) return mapped;
  if (caught.status === 403) return "onboarding.error.actionRefused";
  return "common.error";
}

/** A failed action (save, import, review, submit, provision, deliver, cancel): only a vanished case leaves the wizard. */
export function onboardingActionFailure(caught: unknown): OnboardingFailure {
  if (caught instanceof ApiError && caught.status === 404 && caught.code === "ONBOARDING_CASE_NOT_FOUND") {
    return { scope: "case", key: "onboarding.notFound" };
  }
  return { scope: "inline", key: failureKey(caught) };
}

/** A failed read of the case (first load, reload, or the re-read after a failed action). */
export function onboardingLoadFailure(caught: unknown): OnboardingFailure {
  if (caught instanceof ApiError && caught.status === 404) return { scope: "case", key: "onboarding.notFound" };
  if (caught instanceof ApiError && caught.status === 401) return { scope: "case", key: "common.sessionExpired" };
  if (caught instanceof ApiError && caught.status === 403 && caught.code !== "CSRF_VALIDATION_FAILED") {
    return { scope: "case", key: "onboarding.handoff.accessDenied" };
  }
  return { scope: "case", key: failureKey(caught) };
}

/**
 * Whether the case's SAVED package lets this case stage a menu import (UX only: the API decides, and refuses with
 * 403 FEATURE_NOT_AVAILABLE). `unknown` while packages are loading or could not be loaded: nothing is blocked then.
 */
export type MenuImportAvailability = "available" | "noPackage" | "notInPackage" | "unknown";

export function menuImportAvailability(
  packageId: string | null,
  packages: readonly Pick<PackageSummary, "id" | "features" | "status">[] | null,
): MenuImportAvailability {
  if (!packageId) return "noPackage";
  if (!packages) return "unknown";
  const selected = packages.find((pkg) => pkg.id === packageId);
  if (!selected || selected.status !== "ACTIVE") return "unknown";
  return selected.features.includes("MENU_IMPORT") ? "available" : "notInPackage";
}

type ProvisionState = Pick<OnboardingCase, "status" | "mode" | "completedSteps" | "problems" | "menuDraft" | "importExpiresAt" | "importReviewed">;

/** A1/A2 review may be submitted separately; only the first provisioning call requires every step of the mode's path. */
export function provisionAction(data: ProvisionState): "provision" | "retry" | null {
  if (!data.mode) return null;
  if (data.status === "FAILED") return "retry";
  if (data.status === "PROVISIONING" || data.status === "MENU_SETUP") return "provision";
  if (data.status !== "READY_FOR_REVIEW") return null;
  // A DEMO needs only its mode step; REAL / TRIAL also need the customer step (same rule as the server).
  if (!hasRequiredSteps(data.mode, data.completedSteps)) return null;
  if (data.mode === "DEMO") return "provision"; // Demos use their existing template rather than a customer menu.
  return data.completedSteps.includes("menu") && data.menuDraft && data.problems.menu.length === 0 &&
    (!data.importExpiresAt || data.importReviewed) ? "provision" : null;
}

export function provisioningRequest(
  revision: number,
  state: Pick<OnboardingCase, "provisioningKey" | "ownerPasswordRequired">,
  pendingKey: string | null,
  ownerPassword: string | undefined,
  createKey: () => string,
): OnboardingProvisionInput {
  return {
    revision,
    // Once the server has a claimed key it is authoritative, including after reload or a lost response.
    provisioningKey: state.provisioningKey ?? pendingKey ?? createKey(),
    ...(state.ownerPasswordRequired && ownerPassword !== undefined ? { ownerPassword } : {}),
  };
}
