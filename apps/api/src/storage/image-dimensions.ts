export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Reads the pixel size of a JPEG, PNG or WebP straight from the file header (no
 * image decoder, no dependency, no pixel buffer is ever allocated). The caller
 * has already sniffed the real format with `assertValidImageUpload`, so this
 * only needs to understand those three signatures. Returns `null` for anything
 * it cannot read safely, which callers treat as an unreadable image.
 */
export function readImageDimensions(
  buffer: Buffer,
  mimeType: string,
): ImageDimensions | null {
  try {
    if (mimeType === 'image/png') return readPng(buffer);
    if (mimeType === 'image/jpeg') return readJpeg(buffer);
    if (mimeType === 'image/webp') return readWebp(buffer);
  } catch {
    return null;
  }
  return null;
}

function valid(width: number, height: number): ImageDimensions | null {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readPng(buffer: Buffer): ImageDimensions | null {
  // 8-byte signature, then the IHDR chunk: length(4) 'IHDR'(4) width(4) height(4).
  if (buffer.length < 24 || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return valid(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readJpeg(buffer: Buffer): ImageDimensions | null {
  let offset = 2; // after the SOI marker
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    // Skip fill bytes.
    while (buffer[offset + 1] === 0xff) offset += 1;
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS before any frame header
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2; // standalone markers carry no length
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return valid(buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5));
    }
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function readWebp(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 30) return null;
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8X') {
    return valid(1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3));
  }
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes), start code 9D 01 2A, then 14-bit width / height.
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return valid(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return valid(width, height);
  }
  return null;
}
