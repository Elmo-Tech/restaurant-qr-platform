/**
 * FT-13B: LOCAL DEV / QA ONLY -- attaches demo food photos to the demo menu (the products the
 * FT-13A QA seed created) so the Guest Menu can be judged with real photography. It is NOT part
 * of the product and refuses to run when NODE_ENV=production.
 *
 * SAFE BY DEFAULT: with no --apply it only prints what it WOULD do (zero writes). It stores each
 * image through the SAME pieces the Staff upload endpoint uses -- `assertValidImageUpload`
 * (magic-byte sniffing, MIME whitelist, 5 MB limit), `ImageStorageService.saveImage` (server-
 * generated file name under the upload dir) and `ProductsService.setProductImage` /
 * `CategoriesService.setCategoryImage` -- never a raw path written to the database. A replaced
 * image's old file is removed best-effort after the DB write, exactly like the endpoint.
 *
 * Usage (from apps/api, PowerShell), images in <repo>/demo-assets/menu (git-ignored):
 *   npm run dev:attach-demo-images -- --restaurant-name "elmo cafe" --dir ..\..\demo-assets\menu
 *   npm run dev:attach-demo-images -- --restaurant-name "elmo cafe" --dir ..\..\demo-assets\menu --apply
 * Or select the restaurant with --restaurant-public-id <publicId>.
 *
 * File name -> product (matched by its English name, so this works for any restaurant carrying
 * the demo menu): loaded-fries.jpg -> "Loaded Fries", ... (see DEMO_IMAGE_MAP). Missing files are
 * skipped and reported. `cover.jpg` is reported as skipped: a restaurant cover image is not part
 * of the data model yet.
 *
 * It also removes the wrong "T-shirt" test image the earlier QA seed attached to "Margherita" and
 * to the "Burgers" category -- only when the stored file is byte-identical (SHA-256) to that
 * known placeholder, so a real photo is never touched.
 *
 * Exit codes: 0 ok / dry-run; 1 invalid input; 2 unexpected error.
 *
 * Thin wrapper over the existing services; same ts-node/require-shim approach as
 * provision-restaurant.ts.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '@nestjs/config';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { CategoriesService } from '../src/menu/categories.service';
import { ProductsService } from '../src/menu/products.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertValidImageUpload } from '../src/storage/image-file-validator';
import { ImageStorageService } from '../src/storage/image-storage.service';
import { resolveUploadDir } from '../src/storage/upload-dir';
import type { PrismaService } from '../src/database/prisma.service';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

/** image base name (no extension) -> the demo product's English name */
const DEMO_IMAGE_MAP: Record<string, string> = {
  'loaded-fries': 'Loaded Fries',
  'mozzarella-sticks': 'Mozzarella Sticks',
  'chicken-wings': 'Chicken Wings',
  'caesar-salad': 'Caesar Salad',
  'classic-burger': 'Classic Beef Burger',
  'bbq-burger': 'Smoky BBQ Burger',
  'chicken-burger': 'Crispy Chicken Burger',
  'mushroom-burger': 'Mushroom Swiss Burger',
  margherita: 'Margherita',
  pepperoni: 'Pepperoni',
  'chicken-ranch': 'Chicken Ranch',
  'four-cheese': 'Four Cheese',
  arrabbiata: 'Penne Arrabbiata',
  'grilled-chicken': 'Grilled Chicken',
  'beef-steak': 'Beef Steak',
  alfredo: 'Chicken Alfredo',
  'mixed-grill': 'Mashawi Mashakel Baladi',
  'molten-cake': 'Molten Chocolate Cake',
  cheesecake: 'Cheesecake',
  tiramisu: 'Tiramisu',
  'orange-juice': 'Fresh Orange Juice',
  'iced-latte': 'Iced Latte',
  mojito: 'Mojito',
  'soft-drink': 'Soft Drink',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/** The earlier QA seed's wrong test photo (a T-shirt); matched by content hash, never by name. */
const PLACEHOLDER_REFERENCE_FILE = '11918e55-f68b-40ef-9551-dc351a5f8390.jpg';
const PLACEHOLDER_PRODUCT_NAME = 'Margherita';
const PLACEHOLDER_CATEGORY_NAME = 'Burgers';

type Outcome =
  'attached' | 'would attach' | 'removed' | 'would remove' | 'skipped';
interface Row {
  file: string;
  target: string;
  outcome: Outcome;
  reason: string;
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function printTable(rows: Row[]): void {
  const widths = {
    file: Math.max(4, ...rows.map((row) => row.file.length)),
    target: Math.max(6, ...rows.map((row) => row.target.length)),
    outcome: Math.max(7, ...rows.map((row) => row.outcome.length)),
  };
  const line = (
    file: string,
    target: string,
    outcome: string,
    reason: string,
  ) =>
    `${file.padEnd(widths.file)}  ${target.padEnd(widths.target)}  ${outcome.padEnd(widths.outcome)}  ${reason}`;
  console.log(line('FILE', 'TARGET', 'OUTCOME', 'REASON'));
  console.log(
    line(
      '-'.repeat(widths.file),
      '-'.repeat(widths.target),
      '-'.repeat(widths.outcome),
      '------',
    ),
  );
  for (const row of rows)
    console.log(line(row.file, row.target, row.outcome, row.reason));
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to run: NODE_ENV=production. This is a local development tool.',
    );
    process.exitCode = 1;
    return;
  }

  const isApply = process.argv.includes('--apply');
  const restaurantPublicId = readFlag('restaurant-public-id');
  const restaurantName = readFlag('restaurant-name');
  const dirArgument = readFlag('dir');
  if ((!restaurantPublicId && !restaurantName) || !dirArgument) {
    console.error(
      'Required: --dir <folder> and one of --restaurant-public-id <id> | --restaurant-name <name>.',
    );
    process.exitCode = 1;
    return;
  }
  const dir = path.resolve(process.cwd(), dirArgument);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const restaurants = await prisma.restaurant.findMany({
      where: restaurantPublicId
        ? { publicId: restaurantPublicId }
        : { name: { equals: restaurantName, mode: 'insensitive' } },
      select: { id: true, publicId: true, name: true },
    });
    if (restaurants.length !== 1) {
      console.error(
        restaurants.length === 0
          ? 'No restaurant matches. Nothing was changed.'
          : `${restaurants.length} restaurants match -- use --restaurant-public-id to pick one. Nothing was changed.`,
      );
      process.exitCode = 1;
      return;
    }
    const restaurant = restaurants[0];

    const config = new ConfigService({
      UPLOAD_LOCAL_DIR: process.env.UPLOAD_LOCAL_DIR ?? '',
    });
    // The services only ever use the PrismaClient surface; the cast mirrors provision-restaurant.ts.
    const asService = prisma as unknown as PrismaService;
    const storage = new ImageStorageService(config as never);
    const products = new ProductsService(asService);
    const categories = new CategoriesService(asService);
    const uploadDir = resolveUploadDir(process.env.UPLOAD_LOCAL_DIR ?? '');

    console.log(`Demo image attach -- mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
    console.log(`  Restaurant: ${restaurant.name} (${restaurant.publicId})`);
    console.log(`  Folder:     ${dir}`);

    let present: string[] = [];
    try {
      present = await readdir(dir);
    } catch {
      console.log(
        '  (folder not found -- every image will be reported as missing)',
      );
    }
    const fileByBase = new Map<string, string>();
    for (const name of present) {
      const parsed = path.parse(name);
      if (MIME_BY_EXTENSION[parsed.ext.toLowerCase()])
        fileByBase.set(parsed.name.toLowerCase(), name);
    }

    const rows: Row[] = [];
    const actions: Array<() => Promise<void>> = [];

    // ---- 1) remove the wrong T-shirt placeholder (content-hash match only) ----
    let placeholderHash: string | null = null;
    try {
      placeholderHash = sha256(
        await readFile(path.join(uploadDir, PLACEHOLDER_REFERENCE_FILE)),
      );
    } catch {
      placeholderHash = null;
    }
    async function isPlaceholder(assetPath: string | null): Promise<boolean> {
      if (!assetPath || !placeholderHash) return false;
      try {
        return (
          sha256(
            await readFile(path.join(uploadDir, path.basename(assetPath))),
          ) === placeholderHash
        );
      } catch {
        return false;
      }
    }
    const margherita = await prisma.product.findFirst({
      where: {
        restaurantId: restaurant.id,
        translations: {
          some: { locale: 'en', name: PLACEHOLDER_PRODUCT_NAME },
        },
      },
      select: { id: true, primaryImageAssetPath: true },
    });
    if (margherita && (await isPlaceholder(margherita.primaryImageAssetPath))) {
      rows.push({
        file: '(T-shirt test image)',
        target: `product: ${PLACEHOLDER_PRODUCT_NAME}`,
        outcome: isApply ? 'removed' : 'would remove',
        reason: 'wrong placeholder photo',
      });
      actions.push(async () => {
        const result = await products.clearProductImage({
          restaurantId: restaurant.id,
          productId: margherita.id,
        });
        if (result.outcome === 'cleared')
          await storage.deleteImageBestEffort(result.previousImageAssetPath);
      });
    }
    const burgers = await prisma.category.findFirst({
      where: {
        restaurantId: restaurant.id,
        translations: {
          some: { locale: 'en', name: PLACEHOLDER_CATEGORY_NAME },
        },
      },
      select: { id: true, imageAssetPath: true },
    });
    if (burgers && (await isPlaceholder(burgers.imageAssetPath))) {
      rows.push({
        file: '(T-shirt test image)',
        target: `category: ${PLACEHOLDER_CATEGORY_NAME}`,
        outcome: isApply ? 'removed' : 'would remove',
        reason: 'wrong placeholder photo',
      });
      actions.push(async () => {
        const result = await categories.clearCategoryImage({
          restaurantId: restaurant.id,
          categoryId: burgers.id,
        });
        if (result.outcome === 'cleared')
          await storage.deleteImageBestEffort(result.previousImageAssetPath);
      });
    }

    // ---- 2) the cover (no data-model support yet) ----
    rows.push({
      file: fileByBase.get('cover') ?? 'cover.jpg',
      target: 'restaurant cover',
      outcome: 'skipped',
      reason: fileByBase.has('cover')
        ? 'a restaurant cover image is not part of the data model yet (FT-13B section 10 = NO)'
        : 'file not found; and a cover is not part of the data model yet',
    });

    // ---- 3) attach each demo photo to its product ----
    for (const [base, productName] of Object.entries(DEMO_IMAGE_MAP)) {
      const fileName = fileByBase.get(base);
      const label = fileName ?? `${base}.jpg`;
      const target = `product: ${productName}`;
      if (!fileName) {
        rows.push({
          file: label,
          target,
          outcome: 'skipped',
          reason: 'file not found in folder',
        });
        continue;
      }
      const product = await prisma.product.findFirst({
        where: {
          restaurantId: restaurant.id,
          translations: { some: { locale: 'en', name: productName } },
        },
        select: { id: true },
      });
      if (!product) {
        rows.push({
          file: label,
          target,
          outcome: 'skipped',
          reason: 'no product with that English name',
        });
        continue;
      }
      const fullPath = path.join(dir, fileName);
      const buffer = await readFile(fullPath);
      const mimetype = MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()];
      try {
        assertValidImageUpload({
          originalname: fileName,
          mimetype,
          size: (await stat(fullPath)).size,
          buffer,
        });
      } catch (error) {
        const code =
          (error as { response?: { error?: { code?: string } } }).response
            ?.error?.code ?? 'INVALID_IMAGE';
        rows.push({
          file: label,
          target,
          outcome: 'skipped',
          reason: `rejected by the image validator (${code})`,
        });
        continue;
      }
      rows.push({
        file: label,
        target,
        outcome: isApply ? 'attached' : 'would attach',
        reason: `${(buffer.length / 1024).toFixed(0)} KB ${mimetype}`,
      });
      actions.push(async () => {
        const saved = await storage.saveImage(buffer, mimetype);
        try {
          const result = await products.setProductImage({
            restaurantId: restaurant.id,
            productId: product.id,
            imageAssetPath: saved.assetPath,
          });
          if (result.outcome !== 'updated') {
            await storage.deleteImageBestEffort(saved.assetPath);
            throw new Error(`product ${productName} disappeared`);
          }
          await storage.deleteImageBestEffort(result.previousImageAssetPath);
        } catch (error) {
          await storage.deleteImageBestEffort(saved.assetPath);
          throw error;
        }
      });
    }

    if (isApply) {
      for (const action of actions) await action();
    }

    printTable(rows);
    const count = (outcome: Outcome) =>
      rows.filter((row) => row.outcome === outcome).length;
    console.log(
      isApply
        ? `\nAPPLIED: ${count('attached')} attached, ${count('removed')} removed, ${count('skipped')} skipped.`
        : `\nDRY RUN complete -- nothing was written (${count('would attach')} would attach, ${count('would remove')} would remove, ${count('skipped')} skipped). Re-run with --apply.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    'Unexpected error:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 2;
});
