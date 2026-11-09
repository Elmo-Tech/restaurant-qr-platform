import { findSignatureBounds } from '../../apps/platform/src/lib/signature-bounds';

describe('signature display bounds', () => {
  it.each([0, 255])(
    'focuses on ink with a white or transparent background (alpha %i)',
    (alpha) => {
      const width = 100,
        height = 80;
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
        pixels[i + 3] = alpha;
      }
      for (let y = 35; y <= 44; y++)
        for (let x = 30; x <= 69; x++) {
          const i = (y * width + x) * 4;
          pixels[i] = 20;
          pixels[i + 1] = 20;
          pixels[i + 2] = 20;
          pixels[i + 3] = 255;
        }
      const bounds = findSignatureBounds(pixels, width, height);
      expect(bounds).not.toBeNull();
      expect(bounds?.width).toBeLessThan(width);
      expect(bounds?.height).toBeLessThan(height);
      expect(bounds?.x).toBeLessThan(30);
      expect(bounds?.y).toBeLessThan(35);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeGreaterThan(69);
    },
  );

  it('keeps the original display for a blank or unreadable image', () => {
    const white = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    expect(findSignatureBounds(white, 8, 8)).toBeNull();
    expect(findSignatureBounds(new Uint8ClampedArray(4), 8, 8)).toBeNull();
  });
});
