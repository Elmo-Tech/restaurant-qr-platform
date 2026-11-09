export interface SignatureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Find visible ink on a white or transparent background, without changing the stored image. */
export function findSignatureBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): SignatureBounds | null {
  if (width < 1 || height < 1 || pixels.length !== width * height * 4)
    return null;
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (
        pixels[i + 3] >= 16 &&
        Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 235
      ) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
        count++;
      }
    }
  }
  if (count < 3 || right <= left || bottom <= top) return null;
  const padding = Math.max(
    2,
    Math.ceil(Math.max(right - left + 1, bottom - top + 1) * 0.06),
  );
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
