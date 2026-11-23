import { platformFetch } from "./client";
import { ApiError } from "./errors";
import type { LeadKind, LeadStatus } from "./leads";

/** Mirrors the Platform onboarding case API. */
export const ONBOARDING_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "PROVISIONING",
  "MENU_SETUP",
  "READY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
export type OnboardingMode = "REAL" | "TRIAL" | "DEMO";
export const ONBOARDING_STEPS = ["customer", "mode", "menu", "review", "handoff"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const onboardingStepCount = (mode: OnboardingMode | null) => ONBOARDING_STEPS.length - (mode === "DEMO" ? 1 : 0);
export const BUSINESS_TYPES = ["RESTAURANT", "CAFE", "SWEETS", "OTHER"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** Server problem codes (stable); each has a message `onboarding.problem.<CODE>`. */
export const CUSTOMER_PROBLEMS = [
  "RESTAURANT_NAME_INVALID",
  "BUSINESS_TYPE_REQUIRED",
  "BRANCH_NAME_INVALID",
  "COUNTRY_INVALID",
  "CURRENCY_INVALID",
  "TIMEZONE_INVALID",
  "DEFAULT_LOCALE_INVALID",
  "ADDITIONAL_LOCALES_INVALID",
  "RESTAURANT_PHONE_INVALID",
  "RESTAURANT_WHATSAPP_INVALID",
  "ADDRESS_TOO_LONG",
  "RESTAURANT_FACEBOOK_URL_INVALID",
  "RESTAURANT_INSTAGRAM_URL_INVALID",
  "RESTAURANT_WEBSITE_URL_INVALID",
  "OWNER_NAME_INVALID",
  "OWNER_PHONE_INVALID",
  "OWNER_EMAIL_INVALID",
  "OWNER_FACEBOOK_URL_INVALID",
  "OWNER_ADDITIONAL_CONTACT_TOO_LONG",
  "ACQUISITION_REQUIRED",
  "ACQUISITION_INVALID",
  "AD_REFERENCE_TOO_LONG",
] as const;
export const MODE_PROBLEMS = [
  "MODE_REQUIRED",
  "PACKAGE_REQUIRED",
  "PACKAGE_NOT_AVAILABLE",
  "TRIAL_DISABLED",
  "TRIAL_DAYS_INVALID",
  "DEMO_KIND_INVALID",
  "DEMO_HOURS_INVALID",
] as const;
export type CustomerProblem = (typeof CUSTOMER_PROBLEMS)[number];
export type ModeProblem = (typeof MODE_PROBLEMS)[number];

export interface RestaurantDraft {
  name: string | null;
  businessType: string | null;
  branchName: string | null;
  countryCode: string | null;
  currencyCode: string | null;
  timezone: string | null;
  defaultLocale: string | null;
  additionalLocales: string[];
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export interface OwnerDraft {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  facebookUrl: string | null;
  additionalContact: string | null;
}

export interface AcquisitionDraft {
  sourceType: string | null;
  referringRestaurantId: string | null;
  sourceName: string | null;
  sourcePlatform: string | null;
  sourceDetail: string | null;
  campaign: string | null;
  /** Kept on the case only (no column in the Restaurant's acquisition record). */
  adReference: string | null;
}

export interface OnboardingDetails {
  restaurant: RestaurantDraft;
  owner: OwnerDraft;
  acquisition: AcquisitionDraft | null;
}

export interface ModeConfig {
  /** Only ever the operator's explicit choice; the server never fills it from the trial default (PO 2026-11-22). */
  packageId: string | null;
  trialDays: number | null;
  demoKind: string | null;
  demoHours: number | null;
}

export interface AdminRef {
  id: string;
  displayName: string;
  email: string;
}

export interface OnboardingCaseSummary {
  id: string;
  status: OnboardingStatus;
  mode: OnboardingMode | null;
  revision: number;
  restaurantName: string | null;
  ownerEmail: string | null;
  leadId: string | null;
  completedSteps: string[];
  updatedBy: AdminRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface MenuTranslation {
  locale: string;
  name: string;
  description?: string;
}

export interface MenuChoiceDraft {
  translations: MenuTranslation[];
  price: string;
}

export interface MenuModifierGroupDraft {
  translations: MenuTranslation[];
  minSelections: number;
  maxSelections: number;
  options: MenuChoiceDraft[];
}

export interface MenuProductDraft extends MenuChoiceDraft {
  variants: MenuChoiceDraft[];
  modifierGroups: MenuModifierGroupDraft[];
}

export interface MenuCategoryDraft {
  translations: MenuTranslation[];
  products: MenuProductDraft[];
}

export interface MenuDraft {
  translations: MenuTranslation[];
  categories: MenuCategoryDraft[];
}

export interface OnboardingMenuDraft {
  menus: MenuDraft[];
}

export interface OnboardingDemoHistory {
  kind: "restaurant" | "cafe" | "sweets";
  label: string;
  packageName: string | null;
  createdAt: string;
  expiresAt: string;
  removedAt: string | null;
  purged: boolean;
}

export interface OnboardingHandoff {
  guestMenuUrl: string;
  staffLoginUrl: string;
}

export interface OnboardingCase {
  id: string;
  status: OnboardingStatus;
  mode: OnboardingMode | null;
  revision: number;
  details: OnboardingDetails;
  modeConfig: ModeConfig;
  completedSteps: OnboardingStep[];
  problems: { customer: CustomerProblem[]; mode: ModeProblem[]; menu: string[] };
  menuDraft: OnboardingMenuDraft | null;
  importExpiresAt: string | null;
  importReviewed: boolean;
  importAttempts: number;
  restaurantId?: string | null;
  provisioningKey: string | null;
  lastErrorCode: string | null;
  ownerPasswordRequired: boolean;
  deliveredAt: string | null;
  handoff: OnboardingHandoff | null;
  demoHistory: OnboardingDemoHistory | null;
  demoState: "ACTIVE" | "EXPIRED" | "PURGED" | null;
  demoExpiresAt: string | null;
  lead: {
    id: string;
    name: string;
    email: string;
    phone: string;
    kind: LeadKind;
    status: LeadStatus;
    packageName: string | null;
    createdAt: string;
  } | null;
  package: { id: string; name: string; nameEn: string; status: "ACTIVE" | "ARCHIVED" } | null;
  /** `defaultPackageId` is a recommendation for TRIAL only, never the case's package until the operator picks it. */
  trialSettings: { enabled: boolean; defaultDays: number; defaultPackageId: string | null };
  demoLimits: { minHours: number; maxHours: number; kinds: string[] };
  createdBy: AdminRef | null;
  updatedBy: AdminRef | null;
  assignedTo: AdminRef | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface OnboardingDuplicates {
  ownerEmailInUse: boolean;
  ownerRestaurants: { id: string; name: string; status: string }[];
  similarRestaurants: { id: string; name: string; status: string }[];
  otherOpenCases: { id: string; restaurantName: string | null; status: OnboardingStatus; updatedAt: string }[];
  matchingLeads: { id: string; name: string; status: string; createdAt: string }[];
}

export interface OnboardingCasePage {
  items: OnboardingCaseSummary[];
  page: number;
  pageSize: number;
  total: number;
}

const PAGE_SIZE = 20;
const path = (id: string) => `/onboarding-cases/${encodeURIComponent(id)}`;

export async function listOnboardingCases(input: {
  search: string;
  status: OnboardingStatus | "";
  page: number;
}): Promise<OnboardingCasePage> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: String(PAGE_SIZE) });
  if (input.search.trim()) params.set("search", input.search.trim());
  if (input.status) params.set("status", input.status);
  const body = await platformFetch<{ data: OnboardingCaseSummary[]; meta: { page: number; pageSize: number; total: number } }>(
    `/onboarding-cases?${params.toString()}`,
  );
  return { items: body.data, ...body.meta };
}

export const getOnboardingCase = (id: string) => platformFetch<{ data: OnboardingCase }>(path(id)).then((r) => r.data);

export const getOnboardingDuplicates = (id: string) =>
  platformFetch<{ data: OnboardingDuplicates }>(`${path(id)}/duplicates`).then((r) => r.data);

export const createOnboardingCase = (leadId?: string) =>
  platformFetch<{ data: OnboardingCase }>("/onboarding-cases", {
    method: "POST",
    body: leadId ? { leadId } : {},
  }).then((r) => r.data);

/**
 * Opens the onboarding case of a lead: creates it, or — when another operator already started one
 * (`409 ONBOARDING_LEAD_IN_PROGRESS`) — returns that case's id. Other errors are thrown.
 */
export async function openOnboardingForLead(leadId: string): Promise<string> {
  try {
    return (await createOnboardingCase(leadId)).id;
  } catch (caught) {
    if (caught instanceof ApiError && caught.code === "ONBOARDING_LEAD_IN_PROGRESS" && typeof caught.details.caseId === "string") {
      return caught.details.caseId;
    }
    throw caught;
  }
}

export interface OnboardingPatch {
  revision: number;
  details?: {
    restaurant?: Partial<RestaurantDraft>;
    owner?: Partial<OwnerDraft>;
    acquisition?: AcquisitionDraft | null;
  };
  modeConfig?: Partial<ModeConfig>;
  mode?: OnboardingMode | null;
  menuDraft?: OnboardingMenuDraft;
}

export const updateOnboardingCase = (id: string, patch: OnboardingPatch) =>
  platformFetch<{ data: OnboardingCase }>(path(id), { method: "PATCH", body: patch }).then((r) => r.data);

export const submitOnboardingForReview = (id: string, revision: number) =>
  platformFetch<{ data: OnboardingCase }>(`${path(id)}/submit-for-review`, { method: "POST", body: { revision } }).then((r) => r.data);

export const cancelOnboardingCase = (id: string, revision: number, confirmNotDelivered = false) =>
  platformFetch<{ data: OnboardingCase }>(`${path(id)}/cancel`, {
    method: "POST",
    body: { revision, ...(confirmNotDelivered ? { confirmNotDelivered: true } : {}) },
  }).then((r) => r.data);

export function importOnboardingMenu(id: string, revision: number, files: readonly File[]) {
  const body = new FormData();
  body.append("revision", String(revision));
  for (const file of files) body.append("file", file);
  return platformFetch<{ data: OnboardingCase }>(`${path(id)}/menu-import`, { method: "POST", body }).then((r) => r.data);
}

export const reviewOnboardingMenu = (id: string, revision: number) =>
  platformFetch<{ data: OnboardingCase }>(`${path(id)}/menu-import/review`, { method: "POST", body: { revision } }).then((r) => r.data);

export const discardOnboardingImport = (id: string, revision: number) =>
  platformFetch<{ data: OnboardingCase }>(`${path(id)}/menu-import`, { method: "DELETE", body: { revision } }).then((r) => r.data);

export interface OnboardingProvisionInput {
  revision: number;
  provisioningKey: string;
  ownerPassword?: string;
}

type OnboardingProvisionResult = OnboardingCase & {
  /** Returned only by the request that first creates the demo. Never part of the case view. */
  demoLink?: string;
};

export const finishOnboardingCase = (id: string, route: "provision" | "retry", body: OnboardingProvisionInput) =>
  platformFetch<{ data: OnboardingProvisionResult }>(`${path(id)}/${route}`, { method: "POST", body }).then((r) => r.data);

export const deliverOnboardingCase = (id: string, revision: number) =>
  platformFetch<{ data: OnboardingCase }>(`${path(id)}/deliver`, { method: "POST", body: { revision } }).then((r) => r.data);
