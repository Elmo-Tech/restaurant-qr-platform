import { createHash } from 'node:crypto';
import {
  canonicalOrderRequest,
  matchesStoredOrderRequestFingerprint,
  ORDER_REQUEST_FINGERPRINT_VERSION,
  orderRequestFingerprint,
  type OrderRequestIdentity,
} from './order-request-fingerprint';

function identity(
  overrides: Partial<OrderRequestIdentity> = {},
): OrderRequestIdentity {
  return {
    qrCodeId: 'qr-1',
    branchId: 'branch-1',
    orderType: 'PICKUP',
    channel: 'APP',
    items: [
      {
        productId: 'burger',
        quantity: 1,
        modifierOptionIds: ['cheese', 'bacon'],
        variantId: 'large',
      },
      { productId: 'salad', quantity: 2, modifierOptionIds: [] },
      {
        offerId: 'combo',
        quantity: 1,
        modifierOptionIds: [],
        offerChoices: [
          { slotId: 'main', optionId: 'o-burger', quantity: 1 },
          { slotId: 'drink', optionId: 'o-cola', quantity: 2 },
        ],
      },
    ],
    customerName: 'Mona',
    customerPhone: '+201000000001',
    customerNotes: null,
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryBuilding: null,
    deliveryFloor: null,
    deliveryApartment: null,
    deliveryLandmark: null,
    ...overrides,
  };
}

const base = identity();
const fp = (value: OrderRequestIdentity) => orderRequestFingerprint(value);

