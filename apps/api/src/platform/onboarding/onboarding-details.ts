/**
 * Owner onboarding wizard (PROPOSED, docs/01-domain/ONBOARDING_WORKFLOW_SPEC.md): the shape of a case's
 * `details` and `modeConfig`, the strict allow-list sanitizer every write goes through, and the per-step
 * validation. Pure functions, no I/O.
 *
 * Two layers, on purpose:
 * - the SANITIZER refuses anything that is not an allowed key with an allowed type and a hard length cap
 *   (so a `password`, or any unknown key at any depth, is never stored: the whole write is refused);
 * - the STEP VALIDATION accepts incomplete or wrong values in a saved draft and reports them as stable
 *   problem codes, reusing the provisioning / owner-contact / acquisition / contact validators so the
 *   wizard checks exactly what provisioning will check later.
 */
import {
  DEMO_MAX_HOURS,
  DEMO_MIN_HOURS,
  isDemoKind,
} from '../../demo/demo-constants';
import {
  PROVISION_LIMITS,
  isValidCurrencyCode,
  isValidOwnerEmail,
  isValidTimezone,
} from '../../provisioning/provision-restaurant';
import {
  ContactValidationError,
  normalizePhone,
  normalizeUrl,
  type ContactField,
} from '../../restaurants/restaurant-contact';
import { normalizePlatformLocale } from '../../restaurants/platform-locales';
import { validateAcquisitionInput } from '../restaurant-acquisition';
import { validateOwnerContact } from '../restaurant-owner-contact';

