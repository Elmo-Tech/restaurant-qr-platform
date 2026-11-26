import { Prisma } from '../generated/prisma/client';
import {
  hasNoCartMinimum,
  requiresPositiveCartMinimum,
  toStaffPromotion,
  type PromotionConfig,
  type StaffPromotionRow,
} from './promotion-config';

const d = (value: string) => new Prisma.Decimal(value);

function config(overrides: Partial<PromotionConfig> = {}): PromotionConfig {
  return {
    internalName: 'Cart 10',
    scope: 'CART',
    discountType: 'PERCENTAGE',
    value: d('10.00'),
    priority: 100,
    startsOn: null,
    endsOn: null,
    minimumSubtotal: null,
    minimumQuantity: null,
    quantityBasis: null,
    branchIds: ['b1', 'b2'],
    menuIds: [],
    categoryIds: [],
    productIds: [],
    deliveryZoneIds: [],
    translations: [{ locale: 'en', title: 'Ten off', description: null }],
    ...overrides,
  };
}

describe('DEC-077 B2: hasNoCartMinimum', () => {
  it('is the legacy state: CART with NULL or 0.00', () => {
    expect(hasNoCartMinimum(config())).toBe(true);
    expect(hasNoCartMinimum(config({ minimumSubtotal: d('0.00') }))).toBe(true);
    expect(hasNoCartMinimum(config({ minimumSubtotal: d('0.01') }))).toBe(
      false,
    );
    expect(
      hasNoCartMinimum(config({ scope: 'DELIVERY', minimumSubtotal: null })),
    ).toBe(false);
  });
});

describe('DEC-077 B2: requiresPositiveCartMinimum (normalized, server-side comparison)', () => {
  const legacyNull = config();
  const legacyZero = config({ minimumSubtotal: d('0.00') });

  it('a new or reactivated CART promotion always needs it (no stored config to exempt)', () => {
    expect(requiresPositiveCartMinimum(null, config())).toBe(true);
    expect(
      requiresPositiveCartMinimum(null, config({ minimumSubtotal: d('200') })),
    ).toBe(true);
  });

  it('other scopes never need it', () => {
    expect(
      requiresPositiveCartMinimum(
        null,
        config({ scope: 'QUANTITY', minimumQuantity: 2 }),
      ),
    ).toBe(false);
    expect(
      requiresPositiveCartMinimum(null, config({ scope: 'DELIVERY' })),
    ).toBe(false);
  });

  it.each([
    ['NULL', legacyNull],
    ['0.00', legacyZero],
  ])(
    'legacy %s: metadata-only, re-sent and equivalent-spelling edits are exempt',
    (_label, legacy) => {
      expect(
        requiresPositiveCartMinimum(
          legacy,
          config({
            ...legacy,
            internalName: 'Renamed',
            translations: [{ locale: 'ar', title: 'عنوان', description: 'x' }],
          }),
        ),
      ).toBe(false);
      // the whole form re-sent with the stored values, in a different order and with equal decimals
      expect(
        requiresPositiveCartMinimum(
          legacy,
          config({
            ...legacy,
            value: d('10'),
            branchIds: ['b2', 'b1'],
            minimumSubtotal: d('0'),
          }),
        ),
      ).toBe(false);
      // NULL and 0.00 are the same "no minimum"
      expect(
        requiresPositiveCartMinimum(
          legacy,
          config({ ...legacy, minimumSubtotal: null }),
        ),
      ).toBe(false);
    },
  );

  it.each<[string, Partial<PromotionConfig>]>([
    ['value', { value: d('12.00') }],
    ['discount type', { discountType: 'FIXED_AMOUNT' }],
    [
      'scope',
      { scope: 'QUANTITY', minimumQuantity: 2, quantityBasis: 'UNITS' },
    ],
    ['start date', { startsOn: '2026-12-01' }],
    ['end date', { endsOn: '2026-12-31' }],
    ['Branches (narrower)', { branchIds: ['b1'] }],
    ['Branches (wider)', { branchIds: [] }],
    ['categories', { categoryIds: ['c1'] }],
    ['products', { productIds: ['p1'] }],
    ['priority', { priority: 50 }],
  ])('legacy: changing %s needs a positive minimum', (_label, change) => {
    const after = config({ ...change });
    // A scope change away from CART follows the target scope's rules, not this one.
    expect(requiresPositiveCartMinimum(legacyNull, after)).toBe(
      after.scope === 'CART',
    );
    expect(requiresPositiveCartMinimum(legacyZero, after)).toBe(
      after.scope === 'CART',
    );
  });

  it('legacy: a valid minimum supplied with a change is judged by the validator, and "0.00" with a change stays refused', () => {
    // The rule still says "required"; the validator then accepts 100.00 and refuses 0.00 / NULL.
    expect(
      requiresPositiveCartMinimum(
        legacyNull,
        config({ minimumSubtotal: d('100.00'), value: d('12.00') }),
      ),
    ).toBe(true);
    expect(
      requiresPositiveCartMinimum(
        legacyNull,
        config({ minimumSubtotal: d('0.00'), value: d('12.00') }),
      ),
    ).toBe(true);
  });

  it('a stored non-legacy CART promotion (minimum > 0) never gets the exemption', () => {
    const stored = config({ minimumSubtotal: d('200.00') });
    expect(
      requiresPositiveCartMinimum(stored, config({ minimumSubtotal: null })),
    ).toBe(true);
    expect(
      requiresPositiveCartMinimum(
        stored,
        config({ minimumSubtotal: d('0.00'), internalName: 'Renamed' }),
      ),
    ).toBe(true);
  });

  it('a stored non-CART promotion changed to CART is a new CART promotion', () => {
    const stored = config({ scope: 'DELIVERY' });
    expect(requiresPositiveCartMinimum(stored, config())).toBe(true);
  });
});

