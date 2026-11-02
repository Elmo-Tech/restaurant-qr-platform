/**
 * Internal ElmoTech customer acquisition metadata. This module intentionally has
 * no import from Staff/Guest business code: attribution is Platform-only.
 */
export const ACQUISITION_SOURCE_TYPES = [
  'CUSTOMER_REFERRAL',
  'EMPLOYEE_REFERRAL',
  'SALES',
  'SOCIAL_MEDIA',
  'PAID_AD',
  'WEBSITE',
  'DIRECT',
  'OTHER',
  'UNKNOWN',
] as const;

export type AcquisitionSourceType = (typeof ACQUISITION_SOURCE_TYPES)[number];

export const SOCIAL_MEDIA_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'WHATSAPP',
  'LINKEDIN',
  'YOUTUBE',
  'X',
  'OTHER',
] as const;

export const PAID_AD_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'GOOGLE',
  'YOUTUBE',
  'OTHER',
] as const;

export interface RestaurantAcquisitionInput {
  sourceType: AcquisitionSourceType;
  /** A registered restaurant, or a free-text sourceName. Never both. */
  referringRestaurantId?: string | null;
  /** Referring customer / employee / salesperson name (depending on sourceType). */
  sourceName?: string | null;
  /** Normalized name such as FACEBOOK, INSTAGRAM or GOOGLE. */
  sourcePlatform?: string | null;
  /** Where exactly: search, site, walk-in, other platform, etc. */
  sourceDetail?: string | null;
  /** Optional campaign/advertisement label. */
  campaign?: string | null;
}

export interface NormalizedAcquisition {
  sourceType: AcquisitionSourceType;
  referringRestaurantId: string | null;
  sourceName: string | null;
  sourcePlatform: string | null;
  sourceDetail: string | null;
  campaign: string | null;
}

export type AcquisitionValidation =
  | { ok: true; value: NormalizedAcquisition | null }
  | { ok: false; problems: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(
  raw: unknown,
  key: string,
  max: number,
  problems: string[],
): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') {
    problems.push(key + ' must be a string');
    return null;
  }
  const cleaned = raw.trim();
  if (cleaned.length > max) problems.push(key + ' is too long');
  return cleaned || null;
}

/** Validate BEFORE provisioning; never create a Restaurant for invalid attribution. */
export function validateAcquisitionInput(raw: unknown): AcquisitionValidation {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, problems: ['acquisition must be an object'] };
  }

  const input = raw as Record<string, unknown>;
  if (
    typeof input.sourceType !== 'string' ||
    !ACQUISITION_SOURCE_TYPES.some((type) => type === input.sourceType)
  ) {
    return { ok: false, problems: ['acquisition source type is invalid'] };
  }
  const sourceType = input.sourceType as AcquisitionSourceType;
  const problems: string[] = [];
  const referringRestaurantId = text(input.referringRestaurantId, 'referringRestaurantId', 36, problems);
  const sourceName = text(input.sourceName, 'sourceName', 200, problems);
  const sourcePlatform = text(input.sourcePlatform, 'sourcePlatform', 40, problems)?.toUpperCase() ?? null;
  const sourceDetail = text(input.sourceDetail, 'sourceDetail', 300, problems);
  const campaign = text(input.campaign, 'campaign', 160, problems);

  if (referringRestaurantId && !UUID.test(referringRestaurantId)) {
    problems.push('referringRestaurantId must be a UUID');
  }
  if (sourceType === 'CUSTOMER_REFERRAL') {
    if (Boolean(referringRestaurantId) === Boolean(sourceName)) {
      problems.push('Choose an existing referring Restaurant OR enter its name');
    }
  } else if (referringRestaurantId) {
    problems.push('referringRestaurantId is valid only for customer referrals');
  }

  if ((sourceType === 'EMPLOYEE_REFERRAL' || sourceType === 'SALES') && !sourceName) {
    problems.push('Enter the employee or salesperson name');
  }
  if (
    !['CUSTOMER_REFERRAL', 'EMPLOYEE_REFERRAL', 'SALES'].includes(sourceType) &&
    sourceName
  ) {
    problems.push('sourceName is not applicable to this source type');
  }
  if (sourceType === 'SOCIAL_MEDIA' || sourceType === 'PAID_AD') {
    const options: readonly string[] =
      sourceType === 'SOCIAL_MEDIA' ? SOCIAL_MEDIA_PLATFORMS : PAID_AD_PLATFORMS;
    if (!sourcePlatform || !options.includes(sourcePlatform)) {
      problems.push('Select a valid social or advertising platform');
    }
    if (sourcePlatform === 'OTHER' && !sourceDetail) {
      problems.push('Describe the other platform');
    }
  } else if (sourcePlatform) {
    problems.push('sourcePlatform is not applicable to this source type');
  }
  if (['WEBSITE', 'DIRECT', 'OTHER'].includes(sourceType) && !sourceDetail) {
    problems.push('Describe the specific source');
  }
  if (sourceType === 'UNKNOWN' && (sourceName || sourceDetail || campaign)) {
    problems.push('UNKNOWN source cannot contain attribution details');
  }

  return problems.length
    ? { ok: false, problems }
    : {
        ok: true,
        value: {
          sourceType,
          referringRestaurantId,
          sourceName,
          sourcePlatform,
          sourceDetail,
          campaign,
        },
      };
}
