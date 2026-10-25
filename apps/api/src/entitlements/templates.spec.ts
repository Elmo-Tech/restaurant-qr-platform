import {
  allowedTemplates,
  MENU_TEMPLATE_KEYS,
  templateCountOf,
  templateTierCountsOf,
  tierCounts,
} from './templates';

const ALL = [...MENU_TEMPLATE_KEYS];

describe('allowedTemplates (DEC-051)', () => {
  it('gives only Classic when the feature is off, whatever the package says', () => {
    expect(
      allowedTemplates({
        featureEnabled: false,
        rule: { includesFeature: true, all: true, selected: [] },
      }),
    ).toEqual(['CLASSIC']);
    expect(allowedTemplates({ featureEnabled: false, rule: null })).toEqual([
      'CLASSIC',
    ]);
  });

  it('gives every template to a restaurant without a package', () => {
    expect(allowedTemplates({ featureEnabled: true, rule: null })).toEqual(ALL);
  });

  it('gives every template, also future ones, when the package says "all"', () => {
    expect(
      allowedTemplates({
        featureEnabled: true,
        rule: { includesFeature: true, all: true, selected: ['LIST'] },
      }),
    ).toEqual(ALL);
  });

  it('gives Classic plus the chosen ones, in the documented order', () => {
    expect(
      allowedTemplates({
        featureEnabled: true,
        rule: {
          includesFeature: true,
          all: false,
          selected: ['COMPACT', 'GALLERY'],
        },
      }),
    ).toEqual(['CLASSIC', 'GALLERY', 'COMPACT']);
  });

  it('gives just Classic when the package includes the feature but chose none', () => {
    expect(
      allowedTemplates({
        featureEnabled: true,
        rule: { includesFeature: true, all: false, selected: [] },
      }),
    ).toEqual(['CLASSIC']);
  });

  it('gives every template when an exception allows the feature on a package that lacks it', () => {
    expect(
      allowedTemplates({
        featureEnabled: true,
        rule: { includesFeature: false, all: false, selected: [] },
      }),
    ).toEqual(ALL);
  });

  it('ignores unknown names in the chosen list', () => {
    expect(
      allowedTemplates({
        featureEnabled: true,
        rule: { includesFeature: true, all: false, selected: ['NOPE', 'MENU'] },
      }),
    ).toEqual(['CLASSIC', 'MENU']);
  });
});

describe('templateCountOf', () => {
  it('counts Classic and what the package adds', () => {
    expect(
      templateCountOf({ includesFeature: false, all: false, selected: [] }),
    ).toBe(1);
    expect(
      templateCountOf({
        includesFeature: true,
        all: false,
        selected: ['LIST', 'MENU'],
      }),
    ).toBe(3);
    expect(
      templateCountOf({ includesFeature: true, all: true, selected: [] }),
    ).toBe(MENU_TEMPLATE_KEYS.length);
  });
});

describe('template tiers (DEC-052)', () => {
  it('gives every standard template, and no premium one, for "all standard"', () => {
    const keys = allowedTemplates({
      featureEnabled: true,
      rule: {
        includesFeature: true,
        all: false,
        allStandard: true,
        selected: [],
      },
    });
    expect(keys).toEqual([
      'CLASSIC',
      'LIST',
      'CENTERED',
      'COMPACT',
      'EDITORIAL',
    ]);
    expect(tierCounts(keys)).toEqual({ standard: 5, premium: 0 });
  });

  it('adds the chosen premium templates to "all standard"', () => {
    const keys = allowedTemplates({
      featureEnabled: true,
      rule: {
        includesFeature: true,
        all: false,
        allStandard: true,
        selected: ['MENU', 'GALLERY'],
      },
    });
    expect(tierCounts(keys)).toEqual({ standard: 5, premium: 2 });
  });

  it('treats Ember as premium and keeps it out of all-standard packages', () => {
    const keys = allowedTemplates({
      featureEnabled: true,
      rule: { includesFeature: true, all: false, allStandard: true, selected: [] },
    });
    expect(keys).not.toContain('EMBER');
    const allowed = allowedTemplates({
      featureEnabled: true,
      rule: { includesFeature: true, all: false, allStandard: true, selected: ['EMBER'] },
    });
    expect(allowed).toContain('EMBER');
    expect(tierCounts(allowed)).toEqual({ standard: 5, premium: 1 });
  });

  it('includes Bloom only when its premium design is entitled', () => {
    const rule = { includesFeature: true, all: false, allStandard: true, selected: [] };
    expect(allowedTemplates({ featureEnabled: true, rule })).not.toContain('BLOOM');
    expect(allowedTemplates({ featureEnabled: true, rule: { ...rule, selected: ['BLOOM'] } }))
      .toContain('BLOOM');
  });

  it('treats the photo-free Editorial design as standard', () => {
    const keys = allowedTemplates({
      featureEnabled: true,
      rule: {
        includesFeature: true,
        all: false,
        allStandard: true,
        selected: [],
      },
    });
    expect(keys).toContain('EDITORIAL');
    expect(tierCounts(keys)).toEqual({ standard: 5, premium: 0 });
  });

  it('splits a chosen list by tier, Classic counting as standard', () => {
    expect(
      templateTierCountsOf({
        includesFeature: true,
        all: false,
        selected: ['LIST', 'COMPACT', 'MENU', 'FLOATING'],
      }),
    ).toEqual({ standard: 3, premium: 2 });
  });

  it('gives all of both tiers for "all"', () => {
    expect(
      templateTierCountsOf({ includesFeature: true, all: true, selected: [] }),
    ).toEqual({ standard: 5, premium: 5 });
  });
});
