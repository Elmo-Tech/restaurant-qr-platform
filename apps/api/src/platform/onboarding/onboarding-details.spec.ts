import {
  computeCompletedSteps,
  emptyDetails,
  emptyModeConfig,
  modeConfigForPatch,
  readDetails,
  readModeConfig,
  sanitizeDetailsPatch,
  sanitizeModeConfigPatch,
  suppliesPackageId,
  validateCustomerStep,
  validateModeStep,
  type ModeConfig,
  type OnboardingDetails,
} from './onboarding-details';

const PACKAGE_ID = '11111111-1111-4111-8111-111111111111';

function completeDetails(): OnboardingDetails {
  const details = emptyDetails();
  details.restaurant = {
    ...details.restaurant,
    name: 'Fake Bistro',
    businessType: 'RESTAURANT',
    branchName: 'Main',
    countryCode: 'EG',
    currencyCode: 'EGP',
    timezone: 'Africa/Cairo',
    defaultLocale: 'ar',
    additionalLocales: ['en'],
  };
  details.owner = {
    fullName: 'Owner Example',
    phone: '+201000000001',
    email: 'owner@example.test',
    facebookUrl: null,
    additionalContact: null,
  };
  details.acquisition = {
    sourceType: 'DIRECT',
    referringRestaurantId: null,
    sourceName: null,
    sourcePlatform: null,
    sourceDetail: 'Walk-in',
    campaign: null,
    adReference: null,
  };
  return details;
}

const config = (patch: Partial<ModeConfig>): ModeConfig => ({
  ...emptyModeConfig(),
  ...patch,
});
const ACTIVE = { pkg: { status: 'ACTIVE' as const }, trialsEnabled: true };

