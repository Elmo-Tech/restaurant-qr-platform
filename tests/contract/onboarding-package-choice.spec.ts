import {
  formConfigAfterModeChange,
  offerRecommendation,
  pendingConfigAfterModeChange,
  recommendedFirst,
  recommendedPackageId,
} from '../../apps/platform/src/lib/onboarding-package-choice';
import { MESSAGES } from '../../apps/platform/src/lib/i18n/messages';

/**
 * UI contract of the onboarding step-2 package choice (Product Owner decision 2026-11-22): the trial default
 * package is shown as a recommendation only and never becomes the selection by itself.
 */
const DEFAULT_ID = 'pkg-default';
const ACTIVE = [{ id: 'pkg-a' }, { id: DEFAULT_ID }, { id: 'pkg-b' }];

describe('onboarding package choice (UI contract)', () => {
  it('recommends the trial default only in TRIAL and only while it is ACTIVE', () => {
    expect(recommendedPackageId('TRIAL', DEFAULT_ID, ACTIVE)).toBe(DEFAULT_ID);
    expect(recommendedPackageId('REAL', DEFAULT_ID, ACTIVE)).toBeNull();
    expect(recommendedPackageId('DEMO', DEFAULT_ID, ACTIVE)).toBeNull();
    expect(recommendedPackageId(null, DEFAULT_ID, ACTIVE)).toBeNull();
    expect(recommendedPackageId('TRIAL', null, ACTIVE)).toBeNull();
    // Archived default (not in the ACTIVE list) or packages not loaded yet: no recommendation.
    expect(recommendedPackageId('TRIAL', 'pkg-archived', ACTIVE)).toBeNull();
    expect(recommendedPackageId('TRIAL', DEFAULT_ID, null)).toBeNull();
  });

  it('offers "Use recommended package" only until the operator has chosen a package', () => {
    expect(offerRecommendation(null, DEFAULT_ID)).toBe(true);
    expect(offerRecommendation(DEFAULT_ID, DEFAULT_ID)).toBe(false);
    expect(offerRecommendation('pkg-a', DEFAULT_ID)).toBe(false);
    expect(offerRecommendation(null, null)).toBe(false);
  });

  it('lists the recommended package first without dropping or selecting anything', () => {
    expect(recommendedFirst(ACTIVE, DEFAULT_ID).map((p) => p.id)).toEqual([
      DEFAULT_ID,
      'pkg-a',
      'pkg-b',
    ]);
    expect(recommendedFirst(ACTIVE, null)).toEqual(ACTIVE);
  });

  it('a mode switch drops the package from the form and from the unsaved edits', () => {
    expect(
      formConfigAfterModeChange({
        packageId: 'pkg-a',
        trialDays: 15,
        demoKind: 'cafe',
        demoHours: 24,
      }),
    ).toEqual({
      packageId: null,
      trialDays: 15,
      demoKind: 'cafe',
      demoHours: 24,
    });
    // The PATCH then carries no packageId, so the server clears it as well.
    const pending = pendingConfigAfterModeChange({
      packageId: 'pkg-a',
      trialDays: 30,
    });
    expect(pending).toEqual({ trialDays: 30 });
    expect(Object.hasOwn(pending, 'packageId')).toBe(false);
  });

  it('the recommendation copy exists in English and Arabic', () => {
    for (const key of [
      'onboarding.s2.recommended',
      'onboarding.s2.recommendedPrompt',
      'onboarding.s2.recommendedHint',
      'onboarding.s2.useRecommended',
    ] as const) {
      expect(MESSAGES.en[key]).toEqual(expect.any(String));
      expect(MESSAGES.ar[key]).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