describe('DEC-077 B2: needsMinimumSubtotal read model', () => {
  const row = (overrides: Partial<StaffPromotionRow>): StaffPromotionRow => ({
    id: '00000000-0000-4000-8000-000000000001',
    internalName: 'Cart',
    scope: 'CART',
    discountType: 'PERCENTAGE',
    value: d('10.00'),
    status: 'ACTIVE',
    priority: 100,
    startsOn: null,
    endsOn: null,
    minimumSubtotal: null,
    minimumQuantity: null,
    quantityBasis: null,
    translations: [],
    branches: [],
    menus: [],
    categories: [],
    products: [],
    deliveryZones: [],
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    archivedAt: null,
    _count: { orderPromotions: 0 },
    ...overrides,
  });

  it('is true for legacy ACTIVE and INACTIVE CART promotions, whatever the spelling of "no minimum"', () => {
    expect(toStaffPromotion(row({})).needsMinimumSubtotal).toBe(true);
    expect(
      toStaffPromotion(row({ status: 'INACTIVE', minimumSubtotal: d('0.00') }))
        .needsMinimumSubtotal,
    ).toBe(true);
  });

  it('is false for a valid minimum, other scopes and archived promotions, and leaves existing fields unchanged', () => {
    expect(
      toStaffPromotion(row({ minimumSubtotal: d('0.01') }))
        .needsMinimumSubtotal,
    ).toBe(false);
    expect(
      toStaffPromotion(row({ scope: 'DELIVERY' })).needsMinimumSubtotal,
    ).toBe(false);
    expect(
      toStaffPromotion(row({ scope: 'QUANTITY' })).needsMinimumSubtotal,
    ).toBe(false);
    const archived = toStaffPromotion(row({ status: 'ARCHIVED' }));
    expect(archived.needsMinimumSubtotal).toBe(false);
    expect(archived).toMatchObject({
      priority: 100,
      value: '10.00',
      minimumSubtotal: null,
    });
  });
});