describe('onboarding details sanitizer (strict allow-list)', () => {
  it('merges restaurant / owner fields and trims, blank -> null', () => {
    const result = sanitizeDetailsPatch(
      {
        restaurant: { name: '  Fake Bistro ', phone: '' },
        owner: { email: 'A@Example.test' },
      },
      emptyDetails(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.restaurant.name).toBe('Fake Bistro');
    expect(result.value.restaurant.phone).toBeNull();
    expect(result.value.owner.email).toBe('A@Example.test');
    expect(result.value.owner.fullName).toBeNull();
  });

  it.each([
    [{ password: 'secret-123' }],
    [{ owner: { password: 'secret-123' } }],
    [{ owner: { ownerPassword: 'secret-123' } }],
    [{ restaurant: { name: 'x', adminPassword: 'secret-123' } }],
    [{ acquisition: { sourceType: 'DIRECT', password: 'secret-123' } }],
    [{ restaurant: { constructor: 'x' } }],
    [JSON.parse('{"owner":{"__proto__":{"password":"x"}}}') as unknown],
  ])('refuses any unknown key anywhere (%j)', (patch) => {
    const result = sanitizeDetailsPatch(patch, emptyDetails());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(' ')).toMatch(/unknown field/);
    // The refusal names the path but never echoes the value.
    expect(result.problems.join(' ')).not.toContain('secret-123');
  });

  // PO decision A-D1 (2026-11-21): the initial Owner password is typed only at final provisioning (A3) and
  // is never part of a draft. Every spelling is refused because the sanitizer is an allow-list.
  const PASSWORD_KEYS = [
    'password',
    'ownerPassword',
    'owner_password',
    'initialPassword',
    'pass',
    'passwd',
    'pwd',
    'Password',
    'PASSWORD',
    'secret',
    'passwordHash',
  ];
  it.each(PASSWORD_KEYS)(
    'refuses the password-like key %s in every details section and in modeConfig',
    (key) => {
      for (const patch of [
        { [key]: 'Fake-Pass-123' },
        { restaurant: { name: 'Fake Bistro', [key]: 'Fake-Pass-123' } },
        { owner: { email: 'o@example.test', [key]: 'Fake-Pass-123' } },
        {
          acquisition: {
            sourceType: 'DIRECT',
            sourceDetail: 'x',
            [key]: 'Fake-Pass-123',
          },
        },
      ]) {
        const result = sanitizeDetailsPatch(patch, emptyDetails());
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.problems.join(' ')).not.toContain('Fake-Pass-123');
      }
      const mode = sanitizeModeConfigPatch(
        { packageId: PACKAGE_ID, [key]: 'Fake-Pass-123' },
        emptyModeConfig(),
      );
      expect(mode.ok).toBe(false);
    },
  );

  it('a stored draft never exposes a password-like key on read', () => {
    const stored = Object.fromEntries(PASSWORD_KEYS.map((k) => [k, 'x']));
    const read = readDetails({
      ...stored,
      owner: { ...stored, email: 'o@example.test' },
    });
    expect(JSON.stringify(read)).not.toMatch(/pass|pwd|secret/i);
    expect(JSON.stringify(readModeConfig(stored))).not.toMatch(
      /pass|pwd|secret/i,
    );
  });

  it('refuses wrong types, nested objects in text fields and over-long values', () => {
    expect(
      sanitizeDetailsPatch({ owner: { email: 42 } }, emptyDetails()).ok,
    ).toBe(false);
    expect(
      sanitizeDetailsPatch(
        { owner: { email: { nested: 'x' } } },
        emptyDetails(),
      ).ok,
    ).toBe(false);
    expect(
      sanitizeDetailsPatch(
        { restaurant: { address: 'x'.repeat(501) } },
        emptyDetails(),
      ).ok,
    ).toBe(false);
    expect(sanitizeDetailsPatch([], emptyDetails()).ok).toBe(false);
    expect(
      sanitizeDetailsPatch(
        { restaurant: { additionalLocales: 'en' } },
        emptyDetails(),
      ).ok,
    ).toBe(false);
  });

  it('replaces acquisition as a whole and clears it with null', () => {
    const start = completeDetails();
    const replaced = sanitizeDetailsPatch(
      { acquisition: { sourceType: 'SALES', sourceName: 'Sales Person' } },
      start,
    );
    expect(replaced.ok && replaced.value.acquisition).toEqual({
      sourceType: 'SALES',
      referringRestaurantId: null,
      sourceName: 'Sales Person',
      sourcePlatform: null,
      sourceDetail: null,
      campaign: null,
      adReference: null,
    });
    const cleared = sanitizeDetailsPatch({ acquisition: null }, start);
    expect(cleared.ok && cleared.value.acquisition).toBeNull();
  });

  it('readDetails drops unknown stored keys (defence in depth)', () => {
    const read = readDetails({
      owner: { email: 'o@example.test', password: 'x' },
      password: 'y',
    });
    expect(JSON.stringify(read)).not.toContain('password');
    expect(read.owner.email).toBe('o@example.test');
  });

  it('mode config accepts only its four keys with the right types', () => {
    const ok = sanitizeModeConfigPatch(
      { packageId: PACKAGE_ID, trialDays: 15 },
      emptyModeConfig(),
    );
    expect(ok.ok && ok.value).toEqual(
      config({ packageId: PACKAGE_ID, trialDays: 15 }),
    );
    expect(
      sanitizeModeConfigPatch({ trialDays: 1.5 }, emptyModeConfig()).ok,
    ).toBe(false);
    expect(
      sanitizeModeConfigPatch({ trialDays: '15' }, emptyModeConfig()).ok,
    ).toBe(false);
    expect(
      sanitizeModeConfigPatch({ password: 'x' }, emptyModeConfig()).ok,
    ).toBe(false);
  });
});

describe('step 1 validation (customer and restaurant)', () => {
  it('a complete step has no problems', () => {
    expect(validateCustomerStep(completeDetails())).toEqual([]);
  });

  it('an empty draft lists every required field', () => {
    expect(validateCustomerStep(emptyDetails())).toEqual(
      expect.arrayContaining([
        'RESTAURANT_NAME_INVALID',
        'BUSINESS_TYPE_REQUIRED',
        'BRANCH_NAME_INVALID',
        'COUNTRY_INVALID',
        'CURRENCY_INVALID',
        'TIMEZONE_INVALID',
        'DEFAULT_LOCALE_INVALID',
        'OWNER_NAME_INVALID',
        'OWNER_PHONE_INVALID',
        'OWNER_EMAIL_INVALID',
        'ACQUISITION_REQUIRED',
      ]),
    );
  });

  it('reuses the provisioning, contact and acquisition rules', () => {
    const details = completeDetails();
    details.restaurant.name = 'X'; // provisioning: 2-100
    details.restaurant.timezone = 'Mars/Base';
    details.restaurant.defaultLocale = 'fr';
    details.restaurant.additionalLocales = ['ar'];
    details.restaurant.websiteUrl = 'http://example.test'; // https only
    details.restaurant.facebookUrl = 'https://example.test/page'; // not a Facebook host
    details.restaurant.whatsapp = '01000000001'; // WhatsApp needs the country code
    details.owner.email = 'not-an-email';
    details.owner.phone = '12';
    details.acquisition = { ...details.acquisition!, sourceDetail: null }; // DIRECT needs a detail
    expect(validateCustomerStep(details)).toEqual(
      expect.arrayContaining([
        'RESTAURANT_NAME_INVALID',
        'TIMEZONE_INVALID',
        'DEFAULT_LOCALE_INVALID',
        'RESTAURANT_WEBSITE_URL_INVALID',
        'RESTAURANT_FACEBOOK_URL_INVALID',
        'RESTAURANT_WHATSAPP_INVALID',
        'OWNER_EMAIL_INVALID',
        'OWNER_PHONE_INVALID',
        'ACQUISITION_INVALID',
      ]),
    );
  });

  it('additional locales must be supported, unique and not the default', () => {
    const details = completeDetails();
    details.restaurant.additionalLocales = ['de'];
    expect(validateCustomerStep(details)).toContain(
      'ADDITIONAL_LOCALES_INVALID',
    );
    details.restaurant.additionalLocales = ['en', 'en'];
    expect(validateCustomerStep(details)).toContain(
      'ADDITIONAL_LOCALES_INVALID',
    );
  });

  it('an UNKNOWN source is not an intentional choice', () => {
    const details = completeDetails();
    details.acquisition = {
      ...details.acquisition!,
      sourceType: 'UNKNOWN',
      sourceDetail: null,
    };
    expect(validateCustomerStep(details)).toContain('ACQUISITION_REQUIRED');
  });
});

