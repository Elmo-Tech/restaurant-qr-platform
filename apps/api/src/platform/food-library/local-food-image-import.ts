/**
 * Strict, offline-first validation for a curator-reviewed local WebP batch.
 * This is deliberately separate from the remote CC0-only importer.
 *
 * It does not grant photo rights or turn a license claim into a license.
 * No photo is eligible for APPLY until a human has verified its provenance,
 * commercial multi-restaurant rights and each of the six quality scores.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { FOOD_TAG_CATALOG } from './food-tag-catalog';
import type {
  ImportPresentation,
  ImportSector,
} from './food-image-import-helpers';

const SHA = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CODE = /^[A-Z][A-Z0-9_]*$/;
const WEBP_RELATIVE_PATH =
  /^[0-9]{2}_[A-Z0-9_]+\/[A-Z][A-Z0-9_]*_[0-9]{3}\.webp$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;
const MIN_SIDE = 600;
const FIELDS = [
  'lighting',
  'foodStyling',
  'composition',
  'background',
  'advertisingSuitability',
  'tagAccuracy',
] as const;
const TAGS = new Set(FOOD_TAG_CATALOG.map((tag) => tag.code));
const SECTORS = new Set([
  'RESTAURANT',
  'CAFE',
  'SWEETS',
  'BUTCHER',
  'HOME_FOOD',
]);
const PRESENTATIONS = new Set(['RAW', 'COOKED', 'READY_TO_SERVE']);
const LICENSES = new Set([
  'PEXELS_UNCLEARED',
  'CC0_CLAIMED',
  'CC0_VERIFIED',
  'CUSTOM_MULTI_TENANT_GRANT',
]);

export type LocalLicenseKind =
  | 'PEXELS_UNCLEARED'
  | 'CC0_CLAIMED'
  | 'CC0_VERIFIED'
  | 'CUSTOM_MULTI_TENANT_GRANT';

export type QualityScores = Record<(typeof FIELDS)[number], number>;

/**
 * Owner accepts use of the photos and quality as a business decision.
 * This does NOT establish independent copyright verification or scored QA.
 */
export interface OwnerPhotoAttestation {
  decisionRef: string;
  acceptedAt: string;
  approvedBy: 'WAYTA_OWNER';
  scope: 'WAYTA_SHARED_FOOD_LIBRARY';
  acceptsQualityWithoutScores: boolean;
  acceptsUsageRightsResponsibility: boolean;
}

export interface LocalFoodImageItem {
  id: string;
  name: string;
  file: string;
  sourcePageUrl: string;
  sourceOriginalSha256: string;
  optimizedSha256: string;
  licenseKind: LocalLicenseKind;
  rightsEvidenceRef: string | null;
  rightsReviewedBy: string | null;
  rightsReviewedAt: string | null;
  sharedLibraryAuthorized: boolean;
  visualReviewedBy: string | null;
  visualReviewedAt: string | null;
  qualityScores: QualityScores | null;
  ownerAttestation: OwnerPhotoAttestation | null;
  squareCropApproved: boolean;
  portraitCropApproved: boolean;
  approved: boolean;
  tagCodes: string[];
  sectors: ImportSector[];
  presentation: ImportPresentation;
}

export interface LocalFoodImageManifest {
  version: 1;
  images: LocalFoodImageItem[];
}

export interface InspectedLocalImage {
  item: LocalFoodImageItem;
  buffer: Buffer;
  width: number;
  height: number;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function str(row: Record<string, unknown>, name: string, max = 512): string {
  const value = row[name];
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('Invalid or missing ' + name);
  return value.trim();
}

function optionalString(
  row: Record<string, unknown>,
  name: string,
  max = 512,
): string | null {
  if (row[name] === null || row[name] === undefined) return null;
  return str(row, name, max);
}

function flag(row: Record<string, unknown>, name: string): boolean {
  if (typeof row[name] !== 'boolean')
    throw new Error('Expected a boolean for ' + name);
  return row[name];
}

function checkedDate(value: string | null, name: string): void {
  if (value === null) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid ' + name);
  const d = new Date(value + 'T00:00:00Z');
  if (
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    value > new Date().toISOString().slice(0, 10)
  )
    throw new Error('Invalid ' + name);
}

function uniqueStrings(
  raw: unknown,
  name: string,
  max: number,
  allowed: ReadonlySet<string> | null,
): string[] {
  if (
    !Array.isArray(raw) ||
    raw.length < 1 ||
    raw.length > max ||
    raw.some((value) => typeof value !== 'string' || !CODE.test(value)) ||
    new Set(raw).size !== raw.length ||
    (allowed !== null &&
      raw.some(
        (value: unknown) => typeof value !== 'string' || !allowed.has(value),
      ))
  )
    throw new Error('Invalid ' + name);
  return raw as string[];
}

function quality(raw: unknown): QualityScores | null {
  if (raw === null || raw === undefined) return null;
  if (!record(raw)) throw new Error('Invalid qualityScores');
  const result: Record<string, number> = {};
  for (const field of FIELDS) {
    const value = raw[field];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 10
    ) {
      throw new Error('Invalid quality score ' + field);
    }
    result[field] = value;
  }
  return result as QualityScores;
}