export const ONBOARDING_STEPS = [
  'customer',
  'mode',
  'menu',
  'review',
  'handoff',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const BUSINESS_TYPES = [
  'RESTAURANT',
  'CAFE',
  'SWEETS',
  'OTHER',
] as const;
export const ONBOARDING_MODES = ['REAL', 'TRIAL', 'DEMO'] as const;
export type OnboardingModeKey = (typeof ONBOARDING_MODES)[number];

/** Trial length bounds: the same as `PlatformBillingService.createTrial`. */
export const TRIAL_MIN_DAYS = 1;
export const TRIAL_MAX_DAYS = 365;

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

/**
 * The existing `RestaurantAcquisition` fields, plus `adReference`, which exists only on the case (the
 * acquisition model has no column for it). Campaign name = `campaign`; salesperson = `sourceName` (SALES).
 */
export interface AcquisitionDraft {
  sourceType: string | null;
  referringRestaurantId: string | null;
  sourceName: string | null;
  sourcePlatform: string | null;
  sourceDetail: string | null;
  campaign: string | null;
  adReference: string | null;
}

export interface OnboardingDetails {
  restaurant: RestaurantDraft;
  owner: OwnerDraft;
  acquisition: AcquisitionDraft | null;
}

export interface ModeConfig {
  packageId: string | null;
  trialDays: number | null;
  demoKind: string | null;
  demoHours: number | null;
}

type TextFieldSpec = Record<string, number>;

/** Allowed text keys of each section with their HARD storage cap (validation rules are tighter). */
const RESTAURANT_TEXT: TextFieldSpec = {
  name: 200,
  businessType: 20,
  branchName: 200,
  countryCode: 8,
  currencyCode: 8,
  timezone: 64,
  defaultLocale: 10,
  phone: 40,
  whatsapp: 40,
  address: 500,
  facebookUrl: 400,
  instagramUrl: 400,
  websiteUrl: 400,
};
const OWNER_TEXT: TextFieldSpec = {
  fullName: 200,
  phone: 40,
  email: 320,
  facebookUrl: 400,
  additionalContact: 500,
};
const ACQUISITION_TEXT: TextFieldSpec = {
  sourceType: 40,
  referringRestaurantId: 40,
  sourceName: 300,
  sourcePlatform: 40,
  sourceDetail: 400,
  campaign: 200,
  adReference: 200,
};
const MAX_ADDITIONAL_LOCALES = 10;

export const emptyRestaurant = (): RestaurantDraft => ({
  name: null,
  businessType: null,
  branchName: null,
  countryCode: null,
  currencyCode: null,
  timezone: null,
  defaultLocale: null,
  additionalLocales: [],
  phone: null,
  whatsapp: null,
  address: null,
  facebookUrl: null,
  instagramUrl: null,
  websiteUrl: null,
});

export const emptyOwner = (): OwnerDraft => ({
  fullName: null,
  phone: null,
  email: null,
  facebookUrl: null,
  additionalContact: null,
});

const emptyAcquisition = (): AcquisitionDraft => ({
  sourceType: null,
  referringRestaurantId: null,
  sourceName: null,
  sourcePlatform: null,
  sourceDetail: null,
  campaign: null,
  adReference: null,
});

export const emptyDetails = (): OnboardingDetails => ({
  restaurant: emptyRestaurant(),
  owner: emptyOwner(),
  acquisition: null,
});

export const emptyModeConfig = (): ModeConfig => ({
  packageId: null,
  trialDays: null,
  demoKind: null,
  demoHours: null,
});

export type Sanitized<T> =
  { ok: true; value: T } | { ok: false; problems: string[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(
    Object.getPrototypeOf(value) as object | null,
  );

/** A blank string is stored as null; anything else is trimmed. */
function cleanText(
  value: unknown,
  path: string,
  cap: number,
  problems: string[],
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    problems.push(`${path}: must be a string or null`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > cap) {
    problems.push(`${path}: too long`);
    return null;
  }
  return trimmed === '' ? null : trimmed;
}

/** Applies an object of allowed text keys over `base`; an unknown key refuses the whole write. */
function patchSection<T extends object>(
  raw: unknown,
  path: string,
  spec: TextFieldSpec,
  base: T,
  extra: Record<string, (value: unknown, problems: string[]) => unknown> = {},
  problems: string[],
): T {
  if (!isPlainObject(raw)) {
    problems.push(`${path}: must be an object`);
    return base;
  }
  const next = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    if (Object.hasOwn(spec, key)) {
      next[key] = cleanText(value, `${path}.${key}`, spec[key], problems);
    } else if (Object.hasOwn(extra, key)) {
      next[key] = extra[key](value, problems);
    } else {
      problems.push(`${path}.${key}: unknown field`);
    }
  }
  return next as T;
}

function cleanLocales(value: unknown, problems: string[]): string[] {
  if (value === null || value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > MAX_ADDITIONAL_LOCALES ||
    value.some((entry) => typeof entry !== 'string' || entry.length > 10)
  ) {
    problems.push(
      'details.restaurant.additionalLocales: must be a short list of locale codes',
    );
    return [];
  }
  return (value as string[]).map((entry) => entry.trim().toLowerCase());
}

/**
 * Sanitizes a PATCH of `details` over the stored value. `restaurant` and `owner` are merged field by field;
 * `acquisition` is replaced as a whole (its fields depend on the source type), `null` clears it.
 */
export function sanitizeDetailsPatch(
  raw: unknown,
  current: OnboardingDetails,
): Sanitized<OnboardingDetails> {
  const problems: string[] = [];
  if (!isPlainObject(raw)) {
    return { ok: false, problems: ['details: must be an object'] };
  }
  const next: OnboardingDetails = {
    restaurant: current.restaurant,
    owner: current.owner,
    acquisition: current.acquisition,
  };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'restaurant') {
      next.restaurant = patchSection(
        value,
        'details.restaurant',
        RESTAURANT_TEXT,
        current.restaurant,
        { additionalLocales: cleanLocales },
        problems,
      );
    } else if (key === 'owner') {
      next.owner = patchSection(
        value,
        'details.owner',
        OWNER_TEXT,
        current.owner,
        {},
        problems,
      );
    } else if (key === 'acquisition') {
      next.acquisition =
        value === null
          ? null
          : patchSection(
              value,
              'details.acquisition',
              ACQUISITION_TEXT,
              emptyAcquisition(),
              {},
              problems,
            );
    } else {
      problems.push(`details.${key}: unknown field`);
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: next };
}

function cleanInteger(
  value: unknown,
  path: string,
  problems: string[],
): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    Math.abs(value) > 100_000
  ) {
    problems.push(`${path}: must be a whole number or null`);
    return null;
  }
  return value;
}

