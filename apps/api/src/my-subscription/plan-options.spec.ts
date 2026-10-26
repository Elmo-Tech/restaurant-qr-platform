import { resolveFeatures } from '../entitlements/features';
import { comparisonCandidates, upgradeCandidates, type PackageForOptions } from './plan-options';

const pkg = (
  id: string,
  features: PackageForOptions['features'],
  status: PackageForOptions['status'] = 'ACTIVE',
  templateCount = 1,
): PackageForOptions => ({ id, name: id, status, features, templateCount });

const effectiveFor = (features: readonly string[]) =>
  resolveFeatures([], features);

describe('upgradeCandidates (DEC-050)', () => {
  const basic = pkg('BASIC', ['MENU_TEMPLATES']);
  const plus = pkg('PLUS', ['MENU_TEMPLATES', 'WHATSAPP_ORDERING']);
  const pro = pkg('PRO', [
    'MENU_TEMPLATES',
    'WHATSAPP_ORDERING',
    'ORDER_TRACKING',
    'DASHBOARD_ORDERING',
  ]);

  it('offers the packages that add something, smallest step first, saying what they add', () => {
    const result = upgradeCandidates({
      currentPackageId: 'BASIC',
      effective: effectiveFor(['MENU_TEMPLATES']),
      currentTemplateCount: 1,
      packages: [pro, basic, plus],
    });
    expect(result.map((c) => c.pkg.id)).toEqual(['PLUS', 'PRO']);
    expect(result[0].adds).toEqual(['WHATSAPP_ORDERING']);
    expect(result[1].adds).toEqual([
      'WHATSAPP_ORDERING',
      'ORDER_TRACKING',
      'DASHBOARD_ORDERING',
    ]);
  });


  it('compares BASIC with a restaurant on PLUS while never offering BASIC as an upgrade', () => {
    const input = {
      currentPackageId: 'PLUS',
      effective: effectiveFor(['MENU_TEMPLATES', 'WHATSAPP_ORDERING']),
      currentTemplateCount: 1,
      packages: [pro, plus, basic, pkg('LEGACY', ['MENU_TEMPLATES'], 'ARCHIVED')],
    };
    const visible = comparisonCandidates(input);
    expect(visible.map(({ pkg }) => pkg.id)).toEqual(['BASIC', 'PRO']);
    expect(visible[0].adds).toEqual([]);
    expect(upgradeCandidates(input).map(({ pkg }) => pkg.id)).toEqual(['PRO']);
  });

  it('never offers the package the restaurant is on', () => {
    const result = upgradeCandidates({
      currentPackageId: 'PLUS',
      effective: effectiveFor(['MENU_TEMPLATES', 'WHATSAPP_ORDERING']),
      currentTemplateCount: 1,
      packages: [basic, plus, pro],
    });
    expect(result.map((c) => c.pkg.id)).toEqual(['PRO']);
  });

  it('offers nothing to a restaurant that already has everything the others include', () => {
    const everything = resolveFeatures([], undefined);
    expect(
      upgradeCandidates({
        currentPackageId: null,
        effective: everything,
        currentTemplateCount: 7,
        packages: [basic, plus, pro],
      }),
    ).toEqual([]);
  });

  it('skips archived packages', () => {
    const result = upgradeCandidates({
      currentPackageId: 'BASIC',
      effective: effectiveFor(['MENU_TEMPLATES']),
      currentTemplateCount: 1,
      packages: [
        pkg('OLD', ['MENU_TEMPLATES', 'ORDER_TRACKING'], 'ARCHIVED'),
        plus,
      ],
    });
    expect(result.map((c) => c.pkg.id)).toEqual(['PLUS']);
  });

  it('counts a feature the restaurant got by an exception as already had', () => {
    const effective = resolveFeatures(
      [{ feature: 'WHATSAPP_ORDERING', enabled: true }],
      ['MENU_TEMPLATES'],
    );
    const result = upgradeCandidates({
      currentPackageId: 'BASIC',
      effective,
      currentTemplateCount: 1,
      packages: [plus, pro],
    });
    // PLUS adds only WhatsApp, which it already has: nothing to offer
    expect(result.map((c) => c.pkg.id)).toEqual(['PRO']);
    expect(result[0].adds).toEqual(['ORDER_TRACKING', 'DASHBOARD_ORDERING']);
  });

  it('offers a package that adds only more menu designs (DEC-051)', () => {
    const fewDesigns = pkg('FEW', ['MENU_TEMPLATES'], 'ACTIVE', 3);
    const allDesigns = pkg('ALL', ['MENU_TEMPLATES'], 'ACTIVE', 7);
    const result = upgradeCandidates({
      currentPackageId: 'FEW',
      effective: effectiveFor(['MENU_TEMPLATES']),
      currentTemplateCount: 3,
      packages: [fewDesigns, allDesigns],
    });
    expect(result.map((c) => c.pkg.id)).toEqual(['ALL']);
    expect(result[0].adds).toEqual([]);
    expect(result[0].moreTemplates).toBe(true);
  });
});
