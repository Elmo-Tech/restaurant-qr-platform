import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvConfig } from '../config/env.schema';
import { resolveUploadDir } from './upload-dir';

/** V1 supported image MIME types (FT-2, Section 5) -- exhaustive, never inferred from a file extension. */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Every asset this service ever writes/serves is addressed under this one public prefix (FT-2, Section 6) -- `main.ts` mounts the same upload directory at this exact static prefix. */
export const MEDIA_PUBLIC_PATH_PREFIX = '/media/';

/**
 * First-working-version local-disk image storage for Product/Category
 * images (FT-2, Section 3). This is deliberately the ONLY place in the
 * Backend that touches the filesystem for images -- Product/Category
 * business logic only ever calls `saveImage`/`deleteImage` and persists the
 * returned/existing `assetPath` string. Swapping to S3, Supabase Storage,
 * or any other object store later means replacing this one class, never
 * touching `ProductsService`/`CategoriesService`.
 *
 * MUST be replaced or explicitly confirmed before a real Production
 * deployment (DEPLOYMENT_ARCHITECTURE.md #40-44) -- local disk does not
 * survive container replacement/horizontal scaling.
 *
 * Every stored filename is server-generated (`randomUUID()`), never the
 * client-supplied original filename -- `deleteImage` also only ever accepts
 * an `assetPath` shaped exactly like something this service itself
 * returned, so a corrupted/unexpected value can never be used to escape the
 * upload directory (SECURITY_SPEC.md path-traversal requirement).
 */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly uploadDir: string;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.uploadDir = resolveUploadDir(
      configService.get('UPLOAD_LOCAL_DIR', { infer: true }),
    );
  }

  /** Used only by `main.ts` to mount the matching static-file route -- never by Product/Category business logic. */
  getUploadDir(): string {
    return this.uploadDir;
  }

  async saveImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ assetPath: string }> {
    const extension = EXTENSION_BY_MIME_TYPE[mimeType];
    if (!extension) {
      // Defensive only -- callers must validate the MIME type (see
      // `assertValidImageUpload`) before ever calling this.
      throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }

    await mkdir(this.uploadDir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadDir, filename), buffer);

    return { assetPath: `${MEDIA_PUBLIC_PATH_PREFIX}${filename}` };
  }

  /** Throws on a genuine I/O failure -- callers decide whether that must fail the request (a brand-new orphaned upload) or only be logged (an old file being replaced, FT-2 Section 10). A missing file is treated as already-deleted, not an error. */
  async deleteImage(assetPath: string): Promise<void> {
    const filename = this.filenameFromAssetPath(assetPath);
    if (!filename) return;

    try {
      await unlink(join(this.uploadDir, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }

  /** Best-effort delete: failures are logged, never thrown -- a physical cleanup failure must never roll back a DB change that has already succeeded (FT-2, Section 10). */
  async deleteImageBestEffort(
    assetPath: string | null | undefined,
  ): Promise<void> {
    if (!assetPath) return;
    try {
      await this.deleteImage(assetPath);
    } catch (error) {
      this.logger.warn(
        `Failed to remove image asset "${assetPath}": ${String(error)}`,
      );
    }
  }

  private filenameFromAssetPath(assetPath: string): string | null {
    if (!assetPath.startsWith(MEDIA_PUBLIC_PATH_PREFIX)) return null;
    const filename = assetPath.slice(MEDIA_PUBLIC_PATH_PREFIX.length);
    if (
      filename === '' ||
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('..')
    ) {
      return null;
    }
    return filename;
  }
}