/** Sanitizes a PATCH of `modeConfig`, merged key by key over the stored value. */
export function sanitizeModeConfigPatch(
  raw: unknown,
  current: ModeConfig,
): Sanitized<ModeConfig> {
  if (!isPlainObject(raw)) {
    return { ok: false, problems: ['modeConfig: must be an object'] };
  }
  const problems: string[] = [];
  const next: ModeConfig = { ...current };
  for (const [key, value] of Object.entries(raw)) {
    switch (key) {
      case 'packageId':
        next.packageId = cleanText(value, 'modeConfig.packageId', 40, problems);
        break;
      case 'demoKind':
        next.demoKind = cleanText(value, 'modeConfig.demoKind', 20, problems);
        break;
      case 'trialDays':
        next.trialDays = cleanInteger(value, 'modeConfig.trialDays', problems);
        break;
      case 'demoHours':
        next.demoHours = cleanInteger(value, 'modeConfig.demoHours', problems);
        break;
      default:
        problems.push(`modeConfig.${key}: unknown field`);
    }
  }
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: next };
}

/** True when a (sanitized) `modeConfig` PATCH explicitly carries `packageId`, including an explicit `null`. */
export const suppliesPackageId = (raw: unknown): boolean =>
  isPlainObject(raw) && Object.hasOwn(raw, 'packageId');

/**
 * The mode config a PATCH stores, after the patch was merged over the stored value.
 *
 * Product Owner decision 2026-11-22 (explicit package confirmation):
 * - the global trial default package is a RECOMMENDATION only. It is never copied into `packageId`: a package
 *   counts as selected only when the operator sends it;
 * - on any mode change the package selection is cleared unless the same PATCH supplies `packageId`, so a package
 *   chosen for one mode is never silently carried into another;
 * - choosing TRIAL still prefills a missing trial length from the global trial settings (DEC-056).
 * `trialDays`, `demoKind` and `demoHours` are kept across mode changes: each is read only by its own mode.
 */
export function modeConfigForPatch(input: {
  previousMode: OnboardingModeKey | null;
  nextMode: OnboardingModeKey | null;
  /** The stored config with the patch already merged in. */
  config: ModeConfig;
  /** The PATCH itself carried `modeConfig.packageId`. */
  packageSupplied: boolean;
  /** The global trial default length; only read when the mode switches to TRIAL. */
  trialDefaultDays: number | null;
}): ModeConfig {
  const next: ModeConfig = { ...input.config };
  const modeChanged = input.nextMode !== input.previousMode;
  if (modeChanged && !input.packageSupplied) next.packageId = null;
  if (
    modeChanged &&
    input.nextMode === 'TRIAL' &&
    next.trialDays === null &&
    input.trialDefaultDays !== null
  ) {
    next.trialDays = input.trialDefaultDays;
  }
  return next;
}

/** Reads a stored `details` value, keeping only the known keys (stored data was sanitized on write). */
export function readDetails(stored: unknown): OnboardingDetails {
  const source = isPlainObject(stored) ? stored : {};
  const pick = <T extends object>(raw: unknown, base: T): T => {
    if (!isPlainObject(raw)) return base;
    const out = { ...base } as Record<string, unknown>;
    for (const key of Object.keys(base)) {
      const value = raw[key];
      if (key === 'additionalLocales') {
        out[key] = Array.isArray(value)
          ? value.filter((entry): entry is string => typeof entry === 'string')
          : [];
      } else {
        out[key] = typeof value === 'string' ? value : null;
      }
    }
    return out as T;
  };
  return {
    restaurant: pick(source.restaurant, emptyRestaurant()),
    owner: pick(source.owner, emptyOwner()),
    acquisition: isPlainObject(source.acquisition)
      ? pick(source.acquisition, emptyAcquisition())
      : null,
  };
}

export function readModeConfig(stored: unknown): ModeConfig {
  const source = isPlainObject(stored) ? stored : {};
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const int = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) ? value : null;
  return {
    packageId: text(source.packageId),
    trialDays: int(source.trialDays),
    demoKind: text(source.demoKind),
    demoHours: int(source.demoHours),
  };
}

// ---------------------------------------------------------------- step validation

