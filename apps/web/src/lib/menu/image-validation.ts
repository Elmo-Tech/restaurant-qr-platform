/**
 * Client-side image validation (FT-2, Section 19) -- a UX courtesy only,
 * catching an obviously-wrong file before a network round trip. The
 * Backend's own validation (identical MIME whitelist and size limit)
 * remains authoritative; this never replaces it.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, and WebP images are supported.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 5 MB or smaller.';
  }
  return null;
}
