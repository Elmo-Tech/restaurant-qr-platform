import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_PUBLIC_PATH_PREFIX } from '../storage/image-storage.service';
import type { DemoKind } from './demo-constants';

/**
 * The content every temporary demo starts from (DEC-060, DEC-061): `apps/api/demo-template/<kind>/template.json` and its
 * photos, one folder per kind of business. It is plain data shipped with the API, never a live restaurant, so nobody
 * can change it by accident.
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
  /**
   * The copy and palette of a premium design, keyed by the design's name. Applied (through the same normalizer the
   * dashboard uses) only when the demo ends up on that design, so a Package that locks the design never gets it.
   */
  design?: Partial<Record<DesignKey, Record<string, unknown>>>;
}

export const DESIGN_KEYS = ['BREW', 'BLOOM'] as const;
export type DesignKey = (typeof DESIGN_KEYS)[number];

/** Where the templates live: next to the API's working directory (the Docker image copies it there). */
export function demoTemplateDir(kind: DemoKind): string {
  return join(process.cwd(), 'demo-template', kind);
}

const cached = new Map<DemoKind, DemoTemplate>();

/** Reads and checks a template once. A broken template is a deployment mistake: fail loudly, never half-build a demo. */
export async function loadDemoTemplate(kind: DemoKind): Promise<DemoTemplate> {
  const known = cached.get(kind);
  if (known) return known;
  const raw = await readFile(
    join(demoTemplateDir(kind), 'template.json'),
    'utf8',
  );
  const template = JSON.parse(raw) as DemoTemplate;
  assertValidTemplate(template);
  cached.set(kind, template);
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
  const designKeys: readonly string[] = DESIGN_KEYS;
  for (const key of Object.keys(template.design ?? {}))
    if (!designKeys.includes(key)) problems.push(`unknown design ${key}`);
  const chosen = template.restaurant.menuTemplate;
  if (designKeys.includes(chosen) && !(chosen in (template.design ?? {})))
    problems.push(`design ${chosen} has no settings`);
  if (problems.length > 0)
    throw new Error(`Invalid demo template: ${problems.join('; ')}`);
}

/**
 * The file a template photo is stored under in the upload directory. The restaurant keeps the name it had before kinds
 * existed (demos made then still point at it); the other kinds are prefixed so two kinds never share a name.
 */
export function templateImageTarget(kind: DemoKind, image: string): string {
  return kind === 'restaurant'
    ? `demo-template-${image}`
    : `demo-template-${kind}-${image}`;
}

/**
 * The template photos are copied once into the upload directory under fixed names and every demo points at the same
 * files: a demo costs no disk. Demos cannot upload or delete images (they are blocked), and the purge deletes rows
 * only, so these files are never removed.
 */
export async function installTemplateImages(
  kind: DemoKind,
  template: DemoTemplate,
  uploadDir: string,
): Promise<Map<string, string>> {
  await mkdir(uploadDir, { recursive: true });
  const paths = new Map<string, string>();
  for (const image of templateImages(template)) {
    const target = templateImageTarget(kind, image);
    const targetPath = join(uploadDir, target);
    const exists = await stat(targetPath).then(
      () => true,
      () => false,
    );
    if (!exists)
      await copyFile(join(demoTemplateDir(kind), 'images', image), targetPath);
    paths.set(image, `${MEDIA_PUBLIC_PATH_PREFIX}${target}`);
  }
  return paths;
}