function parseOwnerAttestation(raw: unknown): OwnerPhotoAttestation | null {
  if (raw === null || raw === undefined) return null;
  if (!record(raw)) throw new Error('Invalid ownerAttestation');
  const decisionRef = str(raw, 'decisionRef', 180);
  const acceptedAt = str(raw, 'acceptedAt', 10);
  checkedDate(acceptedAt, 'ownerAttestation.acceptedAt');
  const approvedBy = str(raw, 'approvedBy', 40);
  const scope = str(raw, 'scope', 64);
  if (
    approvedBy !== 'WAYTA_OWNER' ||
    scope !== 'WAYTA_SHARED_FOOD_LIBRARY'
  ) throw new Error('Invalid ownerAttestation role or scope');
  return {
    decisionRef,
    acceptedAt,
    approvedBy: 'WAYTA_OWNER',
    scope: 'WAYTA_SHARED_FOOD_LIBRARY',
    acceptsQualityWithoutScores: flag(raw, 'acceptsQualityWithoutScores'),
    acceptsUsageRightsResponsibility: flag(raw, 'acceptsUsageRightsResponsibility'),
  };
}

function checkedSourcePage(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid sourcePageUrl');
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    !url.hostname ||
    url.hostname === 'localhost'
  )
    throw new Error('Invalid sourcePageUrl');
  // The importer NEVER downloads this URL. It is an audit reference only.
  return url.href;
}

/** Parse a candidate batch offline. Incomplete rights/QA are allowed for DRY RUN only. */
export function parseLocalFoodImageManifest(
  raw: unknown,
): LocalFoodImageManifest {
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.images) ||
    raw.images.length < 1 ||
    raw.images.length > 100
  ) {
    throw new Error('Manifest needs version 1 and 1 to 100 images.');
  }
  const ids = new Set<string>();
  const files = new Set<string>();
  const sources = new Set<string>();
  const originalHashes = new Set<string>();
  const optimizedHashes = new Set<string>();
  const images = raw.images.map((value: unknown, index: number) => {
    if (!record(value)) throw new Error('Invalid image at ' + index);
    const id = str(value, 'id', 80);
    if (!ID.test(id) || ids.has(id))
      throw new Error('Invalid or duplicate id: ' + id);
    ids.add(id);
    const name = str(value, 'name', 160);
    if (name.length < 2) throw new Error('Image name too short: ' + id);
    const file = str(value, 'file', 240);
    if (!WEBP_RELATIVE_PATH.test(file) || files.has(file))
      throw new Error('Invalid or duplicate relative WebP file: ' + file);
    files.add(file);
    const tagCodes = uniqueStrings(value.tagCodes, 'tagCodes', 30, TAGS);
    if (!file.split('/')[1].startsWith(tagCodes[0] + '_'))
      throw new Error('Filename and primary canonical Tag differ: ' + id);

    const sourcePageUrl = checkedSourcePage(str(value, 'sourcePageUrl', 1500));
    if (sources.has(sourcePageUrl))
      throw new Error('Repeated source page: ' + id);
    sources.add(sourcePageUrl);

    const sourceOriginalSha256 = str(
      value,
      'sourceOriginalSha256',
      64,
    ).toLowerCase();
    const optimizedSha256 = str(value, 'optimizedSha256', 64).toLowerCase();
    if (
      !SHA.test(sourceOriginalSha256) ||
      !SHA.test(optimizedSha256) ||
      originalHashes.has(sourceOriginalSha256) ||
      optimizedHashes.has(optimizedSha256)
    ) {
      throw new Error('Invalid or duplicate photo hashes: ' + id);
    }
    originalHashes.add(sourceOriginalSha256);
    optimizedHashes.add(optimizedSha256);

    const licenseKind = str(value, 'licenseKind', 40);
    if (!LICENSES.has(licenseKind))
      throw new Error('Unsupported source license: ' + id);

    const rightsReviewedAt = optionalString(value, 'rightsReviewedAt', 10);
    const visualReviewedAt = optionalString(value, 'visualReviewedAt', 10);
    checkedDate(rightsReviewedAt, 'rightsReviewedAt');
    checkedDate(visualReviewedAt, 'visualReviewedAt');

    const sectors = uniqueStrings(value.sectors, 'sectors', 5, SECTORS);
    const presentation = str(value, 'presentation', 25);
    if (!PRESENTATIONS.has(presentation))
      throw new Error('Invalid presentation: ' + id);

    return {
      id,
      name,
      file,
      sourcePageUrl,
      sourceOriginalSha256,
      optimizedSha256,
      licenseKind: licenseKind as LocalLicenseKind,
      rightsEvidenceRef: optionalString(value, 'rightsEvidenceRef'),
      rightsReviewedBy: optionalString(value, 'rightsReviewedBy', 160),
      rightsReviewedAt,
      sharedLibraryAuthorized: flag(value, 'sharedLibraryAuthorized'),
      visualReviewedBy: optionalString(value, 'visualReviewedBy', 160),
      visualReviewedAt,
      qualityScores: quality(value.qualityScores),
      ownerAttestation: parseOwnerAttestation(value.ownerAttestation),
      squareCropApproved: flag(value, 'squareCropApproved'),
      portraitCropApproved: flag(value, 'portraitCropApproved'),
      approved: flag(value, 'approved'),
      tagCodes,
      sectors: sectors as ImportSector[],
      presentation: presentation as ImportPresentation,
    } satisfies LocalFoodImageItem;
  });
  return { version: 1, images };
}

