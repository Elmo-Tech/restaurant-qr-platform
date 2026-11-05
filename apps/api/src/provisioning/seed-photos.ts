import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertValidImageUpload } from '../storage/image-file-validator';
import type { MenuSeed } from './seed-menu';

/** Every photo file a seed names (logo, category and product photos, the design's photo slots). */
export function seedPhotoNames(seed: MenuSeed): Set<string> {
  const named = new Set<string>();
  if (seed.restaurant.logo) named.add(seed.restaurant.logo);
  for (const category of seed.categories) {
    if (category.image) named.add(category.image);
    for (const product of category.products)
      if (product.image) named.add(product.image);
  }
  const design = seed.restaurant.exclusiveDesign;
  if (
    design?.rendererKey === 'SHERBINY_FIRE_DOUGH_V1' ||
    design?.rendererKey === 'MAKKBOZ_HERITAGE_V1' ||
    design?.rendererKey === 'MEAT_LOVERS_BUTCHER_V1'
  )
    for (const image of Object.values(design.images ?? {}))
      if (image) named.add(image);
  return named;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Reads one seed photo from the seed's `images/` folder and runs it through the same validator a dashboard upload
 * uses (type, size, real image content). Throws when the file is missing or not acceptable.
 */
export function createSeedPhotoReader(imagesDir: string) {
  return async (name: string) => {
    const buffer = await readFile(path.join(imagesDir, name));
    const file = {
      originalname: name,
      mimetype: MIME_BY_EXTENSION[path.extname(name).toLowerCase()] ?? '',
      size: buffer.length,
      buffer,
    };
    assertValidImageUpload(file);
    return file;
  };
}