describe('step 2 validation (mode)', () => {
  it('needs a mode', () => {
    expect(validateModeStep(null, emptyModeConfig(), ACTIVE)).toEqual([
      'MODE_REQUIRED',
    ]);
  });

  it('REAL needs an explicit ACTIVE package (no null-package shortcut)', () => {
    expect(
      validateModeStep('REAL', emptyModeConfig(), {
        pkg: null,
        trialsEnabled: true,
      }),
    ).toEqual(['PACKAGE_REQUIRED']);
    expect(
      validateModeStep('REAL', config({ packageId: PACKAGE_ID }), {
        pkg: { status: 'ARCHIVED' },
        trialsEnabled: true,
      }),
    ).toEqual(['PACKAGE_NOT_AVAILABLE']);
    expect(
      validateModeStep('REAL', config({ packageId: PACKAGE_ID }), {
        pkg: null,
        trialsEnabled: true,
      }),
    ).toEqual(['PACKAGE_NOT_AVAILABLE']);
    expect(
      validateModeStep('REAL', config({ packageId: PACKAGE_ID }), ACTIVE),
    ).toEqual([]);
  });

  it('TRIAL needs trials enabled, a package and 1..365 days', () => {
    const good = config({ packageId: PACKAGE_ID, trialDays: 15 });
    expect(validateModeStep('TRIAL', good, ACTIVE)).toEqual([]);
    expect(
      validateModeStep('TRIAL', good, { ...ACTIVE, trialsEnabled: false }),
    ).toEqual(['TRIAL_DISABLED']);
    expect(
      validateModeStep('TRIAL', config({ trialDays: 15 }), ACTIVE),
    ).toContain('PACKAGE_REQUIRED');
    for (const days of [0, 366, null]) {
      expect(
        validateModeStep(
          'TRIAL',
          config({ packageId: PACKAGE_ID, trialDays: days }),
          ACTIVE,
        ),
      ).toEqual(['TRIAL_DAYS_INVALID']);
    }
    expect(
      validateModeStep(
        'TRIAL',
        config({ packageId: PACKAGE_ID, trialDays: 365 }),
        ACTIVE,
      ),
    ).toEqual([]);
  });

  it('DEMO needs a known kind and hours within the demo limits; package optional', () => {
    const noPackage = { pkg: null, trialsEnabled: true };
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'cafe', demoHours: 24 }),
        noPackage,
      ),
    ).toEqual([]);
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'bakery', demoHours: 24 }),
        noPackage,
      ),
    ).toEqual(['DEMO_KIND_INVALID']);
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'cafe', demoHours: 0 }),
        noPackage,
      ),
    ).toEqual(['DEMO_HOURS_INVALID']);
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'cafe', demoHours: 24 * 14 + 1 }),
        noPackage,
      ),
    ).toEqual(['DEMO_HOURS_INVALID']);
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'sweets', demoHours: 336 }),
        noPackage,
      ),
    ).toEqual([]);
    expect(
      validateModeStep(
        'DEMO',
        config({ demoKind: 'cafe', demoHours: 1, packageId: PACKAGE_ID }),
        {
          pkg: { status: 'ARCHIVED' },
          trialsEnabled: true,
        },
      ),
    ).toEqual(['PACKAGE_NOT_AVAILABLE']);
  });
});

