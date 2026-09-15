import { Module } from '@nestjs/common';
import { ImageStorageService } from './image-storage.service';

/**
 * FT-2: isolates the first-working-version local-disk image storage
 * adapter behind its own module so `MenuModule` (and later the Public Menu
 * module) depend only on `ImageStorageService`'s small interface, never on
 * how/where files are actually persisted.
 */
@Module({
  providers: [ImageStorageService],
  exports: [ImageStorageService],
})
export class StorageModule {}
