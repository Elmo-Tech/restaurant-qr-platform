import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from './image-storage.service';
import { readImageDimensions } from './image-dimensions';
import type { UploadedImageFile } from './uploaded-image-file';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Sniffs the actual image format from the file's own bytes (FT-2 code
 * review blocker): `file.mimetype` is a client-supplied HTTP header and is
 * never trusted alone (SECURITY_SPEC.md file-upload requirement). Returns
 * the one MIME type the magic bytes match, or `null` if none of the three
 * V1-supported formats' signatures are present. Deliberately checks only
 * the fixed leading/marker bytes each format's spec guarantees -- no
 * external dependency, no full image decode.
 */
function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Authoritative server-side validation for an uploaded Product/Category
 * image (FT-2, Section 5) -- Web client-side validation is a UX courtesy
 * only, never trusted. Rejects a missing file, a non-whitelisted claimed
 * MIME type, a buffer whose actual signature doesn't match any supported
 * format, a claimed MIME type that disagrees with the sniffed actual type,
 * or a file above the size limit -- each with its own stable error code
 * (mirrors the existing `PRODUCT_NOT_FOUND`-style envelope convention, not
 * Nest's default validation-pipe shape, since this runs outside the DTO
 * pipeline). Once this returns, `file.mimetype` is guaranteed to equal the
 * sniffed actual type, so `ImageStorageService.saveImage` can keep trusting
 * it for the stored file extension.
 */
export function assertValidImageUpload(
  file: UploadedImageFile | undefined,
): asserts file is UploadedImageFile {
  if (!file || file.size === 0) {
    throw new BadRequestException({
      error: { code: 'IMAGE_REQUIRED', message: 'An image file is required.' },
    });
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException({
      error: {
        code: 'INVALID_IMAGE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are supported.',
      },
    });
  }
  const detectedMimeType = detectImageMimeType(file.buffer);
  if (detectedMimeType === null || detectedMimeType !== file.mimetype) {
    throw new BadRequestException({
      error: {
        code: 'INVALID_IMAGE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are supported.',
      },
    });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new BadRequestException({
      error: {
        code: 'IMAGE_TOO_LARGE',
        message: 'Image must be 5 MB or smaller.',
      },
    });
  }
}

/**
 * Restaurant cover image rules. The Guest hero is a wide, full-bleed banner
 * (about 1280x400 on desktop, cropped with `object-fit: cover`), so the image
 * must be wide enough to stay sharp and within a banner-friendly aspect ratio.
 * Recommended: 1600x900 (16:9). Format, size and signature checks reuse
 * `assertValidImageUpload` first; these are the extra dimension rules.
 */
export const COVER_IMAGE_MIN_WIDTH = 800;
export const COVER_IMAGE_MIN_HEIGHT = 300;
export const COVER_IMAGE_MAX_DIMENSION = 6000;
export const COVER_IMAGE_MIN_ASPECT_RATIO = 1.3;
export const COVER_IMAGE_MAX_ASPECT_RATIO = 3.2;

export function assertValidCoverImageUpload(
  file: UploadedImageFile | undefined,
): asserts file is UploadedImageFile {
  assertValidImageUpload(file);

  const dimensions = readImageDimensions(file.buffer, file.mimetype);
  if (dimensions === null) {
    throw new BadRequestException({
      error: {
        code: 'IMAGE_UNREADABLE',
        message: 'The image could not be read. Upload a different file.',
      },
    });
  }
  const { width, height } = dimensions;
  if (width > COVER_IMAGE_MAX_DIMENSION || height > COVER_IMAGE_MAX_DIMENSION) {
    throw new BadRequestException({
      error: {
        code: 'COVER_IMAGE_DIMENSIONS_TOO_LARGE',
        message: `The cover image must be at most ${COVER_IMAGE_MAX_DIMENSION}px on each side.`,
      },
    });
  }
  if (width < COVER_IMAGE_MIN_WIDTH || height < COVER_IMAGE_MIN_HEIGHT) {
    throw new BadRequestException({
      error: {
        code: 'COVER_IMAGE_TOO_SMALL',
        message: `The cover image must be at least ${COVER_IMAGE_MIN_WIDTH}x${COVER_IMAGE_MIN_HEIGHT}px.`,
      },
    });
  }
  const ratio = width / height;
  if (ratio < COVER_IMAGE_MIN_ASPECT_RATIO || ratio > COVER_IMAGE_MAX_ASPECT_RATIO) {
    throw new BadRequestException({
      error: {
        code: 'COVER_IMAGE_INVALID_ASPECT_RATIO',
        message:
          'The cover image must be a landscape banner between 1.3:1 and 3.2:1 (recommended 16:9, for example 1600x900).',
      },
    });
  }
}
