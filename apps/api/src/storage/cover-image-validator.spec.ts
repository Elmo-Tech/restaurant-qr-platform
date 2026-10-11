import { BadRequestException } from '@nestjs/common';
import { readImageDimensions } from './image-dimensions';
import { assertValidCoverImageUpload } from './image-file-validator';
import type { UploadedImageFile } from './uploaded-image-file';

/** Minimal, header-only image buffers: enough for the signature sniff and the dimension reader. */
function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function webpExtended(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'latin1');
  buffer.write('VP8X', 12, 'latin1');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function webpLossy(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'latin1');
  buffer.write('WEBP', 8, 'latin1');
  buffer.write('VP8 ', 12, 'latin1');
  buffer[23] = 0x9d;
  buffer[24] = 0x01;
  buffer[25] = 0x2a;
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function webpLossless(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'latin1');
  buffer.write('WEBP', 8, 'latin1');
  buffer.write('VP8L', 12, 'latin1');
  buffer[20] = 0x2f;
  const w = width - 1;
  const h = height - 1;
  buffer[21] = w & 0xff;
  buffer[22] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
  buffer[23] = (h >> 2) & 0xff;
  buffer[24] = (h >> 10) & 0x0f;
  return buffer;
}

function file(buffer: Buffer, mimetype: string): UploadedImageFile {
  return { buffer, mimetype, size: buffer.length } as UploadedImageFile;
}

function errorCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof BadRequestException) {
      const body = error.getResponse() as { error: { code: string } };
      return body.error.code;
    }
    throw error;
  }
  return undefined;
}

describe('readImageDimensions', () => {
  it('reads PNG, JPEG and all three WebP encodings from the header', () => {
    expect(readImageDimensions(png(1600, 900), 'image/png')).toEqual({ width: 1600, height: 900 });
    expect(readImageDimensions(jpeg(1200, 500), 'image/jpeg')).toEqual({ width: 1200, height: 500 });
    expect(readImageDimensions(webpExtended(1920, 800), 'image/webp')).toEqual({
      width: 1920,
      height: 800,
    });
    expect(readImageDimensions(webpLossy(1000, 600), 'image/webp')).toEqual({
      width: 1000,
      height: 600,
    });
    expect(readImageDimensions(webpLossless(1280, 720), 'image/webp')).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('returns null (never throws) for truncated or unreadable data', () => {
    expect(readImageDimensions(Buffer.from([0x89, 0x50]), 'image/png')).toBeNull();
    expect(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg')).toBeNull();
    expect(readImageDimensions(Buffer.alloc(8), 'image/webp')).toBeNull();
    expect(readImageDimensions(png(10, 10), 'image/gif')).toBeNull();
  });
});

describe('assertValidCoverImageUpload', () => {
  it('accepts a 16:9 banner, a wide panorama at the limit and a 4:3 photo', () => {
    expect(errorCode(() => assertValidCoverImageUpload(file(png(1600, 900), 'image/png')))).toBeUndefined();
    expect(errorCode(() => assertValidCoverImageUpload(file(jpeg(1920, 600), 'image/jpeg')))).toBeUndefined();
    expect(errorCode(() => assertValidCoverImageUpload(file(jpeg(1600, 1200), 'image/jpeg')))).toBeUndefined();
    expect(errorCode(() => assertValidCoverImageUpload(file(webpExtended(1600, 900), 'image/webp')))).toBeUndefined();
  });

  it('rejects a missing file and a non-image through the shared image rules first', () => {
    expect(errorCode(() => assertValidCoverImageUpload(undefined))).toBe('IMAGE_REQUIRED');
    expect(errorCode(() => assertValidCoverImageUpload(file(Buffer.from('not an image'), 'image/png')))).toBe(
      'INVALID_IMAGE_TYPE',
    );
    // claimed type disagrees with the real signature
    expect(errorCode(() => assertValidCoverImageUpload(file(png(1600, 900), 'image/jpeg')))).toBe(
      'INVALID_IMAGE_TYPE',
    );
  });

  it('rejects an image that is too small', () => {
    expect(errorCode(() => assertValidCoverImageUpload(file(png(640, 360), 'image/png')))).toBe(
      'COVER_IMAGE_TOO_SMALL',
    );
  });

  it('rejects a portrait, square or extreme-panorama image', () => {
    expect(errorCode(() => assertValidCoverImageUpload(file(png(900, 1600), 'image/png')))).toBe(
      'COVER_IMAGE_INVALID_ASPECT_RATIO',
    );
    expect(errorCode(() => assertValidCoverImageUpload(file(png(1000, 1000), 'image/png')))).toBe(
      'COVER_IMAGE_INVALID_ASPECT_RATIO',
    );
    expect(errorCode(() => assertValidCoverImageUpload(file(png(3000, 600), 'image/png')))).toBe(
      'COVER_IMAGE_INVALID_ASPECT_RATIO',
    );
  });

  it('rejects an oversized pixel grid (decompression-bomb guard)', () => {
    expect(errorCode(() => assertValidCoverImageUpload(file(png(8000, 4500), 'image/png')))).toBe(
      'COVER_IMAGE_DIMENSIONS_TOO_LARGE',
    );
  });

  it('rejects a valid signature whose header cannot be read', () => {
    const truncated = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
    expect(errorCode(() => assertValidCoverImageUpload(file(truncated, 'image/jpeg')))).toBe('IMAGE_UNREADABLE');
  });
});
