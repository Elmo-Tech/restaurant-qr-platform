import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '../../storage/image-storage.service';

const IMAGE_HOSTS = new Set([
  'pd.w.org',
  'upload.wikimedia.org',
  'isorepublic.com',
]);
const SECTORS = new Set([
  'RESTAURANT',
  'CAFE',
  'SWEETS',
  'BUTCHER',
  'HOME_FOOD',
]);
const PRESENTATIONS = new Set(['RAW', 'COOKED', 'READY_TO_SERVE']);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24_000_000;

export type ImportSector =
  'RESTAURANT' | 'CAFE' | 'SWEETS' | 'BUTCHER' | 'HOME_FOOD';
export type ImportPresentation = 'RAW' | 'COOKED' | 'READY_TO_SERVE';

export interface FoodImageImportItem {
  id: string;
  name: string;
  sourceUrl: string;
  sourcePageUrl: string;
  licenseProofUrl: string;
  license: 'CC0';
  licenseReviewedAt: string | null;
  approved: boolean;
  expectedSha256: string | null;
  tagCodes: string[];
  sectors: ImportSector[];
  presentation: ImportPresentation;
}
export interface FoodImageImportManifest {
  version: 1;
  images: FoodImageImportItem[];
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(
  item: Record<string, unknown>,
  field: string,
  max: number,
): string {
  const raw = item[field];
  if (typeof raw !== 'string' || !raw.trim() || raw.length > max) {
    throw new Error('Invalid or missing ' + field);
  }
  return raw.trim();
}

function checkedHttpsUrl(value: string, hosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid HTTPS URL: ' + value);
  }
  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !hosts.has(url.hostname.toLowerCase()) ||
    url.hash !== ''
  ) {
    throw new Error('Source URL is not an approved HTTPS location: ' + value);
  }
  return url;
}

export function validateImageSourceUrl(value: string): URL {
  const url = checkedHttpsUrl(value, IMAGE_HOSTS);
  if (
    !/\.(jpe?g|png|webp)$/i.test(url.pathname) ||
    (url.hostname === 'upload.wikimedia.org' &&
      !url.pathname.startsWith('/wikipedia/commons/')) ||
    (url.hostname === 'isorepublic.com' &&
      (!/^\/wp-content\/uploads\/\d{4}\/\d{2}\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(
        url.pathname,
      ) ||
        url.search !== ''))
  ) {
    throw new Error('Source must be a direct supported photo file: ' + value);
  }
  return url;
}

function validateRights(item: FoodImageImportItem): void {
  const page = checkedHttpsUrl(
    item.sourcePageUrl,
    new Set(['wordpress.org', 'commons.wikimedia.org', 'isorepublic.com']),
  );
  const proof = checkedHttpsUrl(
    item.licenseProofUrl,
    new Set(['wordpress.org', 'creativecommons.org', 'isorepublic.com']),
  );
  if (page.hostname === 'wordpress.org') {
    if (
      !page.pathname.startsWith('/photos/photo/') ||
      !item.sourceUrl.startsWith('https://pd.w.org/') ||
      proof.href !== 'https://wordpress.org/photos/license/'
    )
      throw new Error(
        'WordPress photo and CC0 evidence do not match: ' + item.id,
      );
  } else if (page.hostname === 'isorepublic.com') {
    if (
      !/^\/photo\/[a-z0-9-]+\/$/.test(page.pathname) ||
      page.search !== '' ||
      !item.sourceUrl.startsWith(
        'https://isorepublic.com/wp-content/uploads/',
      ) ||
      proof.href !== 'https://isorepublic.com/license/'
    )
      throw new Error(
        'ISO Republic source and CC0 evidence do not match: ' + item.id,
      );
  } else {
    if (
      !page.pathname.startsWith('/wiki/File:') ||
      !item.sourceUrl.startsWith(
        'https://upload.wikimedia.org/wikipedia/commons/',
      ) ||
      proof.href !== 'https://creativecommons.org/publicdomain/zero/1.0/'
    )
      throw new Error(
        'Wikimedia photo and CC0 evidence do not match: ' + item.id,
      );
  }
  // Neither the manifest nor the remote index proves copyright ownership.
  // An operator must check the individual photo's original source and rights.
}

function validReviewedDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const d = new Date(value + 'T00:00:00Z');
  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

