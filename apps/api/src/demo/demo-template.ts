import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_PUBLIC_PATH_PREFIX } from '../storage/image-storage.service';

/**
 * The content every temporary demo restaurant starts from (DEC-060): `apps/api/demo-template/template.json` and its
 * photos. It is plain data shipped with the API, never a live restaurant, so nobody can change it by accident.
 */

export type Localized = { ar: string; en: string };

export interface DemoOption {
  names: Localized;
  price: string;
}
export interface DemoModifierGroup {
  names: Localized;
  helper: Localized;
  min: number;
  max: number;
  options: DemoOption[];
}
export interface DemoVariant {
  names: Localized;
  price: string;
  default: boolean;
}
export interface DemoProduct {
  key: string;
  image: string;
  names: Localized;
  descriptions: Localized;
  price: string;
  featured?: boolean;
  discount?: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: string };
  variants?: DemoVariant[];
  modifierGroups?: DemoModifierGroup[];
}
export interface DemoCategory {
  key: string;
  image: string;
  names: Localized;
  products: DemoProduct[];
}
export interface DemoZone {
  names: Localized;
  fee: string;
  minimum: string;
}
export interface DemoBranch {
  key: string;
  names: Localized;
  timezone: string;
  phone: string;
  address: Localized;
  tables: number;
  zones: DemoZone[];
}
export interface DemoTemplate {
  version: 1;
  restaurant: {
    name: string;
    defaultLocale: 'ar' | 'en';
    currencyCode: string;
    countryCode: string;
    menuTemplate: string;
    suggestionsMode: 'OFF' | 'MANUAL' | 'AUTO' | 'BOTH';
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    tableOrderingEnabled: boolean;
    whatsappOrderingEnabled: boolean;
    logo: string;
    cover: string;
  };
  branches: DemoBranch[];
  menu: { nameInternal: string; names: Localized; categories: DemoCategory[] };
  announcements: {
    style: 'INFO' | 'PROMO' | 'WARNING';
    texts: Localized;
  }[];
  suggestions: { product: string; suggested: string[] }[];
}

/** Where the template lives: next to the API's working directory (the Docker image copies it there). */
export function demoTemplateDir(): string {
  return join(process.cwd(), 'demo-template');
}

let cached: DemoTemplate | null = null;

/** Reads and checks the template once. A broken template is a deployment mistake: fail loudly, never half-build a demo. */
export async function loadDemoTemplate(): Promise<DemoTemplate> {
  if (cached) return cached;
  const raw = await readFile(join(demoTemplateDir(), 'template.json'), 'utf8');
  const template = JSON.parse(raw) as DemoTemplate;
  assertValidTemplate(template);
  cached = template;
  return template;
}

const IMAGE_NAME = /^[a-z0-9][a-z0-9-]*\.(jpg|png)$/;

/** Every image file the template points at, once. */
export function templateImages(template: DemoTemplate): string[] {
  const names = new Set<string>([
    template.restaurant.logo,
    template.restaurant.cover,
  ]);
  for (const category of template.menu.categories) {
    names.add(category.image);
    for (const product of category.products) names.add(product.image);
  }
  return [...names];
}

export function assertValidTemplate(template: DemoTemplate): void {
  const problems: string[] = [];
  if (template.version !== 1) problems.push('unknown template version');
  if (template.branches.length === 0) problems.push('no branch');
  if (template.menu.categories.length === 0) problems.push('no category');
  const keys = new Set<string>();
  for (const category of template.menu.categories) {
    if (category.products.length === 0)
      problems.push(`category ${category.key} has no product`);
    for (const product of category.products) {
      if (keys.has(product.key))
        problems.push(`duplicate product key ${product.key}`);
      keys.add(product.key);
      if (!product.names.ar || !product.names.en)
        problems.push(`product ${product.key} lacks a name in a language`);
      if (!/^\d+(\.\d{1,2})?$/.test(product.price))
        problems.push(`product ${product.key} has a bad price`);
      if ((product.variants?.filter((v) => v.default).length ?? 1) !== 1)
        problems.push(`product ${product.key} needs exactly one default size`);
    }
  }
  for (const suggestion of template.suggestions) {
    for (const key of [suggestion.product, ...suggestion.suggested])
      if (!keys.has(key))
        problems.push(`suggestion points at unknown product ${key}`);
  }
  for (const image of templateImages(template))
    if (!IMAGE_NAME.test(image)) problems.push(`bad image name ${image}`);
  if (problems.length > 0)
    throw new Error(`Invalid demo template: ${problems.join('; ')}`);
}

/**
 * The template photos are copied once into the upload directory under fixed names and every demo points at the same
 * files: a demo costs no disk. Demos cannot upload or delete images (they are blocked), and the purge deletes rows
 * only, so these files are never removed.
 */
export async function installTemplateImages(
  template: DemoTemplate,
  uploadDir: string,
): Promise<Map<string, string>> {
  await mkdir(uploadDir, { recursive: true });
  const paths = new Map<string, string>();
  for (const image of templateImages(template)) {
    const target = `demo-template-${image}`;
    const targetPath = join(uploadDir, target);
    const exists = await stat(targetPath).then(
      () => true,
      () => false,
    );
    if (!exists)
      await copyFile(join(demoTemplateDir(), 'images', image), targetPath);
    paths.set(image, `${MEDIA_PUBLIC_PATH_PREFIX}${target}`);
  }
  return paths;
}
