import { createTranslator, currentClientLocale } from '../i18n/translate';
import { validateImageFile } from './image-validation';

/**
 * Client-side cover image rules: a UX courtesy only. They mirror the Backend's
 * authoritative limits (`assertValidCoverImageUpload`): banner-friendly aspect
 * ratio, minimum size and a maximum pixel grid. The Backend re-validates every
 * upload regardless of what this returns.
 */
export const COVER_MIN_WIDTH = 800;
export const COVER_MIN_HEIGHT = 300;
export const COVER_MAX_DIMENSION = 6000;
export const COVER_MIN_ASPECT_RATIO = 1.3;
export const COVER_MAX_ASPECT_RATIO = 3.2;

function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/** Returns a localized error message, or `null` when the file looks acceptable. */
export async function validateCoverImageFile(file: File): Promise<string | null> {
  const basic = validateImageFile(file);
  if (basic) return basic;

  const { t } = createTranslator(currentClientLocale());
  const dimensions = await readDimensions(file);
  if (!dimensions) return t('profile.cover.error.unreadable');
  const { width, height } = dimensions;
  if (width > COVER_MAX_DIMENSION || height > COVER_MAX_DIMENSION) {
    return t('profile.cover.error.tooLarge');
  }
  if (width < COVER_MIN_WIDTH || height < COVER_MIN_HEIGHT) {
    return t('profile.cover.error.tooSmall');
  }
  const ratio = width / height;
  if (ratio < COVER_MIN_ASPECT_RATIO || ratio > COVER_MAX_ASPECT_RATIO) {
    return t('profile.cover.error.aspect');
  }
  return null;
}
