import type { OrderQuote } from './public-orders.service';
import { issueWhatsappReference, verifyWhatsappReference } from '../whatsapp-tracking/signed-whatsapp-reference';
import {
  buildWhatsappMessage,
  buildWhatsappUrl,
  messageLanguage,
  plain,
} from './whatsapp-order-message';

type Item = OrderQuote['items'][number];

const item = (overrides: Partial<Item> = {}): Item => ({
  kind: 'PRODUCT',
  offerSlots: null,
  name: 'Burger',
  categoryName: 'Burgers',
  categoryOrder: 1,
  variantName: null,
  quantity: 1,
  modifiers: [],
  unitPrice: '60.00',
  discountAmount: '0.00',
  lineTotal: '60.00',
  ...overrides,
});

const quote = (overrides: Partial<OrderQuote> = {}): OrderQuote => ({
  restaurantId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  restaurantName: 'Elmo Cafe',
  whatsappNumber: '+201012345678',
  defaultLocale: 'en',
  currencyCode: 'EGP',
  orderType: 'DELIVERY',
  branchName: 'Zamalek',
  deliveryZoneName: 'Zone A',
  items: [
    item({
      variantName: 'Large',
      quantity: 2,
      modifiers: [
        { groupName: 'Extras', optionName: 'Cheese', priceAdjustment: '10.00' },
        { groupName: 'Extras', optionName: 'Bacon', priceAdjustment: '15.00' },
      ],
      unitPrice: '60.00',
      lineTotal: '170.00',
    }),
    item({
      name: 'Cola',
      categoryName: 'Drinks',
      categoryOrder: 2,
      unitPrice: '20.00',
      lineTotal: '20.00',
    }),
  ],
  subtotal: '190.00',
  discountTotal: '0.00',
  deliveryFee: '25.00',
  total: '215.00',
  customerName: 'Mona Hassan',
  customerPhone: '01012345678',
  customerNotes: 'No onions',
  deliveryAddress: '1 Nile St',
  deliveryBuilding: '12',
  deliveryFloor: '3',
  deliveryApartment: '8',
  deliveryLandmark: 'Next to the pharmacy',
  ...overrides,
});

