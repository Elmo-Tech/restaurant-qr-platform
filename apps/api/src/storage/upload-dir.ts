import { isAbsolute, join } from 'node:path';

/**
 * Resolves the configured `UPLOAD_LOCAL_DIR` against the API process's own
 * working directory (never against `__dirname`/`src`, so uploaded files
 * never live inside a source-code folder -- FT-2, Section 4). A relative
 * value (the documented `.env.example` default, `./storage/uploads`)
 * resolves relative to `process.cwd()`; an absolute value is used as-is.
 * Kept as one pure function so `main.ts` (static asset serving) and
 * `ImageStorageService` (reading/writing files) can never disagree on where
 * the upload directory actually is.
 */
export function resolveUploadDir(uploadLocalDir: string): string {
  return isAbsolute(uploadLocalDir)
    ? uploadLocalDir
    : join(process.cwd(), uploadLocalDir);
}
