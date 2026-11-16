import { assertLocalManifestApproved } from './local-food-image-import';
import {
  OWNER_DECISION_REF,
  PILOT_10_FILES,
  prepareOwnerAcceptedFoodImageManifest,
} from './prepare-owner-approved-food-images';

function makeSourcePack() {
  const files = [
    ...PILOT_10_FILES,
    ...Array.from(
      { length: 59 },
      (_, index) => '01_BURGERS/BURGER_' + String(index + 101) + '.webp',
    ),
  ];
  return {
    kind: 'WAYTA_DEDUPED_69_PHOTOS_REVIEW_ONLY_NOT_IMPORT_MANIFEST',
    originalFileCount: 76,
    distinctOriginalCount: 69,
    removedDuplicates: Array.from({ length: 7 }, (_, i) => ({ original: i })),
    photos: files.map((file, index) => {
      const isPexels = index < 23;
      return {
        file,
        sourceProvider: isPexels ? 'Pexels' : 'ShotStash',
        sourceLicense: isPexels ? 'Pexels License' : 'ShotStash CC0 claim',
        sourcePageUrl: isPexels
          ? 'https://www.pexels.com/photo/example-' + index + '/'
          : 'https://shotstash.com/photo/example-' + index + '/',
        originalSha256: (index + 1).toString(16).padStart(64, '0'),
        preparedWebpSha256: (index + 500).toString(16).padStart(64, '0'),
        tagCodes: [file.split('/')[1].replace(/_[0-9]{3}\.webp$/, '')],
        sectors: ['RESTAURANT'],
        presentation: 'READY_TO_SERVE',
        approvedForImport: false,
      };
    }),
  };
}

describe('owner-accepted 69-image manifest preparation', () => {
  it('converts exactly 69 images without inventing verified licenses or numerical QA', () => {
    const manifest = prepareOwnerAcceptedFoodImageManifest(
      makeSourcePack(),
      'all',
    );
    expect(manifest.images).toHaveLength(69);
    expect(
      manifest.images.filter((item) => item.licenseKind === 'PEXELS_UNCLEARED'),
    ).toHaveLength(23);
    expect(
      manifest.images.filter((item) => item.licenseKind === 'CC0_CLAIMED'),
    ).toHaveLength(46);
    for (const image of manifest.images) {
      expect(image.ownerAttestation?.decisionRef).toBe(OWNER_DECISION_REF);
      expect(image.ownerAttestation?.approvedBy).toBe('WAYTA_OWNER');
      expect(image.approved).toBe(true);
      expect(image.qualityScores).toBeNull();
      expect(image.rightsEvidenceRef).toBeNull();
      expect(image.sharedLibraryAuthorized).toBe(false);
      expect(image.squareCropApproved).toBe(false);
      expect(image.portraitCropApproved).toBe(false);
    }
    expect(() => assertLocalManifestApproved(manifest)).not.toThrow();
  });

  it('selects the exact ten established pilot photos after checking all 69 sources', () => {
    const manifest = prepareOwnerAcceptedFoodImageManifest(
      makeSourcePack(),
      'pilot',
    );
    expect(manifest.images.map((item) => item.file)).toEqual([
      ...PILOT_10_FILES,
    ]);
    expect(() => assertLocalManifestApproved(manifest)).not.toThrow();
  });

  it('refuses a different source pack rather than treating future images as accepted', () => {
    const source = makeSourcePack();
    source.photos.pop();
    expect(() => prepareOwnerAcceptedFoodImageManifest(source, 'all')).toThrow(
      'not the owner-accepted',
    );
    const wrong = makeSourcePack();
    wrong.originalFileCount = 100;
    expect(() => prepareOwnerAcceptedFoodImageManifest(wrong, 'all')).toThrow(
      'not the owner-accepted',
    );
  });

  it('rejects duplicates in the original source hash even with unique WebP bytes', () => {
    const source = makeSourcePack();
    source.photos[1].originalSha256 = source.photos[0].originalSha256;
    expect(() =>
      prepareOwnerAcceptedFoodImageManifest(source, 'pilot'),
    ).toThrow();
  });

  it('rejects provider mismatch and unexpected license sources', () => {
    const mismatch = makeSourcePack();
    mismatch.photos[0].sourcePageUrl = 'https://shotstash.com/photo/fake/';
    expect(() =>
      prepareOwnerAcceptedFoodImageManifest(mismatch, 'all'),
    ).toThrow('Provider and source page disagree');
    const unknown = makeSourcePack();
    unknown.photos[0].sourceProvider = 'UnknownStockVendor';
    expect(() => prepareOwnerAcceptedFoodImageManifest(unknown, 'all')).toThrow(
      'Unexpected source provider',
    );
  });

  it('rejects broken canonical tags and missing pilot image instead of guessing', () => {
    const wrongTag = makeSourcePack();
    wrongTag.photos[1].tagCodes = ['NOT_A_REAL_FOOD_CODE'];
    expect(() =>
      prepareOwnerAcceptedFoodImageManifest(wrongTag, 'all'),
    ).toThrow();
    const missingPilot = makeSourcePack();
    missingPilot.photos[0].file = '01_BURGERS/BURGER_099.webp';
    expect(() =>
      prepareOwnerAcceptedFoodImageManifest(missingPilot, 'pilot'),
    ).toThrow('Missing pilot photo');
  });
});
