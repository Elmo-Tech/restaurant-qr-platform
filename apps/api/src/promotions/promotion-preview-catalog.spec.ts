import { Prisma } from '../generated/prisma/client';
import { resolveLine, type ProductRow } from './promotion-preview-catalog';

const d = (value: string) => new Prisma.Decimal(value);
const MENU = 'menu-primary';
const named = (name: string | undefined) =>
  name === undefined ? [] : [{ name }];

type Option = {
  id: string;
  price?: string;
  displayOrder?: number;
  name?: string;
  sizeSettings?: {
    variantId: string;
    enabled: boolean;
    priceAdjustment: string;
  }[];
};
type Group = {
  id: string;
  min: number;
  max: number;
  variantId?: string | null;
  name?: string;
  options: Option[];
  disabledForSize?: string;
};

function row(
  overrides: {
    status?: 'ACTIVE' | 'INACTIVE';
    availability?: 'AVAILABLE' | 'SOLD_OUT';
    categoryStatus?: 'ACTIVE' | 'INACTIVE';
    menuId?: string;
    name?: string;
    sizes?: { id: string; price: string; name?: string }[];
    groups?: Group[];
  } = {},
): ProductRow {
  return {
    id: 'product-1',
    status: overrides.status ?? 'ACTIVE',
    availability: overrides.availability ?? 'AVAILABLE',
    basePrice: d('100.00'),
    discountType: null,
    discountValue: null,
    discountEnabled: false,
    discountStartsOn: null,
    discountEndsOn: null,
    category: {
      id: 'cat-1',
      menuId: overrides.menuId ?? MENU,
      status: overrides.categoryStatus ?? 'ACTIVE',
    },
    translations: named('name' in overrides ? overrides.name : 'Burger'),
    variants: (overrides.sizes ?? []).slice(0, 1).map((size) => ({
      id: size.id,
      price: d(size.price),
      discountApplies: true,
      translations: named('name' in size ? size.name : 'Small'),
    })),
    modifierGroups: (overrides.groups ?? []).map((group) => ({
      id: group.id,
      variantId: group.variantId ?? null,
      minimumSelections: group.min,
      maximumSelections: group.max,
      sizeSettings: group.disabledForSize
        ? [{ variantId: group.disabledForSize, enabled: false }]
        : [],
      translations: named('name' in group ? group.name : 'Group'),
      options: group.options.map((option, index) => ({
        id: option.id,
        priceAdjustment: d(option.price ?? '0.00'),
        displayOrder: option.displayOrder ?? index,
        sizeSettings: (option.sizeSettings ?? []).map((setting) => ({
          variantId: setting.variantId,
          enabled: setting.enabled,
          priceAdjustment: d(setting.priceAdjustment),
        })),
        translations: named('name' in option ? option.name : 'Option'),
      })),
    })),
  };
}

