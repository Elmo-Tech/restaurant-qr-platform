import { resolveFeatures } from '../entitlements/features';
import { upgradeCandidates, type PackageForOptions } from './plan-options';

const pkg = (
  id: string,
  features: PackageForOptions['features'],
  status: PackageForOptions['status'] = 'ACTIVE',
): PackageForOptions => ({ id, name: id, status, features });

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

  it('never offers the package the restaurant is on', () => {
    const result = upgradeCandidates({
      currentPackageId: 'PLUS',
      effective: effectiveFor(['MENU_TEMPLATES', 'WHATSAPP_ORDERING']),
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
        packages: [basic, plus, pro],
      }),
    ).toEqual([]);
  });

  it('skips archived packages', () => {
    const result = upgradeCandidates({
      currentPackageId: 'BASIC',
      effective: effectiveFor(['MENU_TEMPLATES']),
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
      packages: [plus, pro],
    });
    // PLUS adds only WhatsApp, which it already has: nothing to offer
    expect(result.map((c) => c.pkg.id)).toEqual(['PRO']);
    expect(result[0].adds).toEqual(['ORDER_TRACKING', 'DASHBOARD_ORDERING']);
  });
});