/**
 * Two distinct approval bases: independently reviewed evidence/scores, or an
 * explicit business owner acceptance. Neither invents a source license.
 */
export function assertLocalManifestApproved(
  manifest: LocalFoodImageManifest,
): void {
  for (const item of manifest.images) {
    if (item.ownerAttestation) {
      if (
        !item.approved ||
        !item.ownerAttestation.acceptsQualityWithoutScores ||
        !item.ownerAttestation.acceptsUsageRightsResponsibility
      ) {
        throw new Error('Incomplete owner acceptance: ' + item.id);
      }
      // Business owner acceptance is NOT proof of a third-party grant.
      // Keep PEXELS_UNCLEARED or CC0_CLAIMED truthful in the audit.
      continue;
    }
    const licensed =
      item.licenseKind === 'CC0_VERIFIED' ||
      item.licenseKind === 'CUSTOM_MULTI_TENANT_GRANT';
    if (
      !item.approved ||
      !licensed ||
      !item.sharedLibraryAuthorized ||
      !item.rightsEvidenceRef ||
      !item.rightsReviewedBy ||
      !item.rightsReviewedAt
    ) {
      throw new Error(
        'Photo needs explicit multi-restaurant rights approval: ' + item.id,
      );
    }
    if (
      !item.visualReviewedAt ||
      !item.visualReviewedBy ||
      !item.qualityScores ||
      !item.squareCropApproved ||
      !item.portraitCropApproved ||
      FIELDS.some((field) => item.qualityScores![field] < 9)
    ) {
      throw new Error('Photo fails premium 9/10 visual QA gate: ' + item.id);
    }
  }
}

/** Open a normalized local WebP without permitting traversal or symlink escape. */
export async function inspectLocalFoodImage(
  baseDirectory: string,
  item: LocalFoodImageItem,
): Promise<InspectedLocalImage> {
  const root = await realpath(baseDirectory);
  const filePath = path.resolve(root, ...item.file.split('/'));
  const actual = await realpath(filePath);
  const relative = path.relative(root, actual);
  if (
    relative === '' ||
    relative.startsWith('..' + path.sep) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Image must remain inside the approved root: ' + item.id);
  }
  const stat = await lstat(filePath);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > MAX_IMAGE_BYTES ||
    stat.size === 0
  ) {
    throw new Error('Image is not a regular WebP <=5 MiB: ' + item.id);
  }
  const buffer = await readFile(actual);
  if (buffer.length !== stat.size || buffer.length > MAX_IMAGE_BYTES)
    throw new Error('Image size changed: ' + item.id);
  const digest = createHash('sha256').update(buffer).digest('hex');
  if (digest !== item.optimizedSha256)
    throw new Error('Prepared SHA-256 mismatch: ' + item.id);
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  )
    throw new Error('Not a real WebP: ' + item.id);
  const metadata = await sharp(buffer, {
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();
  if (
    metadata.format !== 'webp' ||
    !metadata.width ||
    !metadata.height ||
    Math.min(metadata.width, metadata.height) < MIN_SIDE ||
    metadata.width * metadata.height > MAX_INPUT_PIXELS
  ) {
    throw new Error('Invalid image dimensions or format: ' + item.id);
  }
  return { item, buffer, width: metadata.width, height: metadata.height };
}