describe('resolveLine: the simple Guest line of one product, or why there is none', () => {
  it('a plain product and its first active size', () => {
    const plain = resolveLine(row(), MENU);
    expect(plain).toMatchObject({
      ok: true,
      guestItem: { productId: 'product-1', quantity: 1 },
      sample: { unitPrice: d('100.00'), variantId: null },
    });
    const sized = resolveLine(
      row({ sizes: [{ id: 'size-a', price: '80.00' }] }),
      MENU,
    );
    expect(sized).toMatchObject({
      ok: true,
      guestItem: { variantId: 'size-a' },
      sample: { unitPrice: d('80.00'), variantId: 'size-a' },
    });
  });

  it.each([
    [{ status: 'INACTIVE' as const }, 'ITEM_PRODUCT_INACTIVE'],
    [{ availability: 'SOLD_OUT' as const }, 'ITEM_PRODUCT_SOLD_OUT'],
    [{ categoryStatus: 'INACTIVE' as const }, 'ITEM_CATEGORY_INACTIVE'],
    [{ menuId: 'another-menu' }, 'ITEM_OUTSIDE_PRIMARY_MENU'],
    [{ name: undefined }, 'ITEM_NAME_MISSING'],
    [
      { sizes: [{ id: 'size-a', price: '80.00', name: undefined }] },
      'ITEM_SIZE_UNAVAILABLE',
    ],
  ])('refuses %j with %s', (overrides, reason) => {
    expect(resolveLine(row(overrides), MENU)).toEqual({ ok: false, reason });
  });

  it('nothing is orderable without an active primary menu', () => {
    expect(resolveLine(row(), null)).toEqual({
      ok: false,
      reason: 'ITEM_OUTSIDE_PRIMARY_MENU',
    });
  });

  it('a mandatory choice is satisfied with the cheapest valid free options, in menu order', () => {
    const result = resolveLine(
      row({
        groups: [
          {
            id: 'g1',
            min: 2,
            max: 3,
            options: [
              { id: 'paid', price: '5.00', displayOrder: 0 },
              { id: 'free-b', displayOrder: 2 },
              { id: 'free-a', displayOrder: 1 },
              { id: 'free-c', displayOrder: 3 },
            ],
          },
          // optional choices are simply not chosen
          {
            id: 'g2',
            min: 0,
            max: 2,
            options: [{ id: 'extra', price: '3.00' }],
          },
        ],
      }),
      MENU,
    );
    expect(result).toMatchObject({
      ok: true,
      guestItem: { modifierOptionIds: ['free-a', 'free-b'] },
    });
  });

  it('a mandatory choice that needs a paid extra is not previewable (no paid extras are assumed)', () => {
    expect(
      resolveLine(
        row({
          groups: [
            {
              id: 'g1',
              min: 1,
              max: 1,
              options: [{ id: 'paid', price: '5.00' }],
            },
          ],
        }),
        MENU,
      ),
    ).toEqual({ ok: false, reason: 'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA' });
  });

  it('a mandatory choice with too few options, or an impossible range, cannot be ordered at all', () => {
    expect(
      resolveLine(
        row({
          groups: [{ id: 'g1', min: 2, max: 2, options: [{ id: 'one' }] }],
        }),
        MENU,
      ),
    ).toEqual({ ok: false, reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE' });
    expect(
      resolveLine(
        row({
          groups: [
            { id: 'g1', min: 3, max: 1, options: [{ id: 'a' }, { id: 'b' }] },
          ],
        }),
        MENU,
      ),
    ).toEqual({ ok: false, reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE' });
    expect(
      resolveLine(
        row({ groups: [{ id: 'g1', min: 1, max: 1, options: [] }] }),
        MENU,
      ),
    ).toEqual({ ok: false, reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE' });
  });

  it('size rules decide which mandatory groups and options count (DEC-074)', () => {
    const size = [{ id: 'size-a', price: '80.00' }];
    // a group of ANOTHER size does not bind this one
    expect(
      resolveLine(
        row({
          sizes: size,
          groups: [
            {
              id: 'g1',
              min: 1,
              max: 1,
              variantId: 'size-b',
              options: [{ id: 'o', price: '9.00' }],
            },
          ],
        }),
        MENU,
      ),
    ).toMatchObject({ ok: true });
    // a Size Group of THIS size does, and a group switched off for this size does not
    expect(
      resolveLine(
        row({
          sizes: size,
          groups: [
            {
              id: 'g1',
              min: 1,
              max: 1,
              variantId: 'size-a',
              options: [{ id: 'free' }],
            },
            {
              id: 'g2',
              min: 1,
              max: 1,
              disabledForSize: 'size-a',
              options: [{ id: 'paid', price: '9.00' }],
            },
          ],
        }),
        MENU,
      ),
    ).toMatchObject({ ok: true, guestItem: { modifierOptionIds: ['free'] } });
    // a Size Group needs a size: a product without one never sees it
    expect(
      resolveLine(
        row({
          groups: [
            {
              id: 'g1',
              min: 1,
              max: 1,
              variantId: 'size-a',
              options: [{ id: 'paid', price: '9.00' }],
            },
          ],
        }),
        MENU,
      ),
    ).toMatchObject({ ok: true });
    // a per-size override can make an option free, paid or switched off
    const override = (setting: { enabled: boolean; priceAdjustment: string }) =>
      resolveLine(
        row({
          sizes: size,
          groups: [
            {
              id: 'g1',
              min: 1,
              max: 1,
              options: [
                {
                  id: 'o',
                  price: '9.00',
                  sizeSettings: [{ variantId: 'size-a', ...setting }],
                },
              ],
            },
          ],
        }),
        MENU,
      );
    expect(override({ enabled: true, priceAdjustment: '0.00' })).toMatchObject({
      ok: true,
      guestItem: { modifierOptionIds: ['o'] },
    });
    expect(override({ enabled: true, priceAdjustment: '2.00' })).toEqual({
      ok: false,
      reason: 'ITEM_REQUIRED_CHOICE_NEEDS_PAID_EXTRA',
    });
    expect(override({ enabled: false, priceAdjustment: '0.00' })).toEqual({
      ok: false,
      reason: 'ITEM_REQUIRED_CHOICE_UNAVAILABLE',
    });
  });
});