/** Stable problem codes; the console maps each to a localized message (`onboarding.problem.<CODE>`). */
export type CustomerProblem =
  | 'RESTAURANT_NAME_INVALID'
  | 'BUSINESS_TYPE_REQUIRED'
  | 'BRANCH_NAME_INVALID'
  | 'COUNTRY_INVALID'
  | 'CURRENCY_INVALID'
  | 'TIMEZONE_INVALID'
  | 'DEFAULT_LOCALE_INVALID'
  | 'ADDITIONAL_LOCALES_INVALID'
  | 'RESTAURANT_PHONE_INVALID'
  | 'RESTAURANT_WHATSAPP_INVALID'
  | 'ADDRESS_TOO_LONG'
  | 'RESTAURANT_FACEBOOK_URL_INVALID'
  | 'RESTAURANT_INSTAGRAM_URL_INVALID'
  | 'RESTAURANT_WEBSITE_URL_INVALID'
  | 'OWNER_NAME_INVALID'
  | 'OWNER_PHONE_INVALID'
  | 'OWNER_EMAIL_INVALID'
  | 'OWNER_FACEBOOK_URL_INVALID'
  | 'OWNER_ADDITIONAL_CONTACT_TOO_LONG'
  | 'ACQUISITION_REQUIRED'
  | 'ACQUISITION_INVALID'
  | 'AD_REFERENCE_TOO_LONG';

export type ModeProblem =
  | 'MODE_REQUIRED'
  | 'PACKAGE_REQUIRED'
  | 'PACKAGE_NOT_AVAILABLE'
  | 'TRIAL_DISABLED'
  | 'TRIAL_DAYS_INVALID'
  | 'DEMO_KIND_INVALID'
  | 'DEMO_HOURS_INVALID';

const MAX_ADDRESS = 300;
const MAX_ADDITIONAL_CONTACT = 300;
const MAX_AD_REFERENCE = 160;

function contactProblem(
  field: ContactField,
  value: string | null,
  kind: 'phone' | 'url',
): boolean {
  if (value === null) return false;
  try {
    const normalized =
      kind === 'phone'
        ? normalizePhone(field, value)
        : normalizeUrl(field, value);
    return normalized === null;
  } catch (error) {
    if (error instanceof ContactValidationError) return true;
    throw error;
  }
}

/** Step 1 — customer and restaurant. An empty array means the step is complete. */
export function validateCustomerStep(
  details: OnboardingDetails,
): CustomerProblem[] {
  const problems: CustomerProblem[] = [];
  const { restaurant, owner, acquisition } = details;

  const name = restaurant.name ?? '';
  if (
    name.length < PROVISION_LIMITS.restaurantNameMin ||
    name.length > PROVISION_LIMITS.restaurantNameMax
  ) {
    problems.push('RESTAURANT_NAME_INVALID');
  }
  if (
    !restaurant.businessType ||
    !(BUSINESS_TYPES as readonly string[]).includes(restaurant.businessType)
  ) {
    problems.push('BUSINESS_TYPE_REQUIRED');
  }
  const branch = restaurant.branchName ?? '';
  if (
    branch.length < PROVISION_LIMITS.branchNameMin ||
    branch.length > PROVISION_LIMITS.branchNameMax
  ) {
    problems.push('BRANCH_NAME_INVALID');
  }
  if (!/^[A-Z]{2}$/.test((restaurant.countryCode ?? '').toUpperCase())) {
    problems.push('COUNTRY_INVALID');
  }
  if (!isValidCurrencyCode((restaurant.currencyCode ?? '').toUpperCase())) {
    problems.push('CURRENCY_INVALID');
  }
  if (!restaurant.timezone || !isValidTimezone(restaurant.timezone)) {
    problems.push('TIMEZONE_INVALID');
  }
  const defaultLocale = normalizePlatformLocale(restaurant.defaultLocale);
  if (defaultLocale === null) problems.push('DEFAULT_LOCALE_INVALID');
  const extra = restaurant.additionalLocales;
  if (
    extra.some((locale) => normalizePlatformLocale(locale) === null) ||
    new Set(extra).size !== extra.length ||
    (defaultLocale !== null && extra.includes(defaultLocale))
  ) {
    problems.push('ADDITIONAL_LOCALES_INVALID');
  }
  if (contactProblem('phone', restaurant.phone, 'phone')) {
    problems.push('RESTAURANT_PHONE_INVALID');
  }
  if (contactProblem('whatsapp', restaurant.whatsapp, 'phone')) {
    problems.push('RESTAURANT_WHATSAPP_INVALID');
  }
  if ((restaurant.address ?? '').length > MAX_ADDRESS) {
    problems.push('ADDRESS_TOO_LONG');
  }
  if (contactProblem('facebookUrl', restaurant.facebookUrl, 'url')) {
    problems.push('RESTAURANT_FACEBOOK_URL_INVALID');
  }
  if (contactProblem('instagramUrl', restaurant.instagramUrl, 'url')) {
    problems.push('RESTAURANT_INSTAGRAM_URL_INVALID');
  }
  if (contactProblem('websiteUrl', restaurant.websiteUrl, 'url')) {
    problems.push('RESTAURANT_WEBSITE_URL_INVALID');
  }

  // The owner contact rules are exactly those of the New Restaurant form (validateOwnerContact).
  const contact = validateOwnerContact({
    fullName: owner.fullName ?? '',
    phone: owner.phone ?? '',
    facebookUrl: owner.facebookUrl,
  });
  if (!contact.ok) {
    const has = (prefix: string) =>
      contact.problems.some((text) => text.startsWith(prefix));
    if (has('ownerContact.fullName')) problems.push('OWNER_NAME_INVALID');
    if (has('ownerContact.phone')) problems.push('OWNER_PHONE_INVALID');
    if (has('ownerContact.facebookUrl'))
      problems.push('OWNER_FACEBOOK_URL_INVALID');
  }
  if (!isValidOwnerEmail((owner.email ?? '').toLowerCase())) {
    problems.push('OWNER_EMAIL_INVALID');
  }
  if ((owner.additionalContact ?? '').length > MAX_ADDITIONAL_CONTACT) {
    problems.push('OWNER_ADDITIONAL_CONTACT_TOO_LONG');
  }

  // The console requires an intentional source: UNKNOWN is only for historic rows and the CLI.
  if (
    !acquisition ||
    !acquisition.sourceType ||
    acquisition.sourceType === 'UNKNOWN'
  ) {
    problems.push('ACQUISITION_REQUIRED');
  } else {
    // adReference is kept only on the case; the rest is the persisted acquisition model.
    const { adReference, ...persisted } = acquisition;
    if (!validateAcquisitionInput(persisted).ok)
      problems.push('ACQUISITION_INVALID');
    if ((adReference ?? '').length > MAX_AD_REFERENCE) {
      problems.push('AD_REFERENCE_TOO_LONG');
    }
  }
  return problems;
}