describe('WhatsApp order message', () => {
  it('renders a compact, fully priced message without restaurant name or redundant labels', () => {
    const message = buildWhatsappMessage(quote());
    expect(message).toBe([
      '🧾 *New order*',
      '🛵 Delivery | Branch Zamalek | Area Zone A',
      '',
      '*Burgers*',
      '1) *Burger (Large) × 2 — 170 EGP*',
      '↳ Extras: Cheese (+10), Bacon (+15) per item',
      '',
      '*Drinks*',
      '2) *Cola × 1 — 20 EGP*',
      '',
      '👤 Mona Hassan | 📞 01012345678',
      '📍 1 Nile St, Building 12, Floor 3, Apartment 8, Landmark Next to the pharmacy',
      '📝 Order notes: No onions',
      'Items: 190 EGP',
      'Delivery fee: 25 EGP',
      '💰 *Total: 215 EGP*',
    ].join('\n'));
    expect(message).not.toContain('Elmo Cafe');
    expect(message).not.toContain('━━━━━━━━━━');
    expect(message).not.toContain('🗂️');
    expect(message).not.toContain('Sent from the digital menu');
  });

  it('keeps category menu order and distinguishes same-name products without category icons', () => {
    const message = buildWhatsappMessage(quote({
      items: [
        item({ name: 'Sausage', categoryName: 'Oriental pizza', categoryOrder: 5, variantName: 'M', lineTotal: '145.00' }),
        item({ name: 'Sausage', categoryName: 'Italian pizza', categoryOrder: 2, variantName: 'L', lineTotal: '210.00' }),
        item({ name: 'Margherita', categoryName: 'Italian pizza', categoryOrder: 2, lineTotal: '105.00' }),
      ],
    }));
    expect(message.indexOf('*Italian pizza*')).toBeLessThan(message.indexOf('*Oriental pizza*'));
    expect(message).toContain('1) *Sausage (L) × 1 — 210 EGP*');
    expect(message).toContain('2) *Margherita × 1 — 105 EGP*');
    expect(message).toContain('3) *Sausage (M) × 1 — 145 EGP*');
    expect(message).not.toContain('Category:');
  });

  it('keeps extras directly under their cart line, with free/negative options and per-piece note', () => {
    const message = buildWhatsappMessage(quote({
      items: [
        item({ quantity: 2, lineTotal: '300.00', modifiers: [
          { groupName: 'Sauce', optionName: 'Ranch', priceAdjustment: '0.00' },
          { groupName: 'Extras', optionName: 'Cheese', priceAdjustment: '50.00' },
          { groupName: 'Extras', optionName: 'Skip bun', priceAdjustment: '-5.00' },
        ] }),
        item({ lineTotal: '70.50', modifiers: [
          { groupName: 'Extras', optionName: 'Bacon', priceAdjustment: '10.50' },
        ] }),
      ],
    }));
    expect(message).toContain(
      '1) *Burger × 2 — 300 EGP*\n' +
      '↳ Sauce: Ranch per item\n' +
      '↳ Extras: Cheese (+50), Skip bun (-5) per item\n' +
      '2) *Burger × 1 — 70.50 EGP*\n' +
      '↳ Extras: Bacon (+10.50)',
    );
  });

  it('renders pickup, fractional discount and optional fields without delivery noise', () => {
    const message = buildWhatsappMessage(quote({
      orderType: 'PICKUP', deliveryZoneName: null, deliveryAddress: null,
      deliveryBuilding: null, deliveryFloor: null, deliveryApartment: null,
      deliveryLandmark: null, deliveryFee: '0.00', discountTotal: '12.50',
      subtotal: '147.50', total: '135.00',
    }));
    expect(message).toContain('🛍️ Pickup | Branch Zamalek');
    expect(message).toContain('Items: 147.50 EGP');
    expect(message).toContain('Discount: -12.50 EGP');
    expect(message).toContain('💰 *Total: 135 EGP*');
    expect(message).not.toContain('Delivery fee:');
    expect(message).not.toContain('Area ');
    expect(message).not.toContain('📍 ');
  });

  it('uses Arabic labels and currency; groups modifiers under the priced product', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', restaurantName: 'مطعم الشربيني',
      branchName: 'وسط البلد', deliveryZoneName: 'الدقي',
      items: [
        item({ name: 'بيتزا سجق', categoryName: 'البيتزا', categoryOrder: 2,
          variantName: 'كبير', quantity: 2, lineTotal: '380.00', modifiers: [
            { groupName: 'إضافات', optionName: 'جبنة', priceAdjustment: '20.00' },
            { groupName: 'إضافات', optionName: 'رانش', priceAdjustment: '10.00' },
          ] }),
        item({ name: 'مشلتت', categoryName: 'الفطير الحلو', categoryOrder: 1, lineTotal: '210.00' }),
      ],
      subtotal: '590.00', deliveryFee: '25.00', total: '615.00',
    }));
    expect(message.split('\n')[0]).toBe('🧾 *طلب جديد*');
    expect(message).toContain('🛵 توصيل | فرع وسط البلد | منطقة الدقي');
    expect(message.indexOf('*الفطير الحلو*')).toBeLessThan(message.indexOf('*البيتزا*'));
    expect(message).toContain(
      '2) *بيتزا سجق (كبير) × 2 — 380 ج*\n' +
      '↳ إضافات: جبنة (+20)، رانش (+10) لكل قطعة',
    );
    expect(message).toContain('التوصيل: 25 ج');
    expect(message).toContain('💰 *الإجمالي: 615 ج*');
    expect(message).not.toContain('مطعم الشربيني');
    expect(messageLanguage('ar-EG')).toBe('ar');
    expect(messageLanguage('fr')).toBe('en');
  });

  it('omits empty categories, notes, contact, and zero-fee breakdown', () => {
    const message = buildWhatsappMessage(quote({
      orderType: 'PICKUP', branchName: '', deliveryZoneName: null,
      items: [item({ categoryName: '' })], subtotal: '60.00', total: '60.00',
      deliveryFee: '0.00', customerName: null, customerPhone: null,
      customerNotes: null, deliveryAddress: null, deliveryBuilding: null,
      deliveryFloor: null, deliveryApartment: null, deliveryLandmark: null,
    }));
    expect(message).toBe(
      '🧾 *New order*\n🛍️ Pickup\n\n1) *Burger × 1 — 60 EGP*\n💰 *Total: 60 EGP*',
    );
  });

  it('neutralizes WhatsApp markup and excess whitespace in guest text', () => {
    expect(plain('*FREE* _food_ ~x~')).toBe('FREE food x');
    const message = buildWhatsappMessage(quote({
      customerNotes: '*URGENT*\n\n\nplease', customerName: '_Mona_',
    }));
    expect(message).toContain('📝 Order notes: URGENT please');
    expect(message).toContain('👤 Mona | 📞 01012345678');
  });

  it('lists offers first, with choices and gifts immediately below each offer', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', deliveryZoneName: null, orderType: 'PICKUP',
      items: [
        item({ name: 'كبدة إسكندراني', categoryName: 'السندوتشات', lineTotal: '45.00' }),
        item({ kind: 'OFFER', name: 'وجبة الفطار', categoryName: '', categoryOrder: -1,
          quantity: 2, lineTotal: '90.00', offerSlots: [
            { title: 'اختار الساندويتش', included: false,
              choices: [{ name: 'كبدة', quantity: 1, priceAdjustment: '10.00' }] },
            { title: 'هدية العرض', included: true,
              choices: [{ name: 'بطاطس هدية', quantity: 1, priceAdjustment: '0.00' }] },
          ] }),
        item({ kind: 'OFFER', name: 'بوكس العيلة', categoryName: '', categoryOrder: -1,
          lineTotal: '120.00', offerSlots: [
            { title: 'اختار ٣ ساندويتشات', included: false, choices: [
              { name: 'طعمية', quantity: 2, priceAdjustment: '0.00' },
              { name: 'جبنة رومي', quantity: 1, priceAdjustment: '5.00' },
            ] },
          ] }),
      ],
      subtotal: '255.00', total: '255.00', deliveryFee: '0.00',
    }));
    expect(message.indexOf('*العروض*')).toBeLessThan(message.indexOf('*السندوتشات*'));
    expect(message).toContain(
      '1) *وجبة الفطار × 2 — 90 ج*\n' +
      '↳ اختار الساندويتش: كبدة (+10)\n' +
      '↳ 🎁 هدية العرض: بطاطس هدية',
    );
    expect(message).toContain(
      '2) *بوكس العيلة × 1 — 120 ج*\n' +
      '↳ اختار ٣ ساندويتشات: 2× طعمية، جبنة رومي (+5)',
    );
    expect(message).toContain('3) *كبدة إسكندراني × 1 — 45 ج*');
  });

  it('keeps the signed Wayta-Ref as the last untouched line and rejects message edits', () => {
    const baseMessage = buildWhatsappMessage(quote());
    const key = Buffer.alloc(32, 42);
    const now = Date.UTC(2026, 10, 9, 15, 0, 0);
    const signed = issueWhatsappReference({
      restaurantId: quote().restaurantId, branchId: quote().branchId,
      orderType: 'DELIVERY', total: '215.00',
      currencyCode: 'EGP', baseMessage, key, now,
    });
    expect(baseMessage).not.toContain('Wayta-Ref:');
    expect(signed.message).toMatch(/\n\nWayta-Ref: WT1\.[^\s]+$/);
    expect(verifyWhatsappReference({
      restaurantId: quote().restaurantId, receivedMessage: signed.message, key, now,
    })).toEqual(expect.objectContaining({
      branchId: quote().branchId, orderType: 'DELIVERY',
      total: '215.00', currencyCode: 'EGP',
    }));
    expect(verifyWhatsappReference({
      restaurantId: quote().restaurantId,
      receivedMessage: signed.message.replace('170 EGP', '171 EGP'), key, now,
    })).toBeNull();
  });

  it('still builds a valid, encoded wa.me link', () => {
    expect(buildWhatsappUrl('+20 101 234 5678', 'Hi & bye\nline 2'))
      .toBe('https://wa.me/201012345678?text=Hi%20%26%20bye%0Aline%202');
  });
});
