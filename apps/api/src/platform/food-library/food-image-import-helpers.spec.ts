import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  assertApprovedForImport,
  parseFoodImageImportManifest,
  prepareFoodImage,
  validateImageSourceUrl,
  type FoodImageImportManifest,
} from './food-image-import-helpers';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const source = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/example.jpg';
const base = (): FoodImageImportManifest => ({
  version: 1,
  images: [{
    id: 'pizza-01',
    name: 'Margherita Pizza',
    sourceUrl: source,
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
    licenseProofUrl: CC0,
    license: 'CC0',
    licenseReviewedAt: null,
    approved: false,
    expectedSha256: null,
    tagCodes: ['PIZZA', 'MARGHERITA_PIZZA'],
    sectors: ['RESTAURANT'],
    presentation: 'READY_TO_SERVE',
  }],
});

describe('food image batch import input safety', () => {
  it('accepts only approved public image hosts, HTTPS and direct photo paths', () => {
    expect(validateImageSourceUrl(source).hostname).toBe('upload.wikimedia.org');
    for (const url of [
      'http://upload.wikimedia.org/wikipedia/commons/food.jpg',
      'https://127.0.0.1/secret.jpg',
      'https://evil.example/photo.jpg',
      'https://upload.wikimedia.org.evil.example/photo.jpg',
      'https://upload.wikimedia.org:8443/wikipedia/commons/a.jpg',
      'https://upload.wikimedia.org@evil.example/a.jpg',
      'https://upload.wikimedia.org/wikipedia/en/a.jpg',
      'https://upload.wikimedia.org/wikipedia/commons/malware.svg',
    ]) {
      expect(() => validateImageSourceUrl(url)).toThrow();
    }
  });

  it('does not accept approval without a checked license date and pinned source hash', () => {
    const manifest = parseFoodImageImportManifest(base());
    expect(() => assertApprovedForImport(manifest)).toThrow('needs photo/rights approval');
    const data = base();
    data.images[0].approved = true;
    data.images[0].licenseReviewedAt = '2026-11-14';
    data.images[0].expectedSha256 = 'f'.repeat(64);
    expect(() => assertApprovedForImport(parseFoodImageImportManifest(data))).not.toThrow();
  });

  it('rejects duplicate codes, repeated images, mismatched evidence, invalid sectors and inconsistent metadata', () => {
    const duplicate = base();
    duplicate.images.push({ ...duplicate.images[0] });
    expect(() => parseFoodImageImportManifest(duplicate)).toThrow();
    const tags = base();
    tags.images[0].tagCodes = ['BEEF', 'BEEF'];
    expect(() => parseFoodImageImportManifest(tags)).toThrow();
    const sectors = base();
    sectors.images[0].sectors = ['UNKNOWN'];
    expect(() => parseFoodImageImportManifest(sectors)).toThrow();
    const rights = base();
    rights.images[0].licenseProofUrl = 'https://wordpress.org/photos/license/';
    expect(() => parseFoodImageImportManifest(rights)).toThrow();
    const privateSource = base();
    privateSource.images[0].sourceUrl = 'https://evil.example/image.jpg';
    expect(() => parseFoodImageImportManifest(privateSource)).toThrow();
    const badHash = base();
    badHash.images[0].expectedSha256 = 'abc';
    expect(() => parseFoodImageImportManifest(badHash)).toThrow();
  });
});

describe('food image batch preparation', () => {
  it('optimizes a valid photo into bounded WebP, strips metadata and verifies hash', async () => {
    const source = await sharp({
      create: { width: 2400, height: 1800, channels: 3, background: '#cc6611' },
    }).jpeg({ quality: 95 }).toBuffer();
    const hash = createHash('sha256').update(source).digest('hex');
    const ready = await prepareFoodImage(source, hash);
    const metadata = await sharp(ready.buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(1200);
    expect(metadata.exif).toBeUndefined();
    expect(ready.buffer.length).toBeLessThan(5 * 1024 * 1024);
    expect(ready.sourceSha256).toBe(hash);
    await expect(prepareFoodImage(source, '0'.repeat(64))).rejects.toThrow('SHA-256 mismatch');
  });

  it('rejects arbitrary text and unsupported formats before upload', async () => {
    await expect(prepareFoodImage(Buffer.from('not an image'), null)).rejects.toThrow();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>');
    await expect(prepareFoodImage(svg, null)).rejects.toThrow();
  });
});