export interface ModeContext {
  /** The chosen package as found in the database (null = not found / malformed id / none chosen). */
  pkg: { status: 'ACTIVE' | 'ARCHIVED' } | null;
  trialsEnabled: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | null): value is string =>
  value !== null && UUID.test(value);

/** Step 2 — onboarding mode. Stores a choice only; nothing is created in this build. */
export function validateModeStep(
  mode: OnboardingModeKey | null,
  config: ModeConfig,
  context: ModeContext,
): ModeProblem[] {
  if (mode === null) return ['MODE_REQUIRED'];
  const problems: ModeProblem[] = [];
  const packageAvailable =
    context.pkg !== null && context.pkg.status === 'ACTIVE';

  if (mode === 'REAL' || mode === 'TRIAL') {
    // A real onboarding and a trial both need an explicit ACTIVE package (no null-package shortcut). The trial
    // default package is only a recommendation and never fills `packageId` (PO decision 2026-11-22).
    if (config.packageId === null) problems.push('PACKAGE_REQUIRED');
    else if (!packageAvailable) problems.push('PACKAGE_NOT_AVAILABLE');
  }
  if (mode === 'TRIAL') {
    if (!context.trialsEnabled) problems.push('TRIAL_DISABLED');
    if (
      config.trialDays === null ||
      config.trialDays < TRIAL_MIN_DAYS ||
      config.trialDays > TRIAL_MAX_DAYS
    ) {
      problems.push('TRIAL_DAYS_INVALID');
    }
  }
  if (mode === 'DEMO') {
    if (!isDemoKind(config.demoKind)) problems.push('DEMO_KIND_INVALID');
    if (
      config.demoHours === null ||
      config.demoHours < DEMO_MIN_HOURS ||
      config.demoHours > DEMO_MAX_HOURS
    ) {
      problems.push('DEMO_HOURS_INVALID');
    }
    // The package is optional for a demo (none = every feature), but a chosen one must be ACTIVE.
    if (config.packageId !== null && !packageAvailable) {
      problems.push('PACKAGE_NOT_AVAILABLE');
    }
  }
  return problems;
}

/** Steps 3–5 belong to later milestones and are never complete in this build. */
export function computeCompletedSteps(problems: {
  customer: readonly string[];
  mode: readonly string[];
}): OnboardingStep[] {
  const done: OnboardingStep[] = [];
  if (problems.customer.length === 0) done.push('customer');
  if (problems.mode.length === 0) done.push('mode');
  return done;
}
