import { platformFetch } from "./client";

/** Mirrors the Backend's platform responses (`apps/api/src/platform`). */
export type RestaurantStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export const FEATURE_KEYS = [
  "WHATSAPP_ORDERING",
  "ORDER_TRACKING",
  "SMART_SUGGESTIONS",
  "MENU_TEMPLATES",
  "DASHBOARD_ORDERING",
  "KITCHEN",
  "TABLE_ORDERING",
  "MENU_IMPORT",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Features that are OFF until the platform turns them on (DEC-057): a package includes one only if it lists it, and a
 * restaurant with no package does not have it. "Select all" skips them, and a restaurant without them is not "restricted".
 */
export const OPT_IN_FEATURES: readonly FeatureKey[] = ["MENU_IMPORT"];

/**
 * The three ways a guest can place an order. Each is its own feature: a package with none of them
 * is a view-only menu (the guest can browse, not order).
 */
export const ORDERING_FEATURES: readonly FeatureKey[] = ["WHATSAPP_ORDERING", "DASHBOARD_ORDERING", "TABLE_ORDERING"];
/** The features the package editor lists under "ordering": the order channels and the kitchen screen (which is not itself a way to receive orders). */
export const ORDERING_GROUP: readonly FeatureKey[] = [...ORDERING_FEATURES, "KITCHEN"];
export const isDisplayOnly = (features: readonly FeatureKey[]) =>
  !features.some((key) => ORDERING_FEATURES.includes(key));

export interface Admin {
  id: string;
  email: string;
  displayName: string;
}

export interface PlatformPublicSettings {
  poweredByUrl: string;
  updatedAt: string | null;
}

export interface PlatformTrialSettings {
  enabled: boolean;
  defaultDays: number;
  defaultPackage: { id: string; name: string } | null;
  updatedAt: string | null;
}

export interface AuditEntry {
  id: string;
  action: string;
  adminEmail: string;
  restaurantId: string | null;
  restaurantName: string | null;
  details: unknown;
  createdAt: string;
}

export interface MoneyTotal {
  currencyCode: string;
  amount: string;
}

/** Where a restaurant's subscription stands today (DEC-049). */
export interface SubscriptionBrief {
  kind: "PAID" | "TRIAL";
  phase: "ACTIVE" | "GRACE" | "EXPIRED" | "UPCOMING" | "CANCELLED";
  daysLeft: number;
  graceDaysLeft: number;
  endsAt: string;
  packageName: string;
  period: "MONTHLY" | "YEARLY" | null;
  currencyCode: string;
  balance: string;
  paymentStatus: string;
}

export interface Overview {
  restaurants: { total: number; active: number; suspended: number; inactive: number };
  last30Days: { newRestaurants: number; orders: number };
  totals: { branches: number; products: number; orders: number };
  restrictedRestaurants: number;
  /** Upgrade and renewal requests nobody has finished yet (DEC-050). */
  openRequests: number;
  /** Landing page requests nobody has finished yet (DEC-053). */
  openLeads: number;
  billing: {
    ending: {
      restaurantId: string;
      restaurantName: string;
      packageName: string;
      phase: "ACTIVE" | "GRACE";
      daysLeft: number;
      graceDaysLeft: number;
      endsAt: string;
    }[];
    unpaid: { restaurantId: string; restaurantName: string; packageName: string; currencyCode: string; balance: string }[];
    unpaidCount: number;
    outstanding: MoneyTotal[];
    received30d: MoneyTotal[];
  };
  recentRestaurants: { id: string; name: string; status: RestaurantStatus; createdAt: string }[];
  recentActivity: AuditEntry[];
}

export interface RestaurantSummary {
  id: string;
  publicId: string;
  name: string;
  status: RestaurantStatus;
  defaultLocale: string;
  currencyCode: string;
  createdAt: string;
  counts: { branches: number; products: number; staff: number; orders30d: number };
  /** The package the platform assigned; null = none, every feature. */
  package: { id: string; name: string } | null;
  /** Features this restaurant effectively lacks (package and overrides applied). */
  disabledFeatures: FeatureKey[];
  /** Its subscription today; null = it never had one. */
  subscription: SubscriptionBrief | null;
}

export interface RestaurantPage {
  items: RestaurantSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export type FeatureSource = "override" | "package" | "default";

export interface FeatureState {
  key: FeatureKey;
  enabled: boolean;
  overridden: boolean;
  /** What decides it: the restaurant's own override, its package, or the default. */
  source: FeatureSource;
  /** What it would be without the restaurant's own override. */
  baseEnabled: boolean;
}

export type PackageStatus = "ACTIVE" | "ARCHIVED";

/** The Guest menu templates a package can allow besides Classic, which is always allowed (DEC-051). */
export const PACKAGE_TEMPLATES = ["LIST", "GALLERY", "MENU", "FLOATING", "CENTERED", "COMPACT", "EDITORIAL", "EMBER", "BLOOM", "BREW"] as const;
export type PackageTemplate = (typeof PACKAGE_TEMPLATES)[number];

/** The tier of each design (DEC-052); Classic is standard and always included. Mirrors the API. */
export const STANDARD_TEMPLATES = ["LIST", "CENTERED", "COMPACT", "EDITORIAL"] as const satisfies readonly PackageTemplate[];
export const PREMIUM_TEMPLATES = ["GALLERY", "MENU", "FLOATING", "EMBER", "BLOOM", "BREW"] as const satisfies readonly PackageTemplate[];

/** Every template (also ones added later), or the chosen ones. Meaningful when the package includes Menu designs. */
export interface PackageTemplates {
  all: boolean;
  /** Every standard design (also future ones) and no premium one unless it is chosen (DEC-052). */
  allStandard: boolean;
  selected: PackageTemplate[];
}

export interface PackagePrices {
  egpMonthly: string | null;
  egpYearly: string | null;
  usdMonthly: string | null;
  usdYearly: string | null;
}

/** A percentage off the list price while it is on; `endsAt` is the last day (YYYY-MM-DD) or null. */
export interface PackageOffer {
  percent: string;
  label: string | null;
  endsAt: string | null;
  active: boolean;
}

export interface PackageSummary {
  id: string;
  /** Arabic aliases kept by the API for backward compatibility. */
  name: string;
  description: string | null;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  status: PackageStatus;
  /** List prices per billing currency and period, as strings; null = not offered (DEC-049). */
  prices: PackagePrices;
  offer: PackageOffer | null;
  templates: PackageTemplates;
  features: FeatureKey[];
  restaurantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PackageDetail extends PackageSummary {
  restaurants: { id: string; name: string; status: RestaurantStatus }[];
}

/** What the package form sends (the Backend normalizes the prices). */
export interface PackageInput {
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  prices: PackagePrices;
  /** null removes the offer. */
  offer: { percent: string; label: string | null; endsAt: string | null } | null;
  templates: PackageTemplates;
  features: FeatureKey[];
  status?: PackageStatus;
}

export type AcquisitionSourceType =
  | "CUSTOMER_REFERRAL"
  | "EMPLOYEE_REFERRAL"
  | "SALES"
  | "SOCIAL_MEDIA"
  | "PAID_AD"
  | "WEBSITE"
  | "DIRECT"
  | "OTHER"
  | "UNKNOWN";

export interface RestaurantAcquisitionInput {
  sourceType: AcquisitionSourceType;
  referringRestaurantId?: string | null;
  sourceName?: string | null;
  sourcePlatform?: string | null;
  sourceDetail?: string | null;
  campaign?: string | null;
}

export interface RestaurantAcquisitionView extends RestaurantAcquisitionInput {
  referringRestaurantName: string | null;
  recordedAt: string;
}

export interface RestaurantDetail extends RestaurantSummary {
  acquisition: RestaurantAcquisitionView | null;
  settings: {
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    tableOrderingEnabled: boolean;
    whatsappOrderingEnabled: boolean;
    menuTemplate: string;
    suggestionsMode: string;
  };
  owners: { email: string; status: string }[];
  features: FeatureState[];
  totals: { orders: number; activeBranches: number; tables: number };
}

const data = async <T>(promise: Promise<{ data: T }>): Promise<T> => (await promise).data;

export const login = (email: string, password: string) =>
  data(platformFetch<{ data: Admin }>("/auth/login", { method: "POST", body: { email, password } }));
export const getMe = () => data(platformFetch<{ data: Admin }>("/auth/me"));
export const logout = () => platformFetch<void>("/auth/logout", { method: "POST" });
export const getOverview = () => data(platformFetch<{ data: Overview }>("/overview"));
export const getPublicSettings = () =>
  data(platformFetch<{ data: PlatformPublicSettings }>("/settings/public"));
export const updatePublicSettings = (poweredByUrl: string) =>
  data(
    platformFetch<{ data: PlatformPublicSettings }>("/settings/public", {
      method: "PUT",
      body: { poweredByUrl },
    }),
  );
export const getTrialSettings = () =>
  data(platformFetch<{ data: PlatformTrialSettings }>("/settings/trial"));
export const updateTrialSettings = (input: {
  enabled: boolean;
  defaultDays: number;
  defaultPackageId: string | null;
}) =>
  data(
    platformFetch<{ data: PlatformTrialSettings }>("/settings/trial", {
      method: "PUT",
      body: input,
    }),
  );

/** AI menu import settings and the Gemini keys (DEC-059). A key value is never returned: only its label and last four characters. */
export type AiEngine = "N8N" | "DIRECT";
export type AiKeyStatus = "ACTIVE" | "DISABLED";
export type AiKeyTestResult = "OK" | "LIMITED" | "REJECTED" | "UNAVAILABLE" | "REQUEST_REFUSED";
export const AI_MAX_KEYS = 20;

export interface PlatformAiSettings {
  engine: AiEngine;
  model: string;
  fallbackModel: string | null;
  /** False until `AI_KEYS_ENCRYPTION_KEY` is set on the server. */
  encryptionConfigured: boolean;
  activeKeyCount: number;
  updatedAt: string;
}
export interface PlatformAiKey {
  id: string;
  label: string;
  last4: string;
  status: AiKeyStatus;
  createdAt: string;
  updatedAt: string;
}
export interface PlatformAiOverview {
  settings: PlatformAiSettings;
  keys: PlatformAiKey[];
}
export interface PlatformAiKeyTest {
  result: AiKeyTestResult;
  model: string;
  httpStatus: number | null;
}

export const getAiSettings = () => data(platformFetch<{ data: PlatformAiOverview }>("/settings/ai"));
export const updateAiSettings = (input: { engine?: AiEngine; model?: string; fallbackModel?: string | null }) =>
  data(platformFetch<{ data: PlatformAiSettings }>("/settings/ai", { method: "PUT", body: input }));
export const addAiKey = (input: { label: string; secret: string }) =>
  data(platformFetch<{ data: PlatformAiKey }>("/settings/ai/keys", { method: "POST", body: input }));
export const updateAiKey = (id: string, input: { label?: string; status?: AiKeyStatus }) =>
  data(
    platformFetch<{ data: PlatformAiKey }>(`/settings/ai/keys/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),
  );
export const deleteAiKey = (id: string) =>
  platformFetch<void>(`/settings/ai/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
export const testAiKey = (id: string) =>
  data(
    platformFetch<{ data: PlatformAiKeyTest }>(`/settings/ai/keys/${encodeURIComponent(id)}/test`, {
      method: "POST",
    }),
  );

export const adjustActiveTrials = (days: number) =>
  data(
    platformFetch<{ data: { adjusted: number; skipped: number } }>("/settings/trial/adjust-active", {
      method: "POST",
      body: { days },
    }),
  );

export function listRestaurants(input: { search: string; status: RestaurantStatus | ""; subscription?: "TRIAL" | "PAID" | "NONE" | ""; page: number }) {
  const params = new URLSearchParams({ page: String(input.page), pageSize: "20" });
  if (input.search.trim()) params.set("search", input.search.trim());
  if (input.status) params.set("status", input.status);
  if (input.subscription) params.set("subscription", input.subscription);
  return data(platformFetch<{ data: RestaurantPage }>(`/restaurants?${params.toString()}`));
}
export const getRestaurant = (id: string) =>
  data(platformFetch<{ data: RestaurantDetail }>(`/restaurants/${encodeURIComponent(id)}`));
export const setRestaurantStatus = (id: string, status: "ACTIVE" | "SUSPENDED") =>
  data(
    platformFetch<{ data: { status: RestaurantStatus } }>(`/restaurants/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
    }),
  );
/** `true` = allow, `false` = remove, `null` = back to the package (or the default without one). */
export const setRestaurantFeature = (id: string, feature: FeatureKey, enabled: boolean | null) =>
  data(
    platformFetch<{ data: FeatureState }>(
      `/restaurants/${encodeURIComponent(id)}/features/${feature}`,
      { method: "PUT", body: { enabled } },
    ),
  );

export interface NewRestaurantInput {
  restaurantName: string;
  ownerEmail: string;
  ownerPassword: string;
  branchName: string;
  defaultLocale: "ar" | "en";
  currencyCode: string;
  timezone: string;
  countryCode?: string;
  packageId: string | null;
  acquisition?: RestaurantAcquisitionInput | null;
}
export const createRestaurant = (input: NewRestaurantInput) =>
  data(
    platformFetch<{ data: { id: string; publicId: string; name: string; ownerEmail: string } }>("/restaurants", {
      method: "POST",
      body: input,
    }),
  );

export interface AdminSummary {
  id: string;
  email: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
}
export const listAdmins = () => data(platformFetch<{ data: AdminSummary[] }>("/admins"));
export const createAdmin = (input: { email: string; displayName: string; password: string }) =>
  data(platformFetch<{ data: AdminSummary }>("/admins", { method: "POST", body: input }));
export const setAdminStatus = (id: string, status: "ACTIVE" | "DISABLED") =>
  data(
    platformFetch<{ data: AdminSummary }>(`/admins/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: { status },
    }),
  );
export const resetAdminPassword = (id: string, password: string) =>
  platformFetch<void>(`/admins/${encodeURIComponent(id)}/password`, { method: "PUT", body: { password } });
export const changeOwnPassword = (currentPassword: string, newPassword: string) =>
  platformFetch<void>("/auth/password", { method: "PUT", body: { currentPassword, newPassword } });

export const listPackages = () => data(platformFetch<{ data: PackageSummary[] }>("/packages"));
export const getPackage = (id: string) =>
  data(platformFetch<{ data: PackageDetail }>(`/packages/${encodeURIComponent(id)}`));
export const createPackage = (input: PackageInput) =>
  data(platformFetch<{ data: PackageSummary }>("/packages", { method: "POST", body: input }));
export const updatePackage = (id: string, input: Partial<PackageInput>) =>
  data(
    platformFetch<{ data: PackageSummary }>(`/packages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),
  );
export const deletePackage = (id: string) =>
  platformFetch<void>(`/packages/${encodeURIComponent(id)}`, { method: "DELETE" });
/** `null` takes the restaurant off any package (every feature). */
export const assignRestaurantPackage = (restaurantId: string, packageId: string | null) =>
  data(
    platformFetch<{ data: { packageId: string | null } }>(
      `/restaurants/${encodeURIComponent(restaurantId)}/package`,
      { method: "PUT", body: { packageId } },
    ),
  );

export const getAudit = (restaurantId?: string) =>
  data(
    platformFetch<{ data: AuditEntry[] }>(
      `/audit?limit=100${restaurantId ? `&restaurantId=${encodeURIComponent(restaurantId)}` : ""}`,
    ),
  );
