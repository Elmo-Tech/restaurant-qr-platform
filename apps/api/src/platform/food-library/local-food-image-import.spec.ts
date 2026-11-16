import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  assertLocalManifestApproved,
  inspectLocalFoodImage,
  parseLocalFoodImageManifest,
} from './local-food-image-import';

const hash = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');

const base = () => ({
  version: 1,
  images: [
    {
      id: 'burger-001',
      name: 'Premium Burger',
      file: '01_BURGERS/BURGER_001.webp',
      sourcePageUrl: 'https://www.pexels.com/photo/burger-123/',
      sourceOriginalSha256: 'a'.repeat(64),
      optimizedSha256: 'b'.repeat(64),
      licenseKind: 'PEXELS_UNCLEARED',
      rightsEvidenceRef: null as string | null,
      rightsReviewedBy: null as string | null,
      rightsReviewedAt: null as string | null,
      sharedLibraryAuthorized: false,
      visualReviewedBy: null as string | null,
      visualReviewedAt: null as string | null,
      qualityScores: null as null | Record<string, number>,
      ownerAttestation: null as null | {
        decisionRef: string;
        acceptedAt: string;
        approvedBy: string;
        scope: string;
        acceptsQualityWithoutScores: boolean;
        acceptsUsageRightsResponsibility: boolean;
      },
      squareCropApproved: false,
      portraitCropApproved: false,
      approved: false,
      tagCodes: ['BURGER'],
      sectors: ['RESTAURANT'],
      presentation: 'READY_TO_SERVE',
    },
  ],
});

function markApproved(data: ReturnType<typeof base>) {
  const item = data.images[0];
  item.approved = true;
  item.licenseKind = 'CUSTOM_MULTI_TENANT_GRANT';
  item.rightsEvidenceRef = 'signed-multi-tenant-photo-license-burger-20261116';
  item.rightsReviewedBy = 'approved-platform-curator';
  item.rightsReviewedAt = '2026-11-15';
  item.sharedLibraryAuthorized = true;
  item.visualReviewedBy = 'approved-visual-reviewer';
  item.visualReviewedAt = '2026-11-15';
  item.qualityScores = {
    lighting: 9,
    foodStyling: 9.5,
    composition: 9,
    background: 9.5,
    advertisingSuitability: 9,
    tagAccuracy: 9,
  };
  item.squareCropApproved = true;
  item.portraitCropApproved = true;
  return data;
}

describe('owner acceptance as separate business approval basis', () => {
  const ownerDecision = () => {
    const input = base();
    input.images[0].approved = true;
    input.images[0].ownerAttestation = {
      decisionRef: 'wayta-owner-2026-11-16-69-image-acceptance',
      acceptedAt: '2026-11-16',
      approvedBy: 'WAYTA_OWNER',
      scope: 'WAYTA_SHARED_FOOD_LIBRARY',
      acceptsQualityWithoutScores: true,
      acceptsUsageRightsResponsibility: true,
    };
    return input;
  };

  it('permits explicit owner acceptance without inventing a source license or scores', () => {
    const parsed = parseLocalFoodImageManifest(ownerDecision());
    expect(parsed.images[0].licenseKind).toBe('PEXELS_UNCLEARED');
    expect(parsed.images[0].qualityScores).toBeNull();
    expect(parsed.images[0].ownerAttestation?.decisionRef).toBe(
      'wayta-owner-2026-11-16-69-image-acceptance',
    );
    expect(() => assertLocalManifestApproved(parsed)).not.toThrow();
  });

  it('rejects missing owner acceptance of rights or photo quality', () => {
    for (const property of [
      'acceptsQualityWithoutScores',
      'acceptsUsageRightsResponsibility',
    ] as const) {
      const input = ownerDecision();
      input.images[0].ownerAttestation![property] = false;
      expect(() =>
        assertLocalManifestApproved(parseLocalFoodImageManifest(input)),
      ).toThrow('Incomplete owner acceptance');
    }
  });

  it('rejects an invalid approver, scope or future decision date', () => {
    const invalidRole = ownerDecision();
    invalidRole.images[0].ownerAttestation!.approvedBy = 'THIRD_PARTY';
    expect(() => parseLocalFoodImageManifest(invalidRole)).toThrow(
      'Invalid ownerAttestation role or scope',
    );
    const invalidScope = ownerDecision();
    invalidScope.images[0].ownerAttestation!.scope = 'PUBLIC_STOCK_RESALE';
    expect(() => parseLocalFoodImageManifest(invalidScope)).toThrow(
      'Invalid ownerAttestation role or scope',
    );
    const invalidDate = ownerDecision();
    invalidDate.images[0].ownerAttestation!.acceptedAt = '2999-01-01';
    expect(() => parseLocalFoodImageManifest(invalidDate)).toThrow(
      'Invalid ownerAttestation.acceptedAt',
    );
  });
});

