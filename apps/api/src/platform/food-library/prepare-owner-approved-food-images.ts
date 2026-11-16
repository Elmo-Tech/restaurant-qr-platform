/**
 * Converts the owner's specific 69-photo, source-deduplicated local pack
 * into the staging importer's owner-attested manifest format.
 *
 * This does NOT validate or alter a third-party photo license. Source license
 * kinds and missing independent QA scores must remain truthful in the audit.
 */
import {
  assertLocalManifestApproved,
  parseLocalFoodImageManifest,
  type LocalFoodImageItem,
  type LocalFoodImageManifest,
} from './local-food-image-import';

export const OWNER_DECISION_REF =
  'wayta-owner-2026-11-16-69-image-acceptance';

export const PILOT_10_FILES = [
  '01_BURGERS/BURGER_001.webp',
  '01_BURGERS/CHEESEBURGER_001.webp',
  '02_PASTA/PASTA_001.webp',
  '03_PIZZA/PEPPERONI_PIZZA_001.webp',
  '03_PIZZA/MARGHERITA_PIZZA_001.webp',
  '10_ORIENTAL_SWEETS/KUNAFA_001.webp',
  '11_GATEAU_CAKES/CHEESECAKE_001.webp',
  '11_GATEAU_CAKES/CHOCOLATE_CAKE_001.webp',
  '12_GRILLS/STEAK_001.webp',
  '13_DRINKS/CAPPUCCINO_001.webp',
] as const;

type Selection = 'all' | 'pilot';

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw);
}

function required(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing ' + key + ' in deduplicated source row');
  }
  return value.trim();
}

function toLocalItem(raw: unknown, index: number): LocalFoodImageItem {
  if (!isRecord(raw)) throw new Error('Invalid source photo row ' + index);
  const file = required(raw, 'file');
  const provider = required(raw, 'sourceProvider');
  const originalSha = required(raw, 'originalSha256');
  const preparedSha = required(raw, 'preparedWebpSha256');
  const page = required(raw, 'sourcePageUrl');
  const tagCodes = raw.tagCodes;
  if (
    !Array.isArray(tagCodes) ||
    !tagCodes.length ||
    tagCodes.some((code: unknown) => typeof code !== 'string')
  ) {
    throw new Error('Missing canonical tag codes for ' + file);
  }

  let licenseKind: 'PEXELS_UNCLEARED' | 'CC0_CLAIMED';
  if (provider === 'Pexels') {
    if (!new URL(page).hostname.endsWith('pexels.com')) {
      throw new Error('Provider and source page disagree for ' + file);
    }
    licenseKind = 'PEXELS_UNCLEARED';
  } else if (provider === 'ShotStash') {
    if (new URL(page).hostname !== 'shotstash.com') {
      throw new Error('Provider and source page disagree for ' + file);
    }
    licenseKind = 'CC0_CLAIMED';
  } else {
    throw new Error('Unexpected source provider for owner-approved pack: ' + provider);
  }

  return {
    id: 'owner69-' + String(index + 1).padStart(3, '0') + '-' + originalSha.slice(0, 8),
    name: String(tagCodes[0]).replace(/_/g, ' '),
    file,
    sourcePageUrl: page,
    sourceOriginalSha256: originalSha,
    optimizedSha256: preparedSha,
    licenseKind,
    rightsEvidenceRef: null,
    rightsReviewedBy: null,
    rightsReviewedAt: null,
    sharedLibraryAuthorized: false,
    visualReviewedBy: null,
    visualReviewedAt: null,
    qualityScores: null,
    ownerAttestation: {
      decisionRef: OWNER_DECISION_REF,
      acceptedAt: '2026-11-16',
      approvedBy: 'WAYTA_OWNER',
      scope: 'WAYTA_SHARED_FOOD_LIBRARY',
      acceptsQualityWithoutScores: true,
      acceptsUsageRightsResponsibility: true,
    },
    squareCropApproved: false,
    portraitCropApproved: false,
    approved: true,
    tagCodes: tagCodes as string[],
    sectors: raw.sectors as LocalFoodImageItem['sectors'],
    presentation: raw.presentation as LocalFoodImageItem['presentation'],
  };
}

/** Owner acceptance only covers the original set of 69 distinct source photos. */
export function prepareOwnerAcceptedFoodImageManifest(
  source: unknown,
  selection: Selection,
): LocalFoodImageManifest {
  if (
    !isRecord(source) ||
    source.kind !== 'WAYTA_DEDUPED_69_PHOTOS_REVIEW_ONLY_NOT_IMPORT_MANIFEST' ||
    source.originalFileCount !== 76 ||
    source.distinctOriginalCount !== 69 ||
    !Array.isArray(source.removedDuplicates) ||
    source.removedDuplicates.length !== 7 ||
    !Array.isArray(source.photos) ||
    source.photos.length !== 69
  ) {
    throw new Error('Source is not the owner-accepted 69-photo deduplicated pack');
  }
  const images = source.photos.map((row: unknown, index: number) =>
    toLocalItem(row, index),
  );

  // Always verify all 69 source records before selecting the 10-photo pilot.
  const full = parseLocalFoodImageManifest({ version: 1, images });
  assertLocalManifestApproved(full);
  const pexels = full.images.filter(
    (item) => item.licenseKind === 'PEXELS_UNCLEARED',
  ).length;
  const shotstash = full.images.filter(
    (item) => item.licenseKind === 'CC0_CLAIMED',
  ).length;
  if (pexels !== 23 || shotstash !== 46) {
    throw new Error('Source provider counts differ from owner-accepted pack');
  }

  if (selection === 'all') return full;
  if (selection !== 'pilot') throw new Error('Invalid photo selection');
  const byFile = new Map(full.images.map((item) => [item.file, item]));
  const pilot = PILOT_10_FILES.map((file) => {
    const image = byFile.get(file);
    if (!image) throw new Error('Missing pilot photo: ' + file);
    return image;
  });
  const manifest = parseLocalFoodImageManifest({ version: 1, images: pilot });
  assertLocalManifestApproved(manifest);
  return manifest;
}