/** Parse an untrusted manifest without network or database access. */
export function parseFoodImageImportManifest(
  raw: unknown,
): FoodImageImportManifest {
  if (
    !record(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.images) ||
    raw.images.length < 1 ||
    raw.images.length > 100
  ) {
    throw new Error('Manifest must contain version 1 and 1 to 100 images.');
  }
  const ids = new Set<string>();
  const urls = new Set<string>();
  const images: FoodImageImportItem[] = raw.images.map(
    (value: unknown, index: number) => {
      if (!record(value)) throw new Error('Invalid image at index ' + index);
      const id = requiredString(value, 'id', 80);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id)) {
        throw new Error('Invalid or duplicate import id: ' + id);
      }
      ids.add(id);
      const name = requiredString(value, 'name', 160);
      if (name.length < 2) throw new Error('Image name too short: ' + id);
      const sourceUrl = requiredString(value, 'sourceUrl', 1500);
      validateImageSourceUrl(sourceUrl);
      if (urls.has(sourceUrl))
        throw new Error('Duplicate image source URL: ' + sourceUrl);
      urls.add(sourceUrl);
      if (value.license !== 'CC0')
        throw new Error('Only human-verified CC0 is accepted: ' + id);
      if (typeof value.approved !== 'boolean')
        throw new Error('Missing approval flag: ' + id);
      const expectedSha256 =
        value.expectedSha256 === null || value.expectedSha256 === undefined
          ? null
          : requiredString(value, 'expectedSha256', 64).toLowerCase();
      if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
        throw new Error('Invalid SHA-256 pin: ' + id);
      }
      const licenseReviewedAt =
        value.licenseReviewedAt === null ||
        value.licenseReviewedAt === undefined
          ? null
          : value.licenseReviewedAt;
      if (licenseReviewedAt !== null && !validReviewedDate(licenseReviewedAt)) {
        throw new Error('Invalid license verification date: ' + id);
      }
      if (
        !Array.isArray(value.tagCodes) ||
        value.tagCodes.length < 1 ||
        value.tagCodes.length > 30 ||
        value.tagCodes.some(
          (code: unknown) =>
            typeof code !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(code),
        ) ||
        new Set(value.tagCodes).size !== value.tagCodes.length
      ) {
        throw new Error('Invalid canonical tag codes: ' + id);
      }
      if (
        !Array.isArray(value.sectors) ||
        value.sectors.length < 1 ||
        value.sectors.length > 5 ||
        value.sectors.some(
          (sector: unknown) =>
            typeof sector !== 'string' || !SECTORS.has(sector),
        ) ||
        new Set(value.sectors).size !== value.sectors.length
      ) {
        throw new Error('Invalid suitable sectors: ' + id);
      }
      if (
        typeof value.presentation !== 'string' ||
        !PRESENTATIONS.has(value.presentation)
      ) {
        throw new Error('Invalid presentation state: ' + id);
      }
      const result: FoodImageImportItem = {
        id,
        name,
        sourceUrl,
        sourcePageUrl: requiredString(value, 'sourcePageUrl', 1500),
        licenseProofUrl: requiredString(value, 'licenseProofUrl', 1500),
        license: 'CC0',
        licenseReviewedAt,
        approved: value.approved,
        expectedSha256,
        tagCodes: value.tagCodes as string[],
        sectors: value.sectors as ImportSector[],
        presentation: value.presentation as ImportPresentation,
      };
      validateRights(result);
      return result;
    },
  );
  return { version: 1, images };
}

/** Apply mode is gated separately from syntax validation and photo preparation. */
export function assertApprovedForImport(
  manifest: FoodImageImportManifest,
): void {
  for (const item of manifest.images) {
    if (!item.approved || !item.licenseReviewedAt || !item.expectedSha256) {
      throw new Error(
        'Image needs photo/rights approval, date and a pinned source SHA-256: ' +
          item.id,
      );
    }
  }
}

function publicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 6) return /^[23][0-9a-f]{3}:/i.test(address);
  if (family !== 4) return false;
  const p = address.split('.').map(Number);
  const [a, b, c] = p;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function downloadApprovedPhoto(
  sourceUrl: string,
): Promise<Buffer> {
  const url = validateImageSourceUrl(sourceUrl);
  const resolved = await lookup(url.hostname, { family: 4, all: true });
  if (!resolved.length || resolved.some((entry) => !publicIp(entry.address))) {
    throw new Error('Source DNS is not publicly routable: ' + url.hostname);
  }
  const ip = resolved[0];
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        timeout: 20000,
        headers: {
          Accept: 'image/jpeg,image/png,image/webp',
          'User-Agent': 'WAYTA-licensed-image-import/1.0',
        },
        // Pin the checked address so a DNS change between lookup and connect cannot reach a private host.
        lookup: (_host, _options, callback) =>
          callback(null, ip.address, ip.family),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Image source HTTP status: ' + res.statusCode));
          return;
        }
        const declaredLength = Number(res.headers['content-length'] ?? '0');
        if (declaredLength > MAX_SOURCE_BYTES) {
          res.destroy();
          reject(new Error('Source image exceeds 20 MB.'));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_SOURCE_BYTES) {
            req.destroy(new Error('Source image exceeds 20 MB.'));
          } else chunks.push(chunk);
        });
        res.on('end', () => {
          if (total === 0) reject(new Error('Source image was empty.'));
          else resolve(Buffer.concat(chunks, total));
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () =>
      req.destroy(new Error('Photo download timed out.')),
    );
    req.on('error', reject);
    req.end();
  });
}

export interface PreparedFoodImage {
  buffer: Buffer;
  sourceSha256: string;
  outputSha256: string;
  width: number;
  height: number;
}

/** Transform to a safe, compact WebP; no EXIF or original file paths persist. */
export async function prepareFoodImage(
  source: Buffer,
  expectedSha256: string | null,
): Promise<PreparedFoodImage> {
  const sourceSha256 = createHash('sha256').update(source).digest('hex');
  if (expectedSha256 && sourceSha256 !== expectedSha256) {
    throw new Error('Approved source photo changed (SHA-256 mismatch).');
  }
  const image = sharp(source, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: 'error',
  });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
    throw new Error('Only JPEG, PNG and WebP source photos are accepted.');
  }
  const output = await image
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (output.data.length > MAX_IMAGE_BYTES)
    throw new Error('Optimized photo exceeds the 5 MB limit.');
  return {
    buffer: output.data,
    sourceSha256,
    outputSha256: createHash('sha256').update(output.data).digest('hex'),
    width: output.info.width,
    height: output.info.height,
  };
}
