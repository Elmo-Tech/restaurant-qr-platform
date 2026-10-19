import {
  allowedTemplates,
  MENU_TEMPLATE_KEYS,
  templateCountOf,
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