describe('local food photo batch import manifest safety', () => {
  it('accepts unapproved known-tag candidates for offline DRY RUN only', () => {
    const manifest = parseLocalFoodImageManifest(base());
    expect(manifest.images[0].tagCodes).toEqual(['BURGER']);
    expect(() => assertLocalManifestApproved(manifest)).toThrow(
      'multi-restaurant rights approval',
    );
  });

  it('requires separately signed/verified rights and individual six-score QA before APPLY', () => {
    const approved = markApproved(base());
    expect(() =>
      assertLocalManifestApproved(parseLocalFoodImageManifest(approved)),
    ).not.toThrow();

    const pexels = markApproved(base());
    pexels.images[0].licenseKind = 'PEXELS_UNCLEARED';
    expect(() =>
      assertLocalManifestApproved(parseLocalFoodImageManifest(pexels)),
    ).toThrow('multi-restaurant rights');

    const low = markApproved(base());
    low.images[0].qualityScores!.lighting = 8.9;
    expect(() =>
      assertLocalManifestApproved(parseLocalFoodImageManifest(low)),
    ).toThrow('premium 9/10');

    const missingCrop = markApproved(base());
    missingCrop.images[0].portraitCropApproved = false;
    expect(() =>
      assertLocalManifestApproved(parseLocalFoodImageManifest(missingCrop)),
    ).toThrow('premium 9/10');

    const missingProof = markApproved(base());
    missingProof.images[0].rightsEvidenceRef = null;
    expect(() =>
      assertLocalManifestApproved(parseLocalFoodImageManifest(missingProof)),
    ).toThrow('multi-restaurant rights');
  });

  it('rejects file traversal, fake tag codes, wrong name/tag and arbitrary license values', () => {
    const attempts = [
      { file: '../outside.webp' },
      { file: '01_BURGERS/../../foo.webp' },
      { file: 'C:\\Users\\me\\burger.webp' },
      { file: '/etc/passwd' },
      { file: '01_BURGERS/PIZZA_001.webp' },
      { tagCodes: ['GUESSED_FAKE_FOOD'] },
      { licenseKind: 'PEXELS_STANDARD_APPROVED' },
      { sourcePageUrl: 'http://example.com/burger' },
    ];
    for (const variant of attempts) {
      const data = base();
      Object.assign(data.images[0], variant);
      expect(() => parseLocalFoodImageManifest(data)).toThrow();
    }
  });

  it('rejects repeated original source, image files or hashes even if optimized bytes might differ', () => {
    const variants = [
      {
        id: 'burger-002',
        file: '01_BURGERS/BURGER_002.webp',
        optimizedSha256: 'c'.repeat(64),
      },
      {
        id: 'burger-002',
        file: '01_BURGERS/BURGER_002.webp',
        sourceOriginalSha256: 'c'.repeat(64),
      },
      {
        id: 'burger-002',
        file: '01_BURGERS/BURGER_002.webp',
        sourcePageUrl: 'https://www.pexels.com/photo/other-222/',
      },
    ];
    for (const variant of variants) {
      const data = base();
      data.images.push({ ...data.images[0], ...variant });
      expect(() => parseLocalFoodImageManifest(data)).toThrow();
    }
  });

  it('rejects out-of-range or partial numerical quality scores', () => {
    const data = markApproved(base());
    data.images[0].qualityScores!.lighting = 11;
    expect(() => parseLocalFoodImageManifest(data)).toThrow('quality score');
    const missing = markApproved(base());
    delete missing.images[0].qualityScores!.composition;
    expect(() => parseLocalFoodImageManifest(missing)).toThrow('quality score');
  });
});

describe('offline local WebP preflight', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'wayta-review-'));
    await mkdir(path.join(root, '01_BURGERS'));
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('verifies actual WebP bytes, dimensions, exact optimized SHA and path containment', async () => {
    const buffer = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#ba6622' },
    })
      .webp({ quality: 84 })
      .toBuffer();
    await writeFile(path.join(root, '01_BURGERS', 'BURGER_001.webp'), buffer);
    const manifest = base();
    manifest.images[0].optimizedSha256 = hash(buffer);
    const parsed = parseLocalFoodImageManifest(manifest);
    const file = await inspectLocalFoodImage(root, parsed.images[0]);
    expect(file.width).toBe(1200);
    expect(file.height).toBe(900);
    expect(hash(file.buffer)).toBe(hash(buffer));

    const wrong = base();
    wrong.images[0].optimizedSha256 = 'f'.repeat(64);
    await expect(
      inspectLocalFoodImage(root, parseLocalFoodImageManifest(wrong).images[0]),
    ).rejects.toThrow('SHA-256 mismatch');
  });

  it('rejects symlink escapes (or path traversal on restricted Windows)', async () => {
    // Windows without Developer Mode/admin cannot create symlinks. Linux CI
    // exercises the actual symlink check; Windows checks unsafe paths.
    if (process.platform === 'win32') {
      const invalid = base();
      invalid.images[0].file = '01_BURGERS/..\\outside.webp';
      expect(() => parseLocalFoodImageManifest(invalid)).toThrow();
      return;
    }
    const contents = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#bb4411' },
    })
      .webp()
      .toBuffer();
    const outside = path.join(root, 'outside.webp');
    await writeFile(outside, contents);
    await symlink(outside, path.join(root, '01_BURGERS', 'BURGER_001.webp'));
    const data = base();
    data.images[0].optimizedSha256 = hash(contents);
    await expect(
      inspectLocalFoodImage(root, parseLocalFoodImageManifest(data).images[0]),
    ).rejects.toThrow();
  });

  it('rejects non-WebP payloads with a matching hash', async () => {
    const image = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#553311' },
    })
      .jpeg()
      .toBuffer();
    await writeFile(path.join(root, '01_BURGERS', 'BURGER_001.webp'), image);
    const data = base();
    data.images[0].optimizedSha256 = hash(image);
    await expect(
      inspectLocalFoodImage(root, parseLocalFoodImageManifest(data).images[0]),
    ).rejects.toThrow('Not a real WebP');
  });
});
