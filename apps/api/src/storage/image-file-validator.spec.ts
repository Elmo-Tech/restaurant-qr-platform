import { BadRequestException } from '@nestjs/common';
import { assertValidImageUpload } from './image-file-validator';
import type { UploadedImageFile } from './uploaded-image-file';

function file(overrides: Partial<UploadedImageFile>): UploadedImageFile {
  return {
    originalname: 'upload.bin',
    mimetype: 'image/jpeg',
    size: 4,
    buffer: Buffer.from([]),
    ...overrides,
  };
}

const REAL_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const REAL_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const REAL_WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'latin1'),
]);
const FAKE_BYTES = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

describe('assertValidImageUpload', () => {
  it('accepts a real JPEG-signature buffer claimed as image/jpeg', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/jpeg',
          buffer: REAL_JPEG_BYTES,
          size: REAL_JPEG_BYTES.length,
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a real PNG-signature buffer claimed as image/png', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/png',
          buffer: REAL_PNG_BYTES,
          size: REAL_PNG_BYTES.length,
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a real WebP-signature buffer claimed as image/webp', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/webp',
          buffer: REAL_WEBP_BYTES,
          size: REAL_WEBP_BYTES.length,
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a non-image buffer claimed as image/jpeg', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/jpeg',
          buffer: FAKE_BYTES,
          size: FAKE_BYTES.length,
        }),
      ),
    ).toThrow(BadRequestException);

    try {
      assertValidImageUpload(
        file({
          mimetype: 'image/jpeg',
          buffer: FAKE_BYTES,
          size: FAKE_BYTES.length,
        }),
      );
      fail('expected assertValidImageUpload to throw');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toEqual({
        error: {
          code: 'INVALID_IMAGE_TYPE',
          message: 'Only JPEG, PNG, and WebP images are supported.',
        },
      });
    }
  });

  it('rejects real PNG bytes claiming to be image/jpeg', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/jpeg',
          buffer: REAL_PNG_BYTES,
          size: REAL_PNG_BYTES.length,
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing file', () => {
    expect(() => assertValidImageUpload(undefined)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a file above the size limit', () => {
    expect(() =>
      assertValidImageUpload(
        file({
          mimetype: 'image/jpeg',
          buffer: REAL_JPEG_BYTES,
          size: 5 * 1024 * 1024 + 1,
        }),
      ),
    ).toThrow(BadRequestException);
  });
});
