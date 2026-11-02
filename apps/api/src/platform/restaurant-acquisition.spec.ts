import { validateAcquisitionInput } from './restaurant-acquisition';

describe('Platform customer acquisition attribution validation', () => {
  it('keeps legacy provisioning without attribution compatible', () => {
    expect(validateAcquisitionInput(undefined)).toEqual({
      ok: true,
      value: null,
    });
    expect(validateAcquisitionInput(null)).toEqual({ ok: true, value: null });
  });

  it('accepts a registered customer referral, a free-text customer and employee/sales names', () => {
    expect(
      validateAcquisitionInput({
        sourceType: 'CUSTOMER_REFERRAL',
        referringRestaurantId: 'b2b3f509-8b36-4e16-a024-429ef71b1c9d',
      }),
    ).toMatchObject({
      ok: true,
      value: { sourceType: 'CUSTOMER_REFERRAL', sourceName: null },
    });
    expect(
      validateAcquisitionInput({
        sourceType: 'CUSTOMER_REFERRAL',
        sourceName: '  Old customer  ',
      }),
    ).toMatchObject({
      ok: true,
      value: { sourceName: 'Old customer', referringRestaurantId: null },
    });
    expect(
      validateAcquisitionInput({
        sourceType: 'EMPLOYEE_REFERRAL',
        sourceName: '  Ahmed  ',
      }),
    ).toMatchObject({
      ok: true,
      value: { sourceName: 'Ahmed' },
    });
    expect(
      validateAcquisitionInput({
        sourceType: 'SALES',
        sourceName: 'Sales rep',
      }),
    ).toMatchObject({ ok: true });
  });

  it('requires the exact social or advertising platform, and supports campaigns', () => {
    expect(
      validateAcquisitionInput({
        sourceType: 'SOCIAL_MEDIA',
        sourcePlatform: 'instagram',
        campaign: 'November posts',
      }),
    ).toMatchObject({
      ok: true,
      value: { sourcePlatform: 'INSTAGRAM', campaign: 'November posts' },
    });
    expect(
      validateAcquisitionInput({
        sourceType: 'PAID_AD',
        sourcePlatform: 'GOOGLE',
        campaign: 'Search Ads',
      }),
    ).toMatchObject({ ok: true });
    expect(validateAcquisitionInput({ sourceType: 'SOCIAL_MEDIA' }).ok).toBe(
      false,
    );
    expect(
      validateAcquisitionInput({
        sourceType: 'SOCIAL_MEDIA',
        sourcePlatform: 'TELEGRAM',
      }).ok,
    ).toBe(false);
    expect(
      validateAcquisitionInput({
        sourceType: 'PAID_AD',
        sourcePlatform: 'OTHER',
      }).ok,
    ).toBe(false);
    expect(
      validateAcquisitionInput({
        sourceType: 'SOCIAL_MEDIA',
        sourcePlatform: 'OTHER',
        sourceDetail: 'Snapchat',
      }).ok,
    ).toBe(true);
  });

  it.each(['WEBSITE', 'DIRECT', 'OTHER'])(
    'requires a precise detail for %s',
    (sourceType) => {
      expect(validateAcquisitionInput({ sourceType }).ok).toBe(false);
      expect(
        validateAcquisitionInput({
          sourceType,
          sourceDetail: '  Google Search  ',
        }),
      ).toMatchObject({
        ok: true,
        value: { sourceDetail: 'Google Search' },
      });
    },
  );

  it('rejects contradictory or malformed referrals and stale hidden form values', () => {
    const cases = [
      { sourceType: 'CUSTOMER_REFERRAL' },
      {
        sourceType: 'CUSTOMER_REFERRAL',
        sourceName: 'Owner',
        referringRestaurantId: 'b2b3f509-8b36-4e16-a024-429ef71b1c9d',
      },
      { sourceType: 'CUSTOMER_REFERRAL', referringRestaurantId: 'not-a-uuid' },
      { sourceType: 'EMPLOYEE_REFERRAL', sourceName: '' },
      {
        sourceType: 'EMPLOYEE_REFERRAL',
        sourceName: 'Employee',
        sourcePlatform: 'FACEBOOK',
      },
      {
        sourceType: 'SOCIAL_MEDIA',
        sourcePlatform: 'FACEBOOK',
        sourceName: 'Not applicable',
      },
      { sourceType: 'OTHER', sourceDetail: 'a'.repeat(301) },
      { sourceType: 'UNKNOWN', sourceDetail: 'guess' },
      { sourceType: 'INVALID_SOURCE' },
      1,
    ];
    for (const item of cases) {
      expect(validateAcquisitionInput(item).ok).toBe(false);
    }
  });
});
