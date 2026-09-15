/**
 * Structural shape of the file object Nest's `@UploadedFile()` decorator
 * injects when `FileInterceptor` uses multer's default in-memory storage
 * (no `storage`/`dest` option set). Declared locally rather than importing
 * `Express.Multer.File` from `@types/multer`: neither `multer` nor
 * `@nestjs/platform-express` ships its own type declarations for the file
 * object (`MulterOptions.storage` is typed `any`), and this repo
 * intentionally avoids adding a dependency solely for typing (CLAUDE.md
 * #52) when the handful of fields this code actually needs are easy to
 * declare directly.
 */
export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
