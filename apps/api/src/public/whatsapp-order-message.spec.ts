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
      '*New order*',
      'Delivery | Branch Zamalek | Area Zone A',
      '',
      '*Burgers*',
      '* 2 × *Burger* (Large) = 120 EGP',
      '↳ Extras: Cheese × 2 (+20 EGP), Bacon × 2 (+30 EGP)',
      '',
      '*Drinks*',
      '* 1 × *Cola* = 20 EGP',
      '',
      'Customer: Mona Hassan | Phone: 01012345678',
      'Address: 1 Nile St, Building 12, Floor 3, Apartment 8, Landmark Next to the pharmacy',
      'Order notes: No onions',
      'Items: 190 EGP',
      'Delivery fee: 25 EGP',
      '*Total: 215 EGP*',
    ].join('\n'));
    expect(message).not.toContain('Elmo Cafe');
    expect(message).not.toContain('━━━━━━━━━━');
    expect(message).not.toContain('🗂️');
    expect(message).not.toContain('Sent from the digital menu');
  });

  it('keeps category menu order and distinguishes same-name products without category icons', () => {
    const message = buildWhatsappMessage(quote({
      items: [
        item({ name: 'Sausage', categoryName: 'Oriental pizza', categoryOrder: 5, variantName: 'M', unitPrice: '145.00', lineTotal: '145.00' }),
        item({ name: 'Sausage', categoryName: 'Italian pizza', categoryOrder: 2, variantName: 'L', unitPrice: '210.00', lineTotal: '210.00' }),
        item({ name: 'Margherita', categoryName: 'Italian pizza', categoryOrder: 2, unitPrice: '105.00', lineTotal: '105.00' }),
      ],
    }));
    expect(message.indexOf('*Italian pizza*')).toBeLessThan(message.indexOf('*Oriental pizza*'));
    expect(message).toContain('* 1 × *Sausage* (L) = 210 EGP');
    expect(message).toContain('* 1 × *Margherita* = 105 EGP');
    expect(message).toContain('* 1 × *Sausage* (M) = 145 EGP');
    expect(message).not.toContain('Category:');
  });

  it('keeps extras directly under their cart line, with free/negative options and per-piece note', () => {
    const message = buildWhatsappMessage(quote({
      items: [
        item({ quantity: 2, lineTotal: '210.00', modifiers: [
          { groupName: 'Sauce', optionName: 'Ranch', priceAdjustment: '0.00' },
          { groupName: 'Extras', optionName: 'Cheese', priceAdjustment: '50.00' },
          { groupName: 'Extras', optionName: 'Skip bun', priceAdjustment: '-5.00' },
        ] }),
        item({ lineTotal: '70.50', modifiers: [
          { groupName: 'Extras', optionName: 'Bacon', priceAdjustment: '10.50' },
        ] }),
      ], subtotal: '280.50', total: '305.50',
    }));
    expect(message).toContain(
      '* 2 × *Burger* = 120 EGP\n' +
      '↳ Extras: Sauce: Ranch × 2, Cheese × 2 (+100 EGP), Skip bun × 2 (-10 EGP)\n' +
      '* 1 × *Burger* = 60 EGP\n' +
      '↳ Extras: Bacon (+10.50 EGP)',
    );
  });

  it('renders pickup, fractional discount and optional fields without delivery noise', () => {
    const message = buildWhatsappMessage(quote({
      orderType: 'PICKUP', deliveryZoneName: null, deliveryAddress: null,
      deliveryBuilding: null, deliveryFloor: null, deliveryApartment: null,
      deliveryLandmark: null, deliveryFee: '0.00', discountTotal: '12.50',
      items: [item({ unitPrice: '160.00', lineTotal: '147.50', discountAmount: '12.50' })],
      subtotal: '147.50', total: '147.50',
    }));
    expect(message).toContain('Pickup | Branch Zamalek');
    expect(message).toContain('Items: 160 EGP');
    expect(message).toContain('Discount: -12.50 EGP');
    expect(message).toContain('*Total: 147.50 EGP*');
    expect(message).not.toContain('Delivery fee:');
    expect(message).not.toContain('Area ');
    expect(message).not.toContain('Address: ');
  });

  it('uses Arabic labels and currency; groups modifiers under the priced product', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', restaurantName: 'مطعم الشربيني',
      branchName: 'وسط البلد', deliveryZoneName: 'الدقي',
      items: [
        item({ name: 'بيتزا سجق', categoryName: 'البيتزا', categoryOrder: 2,
          variantName: 'كبير', quantity: 2, unitPrice: '160.00', lineTotal: '380.00', modifiers: [
            { groupName: 'إضافات', optionName: 'جبنة', priceAdjustment: '20.00' },
            { groupName: 'إضافات', optionName: 'رانش', priceAdjustment: '10.00' },
          ] }),
        item({ name: 'مشلتت', categoryName: 'الفطير الحلو', categoryOrder: 1, unitPrice: '210.00', lineTotal: '210.00' }),
      ],
      subtotal: '590.00', deliveryFee: '25.00', total: '615.00',
    }));
    expect(message.split('\n')[0]).toBe('\u200F*طلب جديد*');
    expect(message).toContain('\u200Fتوصيل | فرع وسط البلد | منطقة الدقي');
    expect(message.indexOf('*الفطير الحلو*')).toBeLessThan(message.indexOf('*البيتزا*'));
    expect(message).toContain(
      '\u200F* 2 × *بيتزا سجق* (كبير) = 320 ج.م\n' +
      '\u200F↳ إضافات: جبنة × 2 (+40 ج.م)، رانش × 2 (+20 ج.م)',
    );
    expect(message).toContain('\u200Fالتوصيل: 25 ج.م');
    expect(message).toContain('*الإجمالي: 615 ج.م*');
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
      '*New order*\nPickup\n\n* 1 × *Burger* = 60 EGP\n*Total: 60 EGP*',
    );
  });

  it('neutralizes WhatsApp markup and excess whitespace in guest text', () => {
    expect(plain('*FREE* _food_ ~x~')).toBe('FREE food x');
    const message = buildWhatsappMessage(quote({
      customerNotes: '*URGENT*\n\n\nplease', customerName: '_Mona_',
    }));
    expect(message).toContain('Order notes: URGENT please');
    expect(message).toContain('Customer: Mona | Phone: 01012345678');
  });

  it('lists offers first, with choices and gifts immediately below each offer', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', deliveryZoneName: null, orderType: 'PICKUP',
      items: [
        item({ name: 'كبدة إسكندراني', categoryName: 'السندوتشات', unitPrice: '45.00', lineTotal: '45.00' }),
        item({ kind: 'OFFER', name: 'وجبة الفطار', categoryName: '', categoryOrder: -1,
          unitPrice: '40.00', quantity: 2, lineTotal: '100.00', offerSlots: [
            { title: 'اختار الساندويتش', included: false,
              choices: [{ name: 'كبدة', quantity: 1, priceAdjustment: '10.00' }] },
            { title: 'هدية العرض', included: true,
              choices: [{ name: 'بطاطس هدية', quantity: 1, priceAdjustment: '0.00' }] },
          ] }),
        item({ kind: 'OFFER', name: 'بوكس العيلة', categoryName: '', categoryOrder: -1,
          unitPrice: '115.00', lineTotal: '120.00', offerSlots: [
            { title: 'اختار ٣ ساندويتشات', included: false, choices: [
              { name: 'طعمية', quantity: 2, priceAdjustment: '0.00' },
              { name: 'جبنة رومي', quantity: 1, priceAdjustment: '5.00' },
            ] },
          ] }),
      ],
      subtotal: '265.00', total: '265.00', deliveryFee: '0.00',
    }));
    expect(message.indexOf('*العروض*')).toBeLessThan(message.indexOf('*السندوتشات*'));
    expect(message).toContain(
      '\u200F* 2 × *وجبة الفطار* = 80 ج.م\n' +
      '\u200F↳ اختار الساندويتش: 2× كبدة (+20 ج.م)\n' +
      '\u200F↳ هدية العرض: 2× بطاطس هدية',
    );
    expect(message).toContain(
      '\u200F* 1 × *بوكس العيلة* = 115 ج.م\n' +
      '\u200F↳ اختار ٣ ساندويتشات: 2× طعمية، جبنة رومي (+5 ج.م)',
    );
    expect(message).toContain('\u200F* 1 × *كبدة إسكندراني* = 45 ج.م');
  });


  it('keeps extras on the item only and the 735 + 25 = 760 summary without double counting', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar',
      branchName: 'وسط البلد',
      deliveryZoneName: 'الدقي',
      items: [
        item({ name: 'بيتزا فراخ', categoryName: 'البيتزا', categoryOrder: 1,
          variantName: 'وسط', unitPrice: '210.00', lineTotal: '245.00',
          modifiers: [
            { groupName: 'الإضافات', optionName: 'جبنة', priceAdjustment: '20.00' },
            { groupName: 'الإضافات', optionName: 'صوص رانش', priceAdjustment: '15.00' },
          ],
        }),
        item({ name: 'شرقي فراخ باربكيو', categoryName: 'الفطير الشرقي',
          categoryOrder: 2, variantName: 'وسط', unitPrice: '230.00', lineTotal: '230.00' }),
        item({ name: 'اسكندراني ميكس فراخ', categoryName: 'الفطير الشرقي',
          categoryOrder: 2, variantName: 'وسط', unitPrice: '260.00', lineTotal: '260.00' }),
      ],
      subtotal: '735.00', discountTotal: '0.00',
      deliveryFee: '25.00', total: '760.00',
    }));
    expect(message).toContain(
      '\u200F* 1 × *بيتزا فراخ* (وسط) = 210 ج.م\n' +
      '\u200F↳ الإضافات: جبنة (+20 ج.م)، صوص رانش (+15 ج.م)',
    );
    expect(message).toContain('\u200F* 1 × *شرقي فراخ باربكيو* (وسط) = 230 ج.م');
    expect(message).toContain('\u200F* 1 × *اسكندراني ميكس فراخ* (وسط) = 260 ج.م');
    expect(message).toContain('\u200Fالأصناف: 735 ج.م\n\u200Fالتوصيل: 25 ج.م\n\u200F*الإجمالي: 760 ج.م*');
    expect(message).not.toContain('الإضافات: 35 ج.م\nالتوصيل:');
    expect(message).not.toMatch(/^\d+\)/m);
  });

  it('handles fractional and negative per-unit modifiers on multiple quantities with a correct discounted summary', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar',
      items: [item({
        quantity: 3, unitPrice: '80.25', discountAmount: '30.15', lineTotal: '209.10',
        modifiers: [
          { groupName: 'الإضافات', optionName: 'صوص', priceAdjustment: '0.75' },
          { groupName: 'الإضافات', optionName: 'بدون عيش', priceAdjustment: '-1.25' },
        ],
      })],
      subtotal: '209.10', discountTotal: '30.15',
      deliveryFee: '5.20', total: '214.30',
    }));
    expect(message).toContain(
      '\u200F* 3 × *Burger* = 240.75 ج.م\n' +
      '\u200F↳ الإضافات: صوص × 3 (+2.25 ج.م)، بدون عيش × 3 (-3.75 ج.م)',
    );
    expect(message).toContain(
      '\u200Fالأصناف: 239.25 ج.م\n\u200Fالخصم: -30.15 ج.م\n\u200Fالتوصيل: 5.20 ج.م\n\u200F*الإجمالي: 214.30 ج.م*',
    );
  });

  it('keeps Arabic pickup icon-free, right-anchored, and without delivery-only details', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', orderType: 'PICKUP', branchName: 'القاهرة',
      deliveryZoneName: null, deliveryAddress: null, deliveryBuilding: null,
      deliveryFloor: null, deliveryApartment: null, deliveryLandmark: null,
      customerNotes: null, discountTotal: '0.00',
      items: [item({
        name: 'فطير إسكندراني فراخ', categoryName: 'فطير إسكندراني',
        variantName: 'وسط', quantity: 1, unitPrice: '250.00', lineTotal: '250.00',
      })],
      subtotal: '250.00', deliveryFee: '0.00', total: '250.00',
    }));
    expect(message).toBe([
      '\u200F*طلب جديد*',
      '\u200Fاستلام | فرع القاهرة',
      '',
      '\u200F*فطير إسكندراني*',
      '\u200F* 1 × *فطير إسكندراني فراخ* (وسط) = 250 ج.م',
      '',
      '\u200Fالعميل: Mona Hassan | الهاتف: 01012345678',
      '\u200F*الإجمالي: 250 ج.م*',
    ].join('\n'));
    expect(message).not.toContain('التوصيل:');
    expect(message).not.toContain('العنوان:');
  });

  it('keeps delivery breakdown, modifier relationship and Arabic lines anchored right', () => {
    const message = buildWhatsappMessage(quote({
      defaultLocale: 'ar', branchName: 'القاهرة', deliveryZoneName: 'مكرم عبيد',
      items: [item({
        name: 'بيتزا فراخ', categoryName: 'بيتزا', categoryOrder: 1,
        variantName: 'وسط', quantity: 1, unitPrice: '210.00', lineTotal: '245.00',
        modifiers: [
          { groupName: 'الإضافات', optionName: 'جبنة', priceAdjustment: '20.00' },
          { groupName: 'الإضافات', optionName: 'صوص رانش', priceAdjustment: '15.00' },
        ],
      })],
      subtotal: '245.00', discountTotal: '0.00', deliveryFee: '25.00', total: '270.00',
      customerName: 'أحمد محمد', deliveryAddress: 'مدينة نصر، شارع مصطفى النحاس',
      customerNotes: 'الاتصال قبل الوصول',
    }));
    const lines = message.split('\n');
    expect(lines.every((line) => line === '' || line.startsWith('\u200F'))).toBe(true);
    expect(message).toContain(
      '\u200F* 1 × *بيتزا فراخ* (وسط) = 210 ج.م\n' +
      '\u200F↳ الإضافات: جبنة (+20 ج.م)، صوص رانش (+15 ج.م)',
    );
    expect(message).toContain('\u200Fالعميل: أحمد محمد | الهاتف: 01012345678');
    expect(message).toContain('\u200Fالعنوان: مدينة نصر، شارع مصطفى النحاس');
    expect(message).toContain('\u200Fملاحظات الطلب: الاتصال قبل الوصول');
    expect(message).toContain(
      '\u200Fالأصناف: 245 ج.م\n' +
      '\u200Fالتوصيل: 25 ج.م\n' +
      '\u200F*الإجمالي: 270 ج.م*',
    );
    expect(message).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(message).not.toContain('🎁');
  });

  it('strips guest-supplied direction overrides without removing customer wording', () => {
    expect(plain('\u202Eأحمد\u202C \u2066محمد\u2069')).toBe('أحمد محمد');
    expect(plain('\u200FHello\u200E')).toBe('Hello');
  });

  it('preserves signed Arabic references and rejects tampering with an RTL line', () => {
    const arabic = quote({
      defaultLocale: 'ar', orderType: 'PICKUP', deliveryZoneName: null,
      deliveryFee: '0.00', subtotal: '190.00', total: '190.00',
    });
    const baseMessage = buildWhatsappMessage(arabic);
    const key = Buffer.alloc(32, 23);
    const now = Date.UTC(2026, 10, 11, 10, 0, 0);
    const signed = issueWhatsappReference({
      restaurantId: arabic.restaurantId, branchId: arabic.branchId,
      orderType: 'PICKUP', total: arabic.total, currencyCode: arabic.currencyCode,
      baseMessage, key, now,
    });
    expect(signed.message).toMatch(/\n\nWayta-Ref: WT1\.[^\s]+$/);
    expect(signed.message.split('\n').at(-1)).toBe('Wayta-Ref: ' + signed.reference);
    expect(signed.message.split('\n').at(-1)?.startsWith('\u200F')).toBe(false);
    expect(verifyWhatsappReference({
      restaurantId: arabic.restaurantId, receivedMessage: signed.message, key, now,
    })?.total).toBe('190.00');
    expect(verifyWhatsappReference({
      restaurantId: arabic.restaurantId,
      receivedMessage: signed.message.replace('120 ج.م', '121 ج.م'), key, now,
    })).toBeNull();
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
      receivedMessage: signed.message.replace('120 EGP', '121 EGP'), key, now,
    })).toBeNull();
  });

  it('still builds a valid, encoded wa.me link', () => {
    expect(buildWhatsappUrl('+20 101 234 5678', 'Hi & bye\nline 2'))
      .toBe('https://wa.me/201012345678?text=Hi%20%26%20bye%0Aline%202');
  });
});
