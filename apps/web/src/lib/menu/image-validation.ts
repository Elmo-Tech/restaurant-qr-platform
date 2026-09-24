import { createTranslator, currentClientLocale } from '../i18n/translate';

/**
 * Client-side image validation (FT-2, Section 19) -- a UX courtesy only,
 * catching an obviously-wrong file before a network round trip. The
 * Backend's own validation (identical MIME whitelist and size limit)
 * remains authoritative; this never replaces it.
 */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  const { t } = createTranslator(currentClientLocale());
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    return t('menu.image.typeError');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return t('menu.image.sizeError');
  }
  return null;
}
