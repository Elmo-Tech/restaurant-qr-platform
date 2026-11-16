import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  assertApprovedForImport,
  parseFoodImageImportManifest,
  prepareFoodImage,
  validateImageSourceUrl,
} from './food-image-import-helpers';

const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';
const source =
  'https://upload.wikimedia.org/wikipedia/commons/a/ab/example.jpg';
const base = () => ({
  version: 1,
  images: [
    {
      id: 'pizza-01',
      name: 'Margherita Pizza',
      sourceUrl: source,
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      licenseProofUrl: CC0,
      license: 'CC0',
      licenseReviewedAt: null as string | null,
      approved: false,
      expectedSha256: null as string | null,
      tagCodes: ['PIZZA', 'MARGHERITA_PIZZA'],
      sectors: ['RESTAURANT'],
      presentation: 'READY_TO_SERVE',
    },
  ],
});

describe('food image batch import input safety', () => {
  it('accepts only approved public image hosts, HTTPS and direct photo paths', () => {
    expect(validateImageSourceUrl(source).hostname).toBe(
      'upload.wikimedia.org',
    );
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

  it('allows ISO Republic CC0 originals only with matching rights evidence', () => {
    const photo =
      'https://isorepublic.com/wp-content/uploads/2020/12/iso-republic-coffee-art-latte-brown.jpg';
    expect(validateImageSourceUrl(photo).hostname).toBe('isorepublic.com');
    const sample = base();
    sample.images[0].sourceUrl = photo;
    sample.images[0].sourcePageUrl =
      'https://isorepublic.com/photo/barista-latte-art/';
    sample.images[0].licenseProofUrl = 'https://isorepublic.com/license/';
    sample.images[0].tagCodes = ['COFFEE'];
    sample.images[0].sectors = ['CAFE'];
    expect(() => parseFoodImageImportManifest(sample)).not.toThrow();

    for (const url of [
      'https://www.isorepublic.com/wp-content/uploads/2020/12/image.jpg',
      'https://isorepublic.com/wp-json/wp/v2/users.json',
      'https://isorepublic.com/wp-content/uploads/image.jpg',
      'https://isorepublic.com/wp-content/uploads/2020/12/../../secret.jpg',
      'https://isorepublic.com/wp-content/uploads/2020/12/photo.svg',
      'https://isorepublic.com/wp-content/uploads/2020/12/photo.jpg?token=abc',
      'https://isorepublic.com/wp-content/uploads/2020/12/photo.jpg#frag',
    ]) {
      expect(() => validateImageSourceUrl(url)).toThrow();
    }
    const badProof = base();
    badProof.images[0] = { ...sample.images[0], licenseProofUrl: CC0 };
    expect(() => parseFoodImageImportManifest(badProof)).toThrow(
      'ISO Republic source and CC0 evidence do not match',
    );
    const badPage = base();
    badPage.images[0] = {
      ...sample.images[0],
      sourcePageUrl: 'https://isorepublic.com/blog/random-post/',
    };
    expect(() => parseFoodImageImportManifest(badPage)).toThrow();
  });

  it('supports only direct Foodie Factor CC0 photo originals with exact source and license proof', () => {
    const photo =
      'https://foodiefactor.com/wp-content/uploads/foodie-factor-taco-dish.jpg';
    const sample = base();
    sample.images[0].id = 'foodiefactor-tacos';
    sample.images[0].name = 'Tacos';
    sample.images[0].sourceUrl = photo;
    sample.images[0].sourcePageUrl = 'https://foodiefactor.com/tacos-street-food/';
    sample.images[0].licenseProofUrl = 'https://foodiefactor.com/license/';
    sample.images[0].tagCodes = ['TACOS'];
    expect(validateImageSourceUrl(photo).hostname).toBe('foodiefactor.com');
    const parsed = parseFoodImageImportManifest(sample);
    expect(parsed.images[0].approved).toBe(false);
    expect(() => assertApprovedForImport(parsed)).toThrow(
      'needs photo/rights approval',
    );

    for (const url of [
      'http://foodiefactor.com/wp-content/uploads/foodie-factor-taco-dish.jpg',
      'https://www.foodiefactor.com/wp-content/uploads/foodie-factor-taco-dish.jpg',
      'https://foodiefactor.com/wp-json/wp/v2/users.jpg',
      'https://foodiefactor.com/wp-content/uploads/other-image.jpg',
      'https://foodiefactor.com/wp-content/uploads/foodie-factor-pizza.png',
      'https://foodiefactor.com/wp-content/uploads/foodie-factor-pizza.jpg?download=1',
      'https://foodiefactor.com/wp-content/uploads/foodie-factor-pizza.jpg#hash',
      'https://foodiefactor.com/wp-content/uploads/2026/11/foodie-factor-pizza.jpg',
      'https://foodiefactor.com/wp-content/uploads/foodie-factor-../secrets.jpg',
    ]) {
      expect(() => validateImageSourceUrl(url)).toThrow();
    }
    const badProof = base();
    badProof.images[0] = {
      ...sample.images[0],
      licenseProofUrl: CC0,
    };
    expect(() => parseFoodImageImportManifest(badProof)).toThrow(
      'Foodie Factor source and CC0 evidence do not match',
    );
    const badPage = base();
    badPage.images[0] = {
      ...sample.images[0],
      sourcePageUrl: 'https://foodiefactor.com/blog/random/',
    };
    expect(() => parseFoodImageImportManifest(badPage)).toThrow();
  });

  it('does not accept approval without a checked license date and pinned source hash', () => {
    const manifest = parseFoodImageImportManifest(base());
    expect(() => assertApprovedForImport(manifest)).toThrow(
      'needs photo/rights approval',
    );
    const data = base();
    data.images[0].approved = true;
    data.images[0].licenseReviewedAt = '2026-11-14';
    data.images[0].expectedSha256 = 'f'.repeat(64);
    expect(() =>
      assertApprovedForImport(parseFoodImageImportManifest(data)),
    ).not.toThrow();
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
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    const hash = createHash('sha256').update(source).digest('hex');
    const ready = await prepareFoodImage(source, hash);
    const metadata = await sharp(ready.buffer).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(1200);
    expect(metadata.exif).toBeUndefined();
    expect(ready.buffer.length).toBeLessThan(5 * 1024 * 1024);
    expect(ready.sourceSha256).toBe(hash);
    await expect(prepareFoodImage(source, '0'.repeat(64))).rejects.toThrow(
      'SHA-256 mismatch',
    );
  });

  it('rejects arbitrary text and unsupported formats before upload', async () => {
    await expect(
      prepareFoodImage(Buffer.from('not an image'), null),
    ).rejects.toThrow();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
    );
    await expect(prepareFoodImage(svg, null)).rejects.toThrow();
  });
});
