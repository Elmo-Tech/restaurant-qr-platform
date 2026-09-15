import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from './image-storage.service';
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