describe('explicit package confirmation (PO decision 2026-11-22)', () => {
  const OTHER_ID = '22222222-2222-4222-8222-222222222222';
  const patchOver = (
    previousMode: 'REAL' | 'TRIAL' | 'DEMO' | null,
    nextMode: 'REAL' | 'TRIAL' | 'DEMO' | null,
    stored: Partial<ModeConfig>,
    raw: Record<string, unknown> = {},
    trialDefaultDays: number | null = 15,
  ) => {
    const merged = sanitizeModeConfigPatch(raw, config(stored));
    if (!merged.ok) throw new Error('fixture patch must be valid');
    return modeConfigForPatch({
      previousMode,
      nextMode,
      config: merged.value,
      packageSupplied: suppliesPackageId(raw),
      trialDefaultDays,
    });
  };

  it('choosing TRIAL never fills the package from the trial default; only the length is prefilled', () => {
    // The function has no access to the default package at all: it can only clear, never invent, a package.
    const next = patchOver(null, 'TRIAL', {});
    expect(next).toEqual(config({ trialDays: 15 }));
    expect(validateModeStep('TRIAL', next, ACTIVE)).toEqual([
      'PACKAGE_REQUIRED',
    ]);
    // A length the operator already typed is kept (DEC-056: defaults only fill what is missing).
    expect(patchOver(null, 'TRIAL', { trialDays: 30 }).trialDays).toBe(30);
    expect(patchOver('REAL', 'TRIAL', {}, {}, null).trialDays).toBeNull();
  });

  it('accepting the recommended package or another one is an explicit packageId in the PATCH', () => {
    expect(
      patchOver(null, 'TRIAL', {}, { packageId: PACKAGE_ID }).packageId,
    ).toBe(PACKAGE_ID);
    expect(
      patchOver('TRIAL', 'TRIAL', { trialDays: 15 }, { packageId: OTHER_ID }),
    ).toEqual(config({ packageId: OTHER_ID, trialDays: 15 }));
  });

  it('a mode change clears the package unless the same PATCH supplies one', () => {
    const pairs = [
      ['TRIAL', 'REAL'],
      ['REAL', 'TRIAL'],
      ['TRIAL', 'DEMO'],
      ['DEMO', 'TRIAL'],
      ['REAL', 'DEMO'],
      ['DEMO', 'REAL'],
      ['REAL', null],
    ] as const;
    for (const [from, to] of pairs) {
      expect(
        patchOver(from, to, { packageId: PACKAGE_ID, trialDays: 15 }).packageId,
      ).toBeNull();
      expect(
        patchOver(from, to, { packageId: PACKAGE_ID }, { packageId: OTHER_ID })
          .packageId,
      ).toBe(OTHER_ID);
    }
    // An explicit null in the same PATCH is also an explicit choice.
    expect(
      patchOver('REAL', 'TRIAL', { packageId: PACKAGE_ID }, { packageId: null })
        .packageId,
    ).toBeNull();
  });

  it('without a mode change the stored selection and the other mode fields are kept', () => {
    const stored = {
      packageId: PACKAGE_ID,
      trialDays: 20,
      demoKind: 'cafe',
      demoHours: 24,
    };
    expect(patchOver('TRIAL', 'TRIAL', stored, { trialDays: 21 })).toEqual(
      config({ ...stored, trialDays: 21 }),
    );
    // Other mode fields survive a mode change: each is read only by its own mode.
    expect(patchOver('DEMO', 'REAL', stored)).toEqual(
      config({ ...stored, packageId: null }),
    );
  });

  it('suppliesPackageId sees only an own packageId key', () => {
    expect(suppliesPackageId({ packageId: null })).toBe(true);
    expect(suppliesPackageId({ trialDays: 3 })).toBe(false);
    expect(suppliesPackageId(undefined)).toBe(false);
  });
});

describe('completed steps', () => {
  it('is computed from problems; steps 3-5 are never complete in this build', () => {
    expect(computeCompletedSteps({ customer: [], mode: [] })).toEqual([
      'customer',
      'mode',
    ]);
    expect(computeCompletedSteps({ customer: ['X'], mode: [] })).toEqual([
      'mode',
    ]);
    expect(
      computeCompletedSteps({ customer: [], mode: ['MODE_REQUIRED'] }),
    ).toEqual(['customer']);
  });
});
