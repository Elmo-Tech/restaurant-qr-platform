import type { OrderQuote } from './public-orders.service';
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
  it('says it comes from the digital menu and lists the order, the money from the quote, and the customer', () => {
    const message = buildWhatsappMessage(quote());
    expect(message.split('\n')[0]).toBe('🧾 *New order from the digital menu*');
    expect(message).toContain('🏪 Elmo Cafe');
    expect(message).toContain('🛵 Delivery — Delivery area: Zone A');
    expect(message).toContain('📍 Branch: Zamalek');
    expect(message).toContain('*1) Burger* × 2');
    expect(message).toContain('📏 Size: Large');
    expect(message).toContain('➕ Extras: Cheese (+10) · Bacon (+15)');
    expect(message).toContain('💰 Price: 170 EGP');
    expect(message).toContain('*2) Cola* × 1');
    expect(message).toContain('Items: 190 EGP');
    expect(message).toContain('Delivery fee: 25 EGP');
    expect(message).toContain('💰 *Total: 215 EGP*');
    expect(message).toContain('👤 Name: Mona Hassan');
    expect(message).toContain('📞 Phone: 01012345678');
    expect(message).toContain('🏠 Address: 1 Nile St');
    expect(message).toContain(
      'Building: 12 · Floor: 3 · Apartment: 8 · Landmark: Next to the pharmacy',
    );
    expect(message).toContain('📝 Notes: No onions');
    expect(message.endsWith('📲 Sent from the digital menu')).toBe(true);
  });

  it('groups the products by Category in menu order, with a divider between groups, so equal names stay apart', () => {
    // the same name in two Categories, added in the "wrong" order, plus a third Category
    const message = buildWhatsappMessage(
      quote({
        items: [
          item({
            name: 'Sausage',
            categoryName: 'Oriental pizza',
            categoryOrder: 5,
            variantName: 'M',
            lineTotal: '145.00',
          }),
          item({
            name: 'Sausage',
            categoryName: 'Italian pizza',
            categoryOrder: 2,
            variantName: 'L',
            lineTotal: '210.00',
          }),
          item({
            name: 'Marguerita',
            categoryName: 'Italian pizza',
            categoryOrder: 2,
            variantName: 'M',
            lineTotal: '105.00',
          }),
        ],
      }),
    );
    const italian = message.indexOf('🗂️ *Category: Italian pizza*');
    const oriental = message.indexOf('🗂️ *Category: Oriental pizza*');
    expect(italian).toBeGreaterThan(-1);
    expect(oriental).toBeGreaterThan(italian);
    // numbering runs across the groups, in the printed order
    expect(message).toContain('*1) Sausage* × 1\n📏 Size: L');
    expect(message).toContain('*2) Marguerita* × 1');
    expect(message).toContain('*3) Sausage* × 1\n📏 Size: M');
    // one divider before each Category group
    const between = message.slice(italian, oriental);
    expect(between).toContain('━━━━━━━━━━');
    expect(message.slice(0, italian).trimEnd().endsWith('━━━━━━━━━━')).toBe(
      true,
    );
  });

  it('writes a clear extras line per extras group, with the price of each extra and none for a free one', () => {
    const message = buildWhatsappMessage(
      quote({
        items: [
          item({
            variantName: 'L',
            modifiers: [
              {
                groupName: 'Sauce',
                optionName: 'Ranch',
                priceAdjustment: '0.00',
              },
              {
                groupName: 'Add-ons',
                optionName: 'Cheese',
                priceAdjustment: '50.00',
              },
              {
                groupName: 'Add-ons',
                optionName: 'Sauces',
                priceAdjustment: '30.50',
              },
              {
                groupName: 'Add-ons',
                optionName: 'Skip bun',
                priceAdjustment: '-5.00',
              },
            ],
            lineTotal: '300.50',
          }),
        ],
      }),
    );
    expect(message).toContain('➕ Sauce: Ranch\n');
    expect(message).toContain(
      '➕ Add-ons: Cheese (+50) · Sauces (+30.50) · Skip bun (-5)',
    );
  });

  it('keeps cents and shows a discount; pickup has no address or fee lines', () => {
    const message = buildWhatsappMessage(
      quote({
        orderType: 'PICKUP',
        deliveryZoneName: null,
        deliveryAddress: null,
        deliveryBuilding: null,
        deliveryFloor: null,
        deliveryApartment: null,
        deliveryLandmark: null,
        deliveryFee: '0.00',
        discountTotal: '12.50',
        subtotal: '147.50',
        total: '147.50',
      }),
    );
    expect(message).toContain('🛍️ Pickup');
    expect(message).not.toContain('Delivery area');
    expect(message).toContain('Discount: -12.50 EGP');
    expect(message).toContain('💰 *Total: 147.50 EGP*');
    expect(message).not.toContain('Delivery fee');
    expect(message).not.toContain('Address');
  });

  it('writes the whole message in Arabic, with the Arabic currency, for an Arabic Restaurant', () => {
    const message = buildWhatsappMessage(
      quote({
        defaultLocale: 'ar',
        restaurantName: 'مطعم الشربيني',
        deliveryZoneName: 'وسط البلد',
        items: [
          item({
            name: 'سجق بلدي',
            categoryName: 'البيتزا الإيطالي',
            categoryOrder: 2,
            variantName: 'L',
            quantity: 2,
            modifiers: [
              {
                groupName: 'الإضافات',
                optionName: 'جبنة',
                priceAdjustment: '50.00',
              },
              {
                groupName: 'الإضافات',
                optionName: 'صوصات',
                priceAdjustment: '30.00',
              },
            ],
            lineTotal: '580.00',
          }),
          item({
            name: 'سجق بلدي',
            categoryName: 'فطير أو بيتزا شرقي',
            categoryOrder: 3,
            variantName: 'M',
            lineTotal: '145.00',
          }),
          item({
            name: 'مشلتت',
            categoryName: 'الفطير الحلو',
            categoryOrder: 1,
            lineTotal: '210.00',
          }),
        ],
        subtotal: '935.00',
        deliveryFee: '20.00',
        total: '955.00',
      }),
    );
    expect(message).toContain('🧾 *طلب جديد من المنيو الإلكتروني*');
    expect(message).toContain('🏪 مطعم الشربيني');
    expect(message).toContain('🛵 توصيل — منطقة التوصيل: وسط البلد');
    expect(message).toContain('🗂️ *القسم: البيتزا الإيطالي*');
    expect(message).toContain('*2) سجق بلدي* × 2');
    expect(message).toContain('📏 المقاس: L');
    expect(message).toContain('➕ الإضافات: جبنة (+50) · صوصات (+30)');
    expect(message).toContain('💰 السعر: 580 ج.م');
    expect(message).toContain('رسوم التوصيل: 20 ج.م');
    expect(message).toContain('💰 *الإجمالي: 955 ج.م*');
    expect(message.endsWith('📲 تم إرسال الطلب من المنيو الإلكتروني')).toBe(
      true,
    );
    // the sweet category was first in the menu, so it comes first
    expect(message.indexOf('الفطير الحلو')).toBeLessThan(
      message.indexOf('البيتزا الإيطالي'),
    );
    expect(messageLanguage('ar-EG')).toBe('ar');
    expect(messageLanguage('fr')).toBe('en');
  });

  it('leaves out what is not there: no Category heading, size, extras, customer block or fee', () => {
    const message = buildWhatsappMessage(
      quote({
        orderType: 'PICKUP',
        deliveryZoneName: null,
        deliveryFee: '0.00',
        items: [item({ categoryName: '' })],
        subtotal: '60.00',
        total: '60.00',
        customerName: null,
        customerPhone: null,
        customerNotes: null,
        deliveryAddress: null,
        deliveryBuilding: null,
        deliveryFloor: null,
        deliveryApartment: null,
        deliveryLandmark: null,
      }),
    );
    expect(message).not.toContain('🗂️');
    expect(message).not.toContain('📏');
    expect(message).not.toContain('➕');
    expect(message).not.toContain('👤');
    expect(message).not.toContain('Items:');
    expect(message).toContain('*1) Burger* × 1');
    expect(message).toContain('💰 *Total: 60 EGP*');
  });

  it('cannot be restyled by what the Guest typed', () => {
    expect(plain('*FREE* _food_ ~x~ `code`')).toBe('FREE food x code');
    const message = buildWhatsappMessage(
      quote({ customerNotes: '*URGENT*\n\n\nplease', customerName: '_Mona_' }),
    );
    expect(message).toContain('📝 Notes: URGENT please');
    expect(message).toContain('👤 Name: Mona');
  });

  it('lists the Offers first as their own group: ✅ for each chosen slot, 🎁 for the included gift (Arabic)', () => {
    const message = buildWhatsappMessage(
      quote({
        defaultLocale: 'ar',
        deliveryZoneName: null,
        orderType: 'PICKUP',
        items: [
          item({ name: 'كبدة إسكندراني', categoryName: 'السندوتشات', lineTotal: '45.00' }),
          item({
            kind: 'OFFER',
            name: 'وجبة الفطار',
            categoryName: '',
            categoryOrder: -1,
            quantity: 2,
            lineTotal: '90.00',
            offerSlots: [
              {
                title: 'اختار الساندويتش',
                included: false,
                choices: [{ name: 'كبدة', quantity: 1, priceAdjustment: '10.00' }],
              },
              {
                title: 'هدية العرض',
                included: true,
                choices: [{ name: 'بطاطس هدية', quantity: 1, priceAdjustment: '0.00' }],
              },
            ],
          }),
          item({
            kind: 'OFFER',
            name: 'بوكس العيلة',
            categoryName: '',
            categoryOrder: -1,
            lineTotal: '120.00',
            offerSlots: [
              {
                title: 'اختار ٣ ساندويتشات',
                included: false,
                choices: [
                  { name: 'طعمية', quantity: 2, priceAdjustment: '0.00' },
                  { name: 'جبنة رومي', quantity: 1, priceAdjustment: '5.00' },
                ],
              },
            ],
          }),
        ],
        subtotal: '255.00',
        total: '255.00',
        deliveryFee: '0.00',
      }),
    );
    const lines = message.split('\n');
    const offersAt = lines.indexOf('🎁 *القسم: العروض*');
    const categoryAt = lines.indexOf('🗂️ *القسم: السندوتشات*');
    expect(offersAt).toBeGreaterThan(-1);
    expect(categoryAt).toBeGreaterThan(offersAt);
    expect(message).toContain('*1) وجبة الفطار* × 2');
    expect(message).toContain('✅ اختار الساندويتش: كبدة (+10)');
    expect(message).toContain('🎁 هدية العرض: بطاطس هدية');
    expect(message).toContain('💰 السعر: 90 ج.م');
    expect(message).toContain('*2) بوكس العيلة* × 1');
    expect(message).toContain('✅ اختار ٣ ساندويتشات: 2× طعمية، جبنة رومي (+5)');
    // numbering continues into the product group
    expect(message).toContain('*3) كبدة إسكندراني* × 1');
  });

  it('builds the wa.me link with digits only and an encoded message', () => {
    const url = buildWhatsappUrl('+20 101 234 5678', 'Hi & bye\nline 2');
    expect(url).toBe(
      'https://wa.me/201012345678?text=Hi%20%26%20bye%0Aline%202',
    );
  });
});