describe('order request fingerprint (API_CONVENTIONS.md #79-#81)', () => {
  it('is a 64-char lowercase SHA-256 hex of the versioned canonical string', () => {
    const canonical = canonicalOrderRequest(base);
    expect(ORDER_REQUEST_FINGERPRINT_VERSION).toBe('v1');
    expect(canonical.startsWith('v1:')).toBe(true);
    expect(fp(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(fp(base)).toBe(
      createHash('sha256').update(canonical, 'utf8').digest('hex'),
    );
  });

  it('is deterministic', () => {
    expect(fp(identity())).toBe(fp(identity()));
  });

  it('ignores item order', () => {
    expect(fp(identity({ items: [...base.items].reverse() }))).toBe(fp(base));
  });

  it('ignores modifier option order', () => {
    const items = base.items.map((item) =>
      item.productId === 'burger'
        ? { ...item, modifierOptionIds: ['bacon', 'cheese'] }
        : item,
    );
    expect(fp(identity({ items }))).toBe(fp(base));
  });

  it('ignores offer choice order', () => {
    const items = base.items.map((item) =>
      item.offerId === 'combo'
        ? { ...item, offerChoices: [...(item.offerChoices ?? [])].reverse() }
        : item,
    );
    expect(fp(identity({ items }))).toBe(fp(base));
  });

  it('treats omitted modifierOptionIds as an empty selection', () => {
    const items = base.items.map((item) =>
      item.productId === 'salad' ? { productId: 'salad', quantity: 2 } : item,
    );
    expect(fp(identity({ items }))).toBe(fp(base));
  });

  it('has no input for locale, expectedTotal, dryRun or prices: extra fields are never part of the identity', () => {
    // The identity type has no such fields; even if a caller passed the raw input object
    // (structurally wider), only the material fields are read.
    const wider = {
      ...base,
      locale: 'ar',
      expectedTotal: '999.00',
      dryRun: true,
      clientRequestId: 'another',
      items: base.items.map((item) => ({ ...item, unitPrice: '1.00' })),
    } as OrderRequestIdentity;
    expect(fp(wider)).toBe(fp(base));
  });

  it('keeps duplicate lines (never merged): a duplicated line differs from its merged form', () => {
    const one = identity({ items: [{ productId: 'salad', quantity: 2 }] });
    const dup = identity({
      items: [
        { productId: 'salad', quantity: 1 },
        { productId: 'salad', quantity: 1 },
      ],
    });
    expect(fp(dup)).not.toBe(fp(one));
    // ... and duplicate modifier ids are kept too.
    const dupMods = identity({
      items: [
        { productId: 'salad', quantity: 2, modifierOptionIds: ['x', 'x'] },
      ],
    });
    const singleMod = identity({
      items: [{ productId: 'salad', quantity: 2, modifierOptionIds: ['x'] }],
    });
    expect(fp(dupMods)).not.toBe(fp(singleMod));
  });

  const changes: [string, OrderRequestIdentity][] = [
    [
      'quantity',
      identity({
        items: base.items.map((i) =>
          i.productId === 'salad' ? { ...i, quantity: 3 } : i,
        ),
      }),
    ],
    [
      'product',
      identity({
        items: base.items.map((i) =>
          i.productId === 'salad' ? { ...i, productId: 'soup' } : i,
        ),
      }),
    ],
    [
      'variant',
      identity({
        items: base.items.map((i) =>
          i.productId === 'burger' ? { ...i, variantId: 'small' } : i,
        ),
      }),
    ],
    [
      'variant removed',
      identity({
        items: base.items.map((i) =>
          i.productId === 'burger' ? { ...i, variantId: undefined } : i,
        ),
      }),
    ],
    [
      'modifier added',
      identity({
        items: base.items.map((i) =>
          i.productId === 'salad'
            ? { ...i, modifierOptionIds: ['dressing'] }
            : i,
        ),
      }),
    ],
    [
      'modifier swapped',
      identity({
        items: base.items.map((i) =>
          i.productId === 'burger'
            ? { ...i, modifierOptionIds: ['cheese', 'egg'] }
            : i,
        ),
      }),
    ],
    [
      'offer',
      identity({
        items: base.items.map((i) =>
          i.offerId === 'combo' ? { ...i, offerId: 'combo-2' } : i,
        ),
      }),
    ],
    [
      'offer choice',
      identity({
        items: base.items.map((i) =>
          i.offerId === 'combo'
            ? {
                ...i,
                offerChoices: [
                  { slotId: 'main', optionId: 'o-chicken', quantity: 1 },
                  { slotId: 'drink', optionId: 'o-cola', quantity: 2 },
                ],
              }
            : i,
        ),
      }),
    ],
    [
      'offer choice quantity',
      identity({
        items: base.items.map((i) =>
          i.offerId === 'combo'
            ? {
                ...i,
                offerChoices: [
                  { slotId: 'main', optionId: 'o-burger', quantity: 1 },
                  { slotId: 'drink', optionId: 'o-cola', quantity: 1 },
                ],
              }
            : i,
        ),
      }),
    ],
    ['line removed', identity({ items: base.items.slice(1) })],
    ['fulfillment / order type', identity({ orderType: 'DELIVERY' })],
    ['branch', identity({ branchId: 'branch-2' })],
    ['qr', identity({ qrCodeId: 'qr-2' })],
    ['channel', identity({ channel: 'WHATSAPP' })],
    ['customer name', identity({ customerName: 'Mina' })],
    ['customer phone', identity({ customerPhone: '+201000000002' })],
    ['customer notes', identity({ customerNotes: 'No onions' })],
    ['delivery zone', identity({ deliveryZoneId: 'zone-1' })],
    ['delivery address', identity({ deliveryAddress: '1 Nile St' })],
    ['delivery building', identity({ deliveryBuilding: 'B' })],
    ['delivery floor', identity({ deliveryFloor: '3' })],
    ['delivery apartment', identity({ deliveryApartment: '12' })],
    ['delivery landmark', identity({ deliveryLandmark: 'Mosque' })],
  ];

  it.each(changes)('detects a material change: %s', (_label, changed) => {
    expect(fp(changed)).not.toBe(fp(base));
    expect(matchesStoredOrderRequestFingerprint(fp(base), changed)).toBe(false);
  });

  it('does not confuse values across fields (no ambiguous concatenation)', () => {
    expect(fp(identity({ customerName: 'a', customerNotes: null }))).not.toBe(
      fp(identity({ customerName: null, customerNotes: 'a' })),
    );
    expect(
      fp(
        identity({
          items: [{ productId: 'a', quantity: 1, modifierOptionIds: ['b,c'] }],
        }),
      ),
    ).not.toBe(
      fp(
        identity({
          items: [
            { productId: 'a', quantity: 1, modifierOptionIds: ['b', 'c'] },
          ],
        }),
      ),
    );
  });

  describe('matchesStoredOrderRequestFingerprint', () => {
    it('matches the same request', () => {
      expect(matchesStoredOrderRequestFingerprint(fp(base), identity())).toBe(
        true,
      );
    });

    it('treats a legacy NULL fingerprint as a match (old lenient replay)', () => {
      expect(matchesStoredOrderRequestFingerprint(null, base)).toBe(true);
      expect(matchesStoredOrderRequestFingerprint(undefined, base)).toBe(true);
    });

    it('rejects an unknown/foreign hash', () => {
      expect(matchesStoredOrderRequestFingerprint('0'.repeat(64), base)).toBe(
        false,
      );
    });
  });

  it('refuses an unknown version', () => {
    expect(() => canonicalOrderRequest(base, 'v0')).toThrow();
  });
});
