import type { OrderQuote } from './public-orders.service';
import {
  buildWhatsappMessage,
  buildWhatsappUrl,
  messageLanguage,
  plain,
} from './whatsapp-order-message';

const quote = (overrides: Partial<OrderQuote> = {}): OrderQuote => ({
  restaurantName: 'Elmo Cafe',
  whatsappNumber: '+201012345678',
  defaultLocale: 'en',
  currencyCode: 'EGP',
  orderType: 'DELIVERY',
  branchName: 'Zamalek',
  deliveryZoneName: 'Zone A',
  items: [
    {
      name: 'Burger',
      variantName: 'Large',
      quantity: 2,
      modifiers: ['Cheese', 'Bacon'],
      unitPrice: '60.00',
      discountAmount: '0.00',
      lineTotal: '140.00',
    },
    {
      name: 'Cola',
      variantName: null,
      quantity: 1,
      modifiers: [],
      unitPrice: '20.00',
      discountAmount: '0.00',
      lineTotal: '20.00',
    },
  ],
  subtotal: '160.00',
  discountTotal: '0.00',
  deliveryFee: '25.00',
  total: '185.00',
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
  it('lists the order, the money from the quote, and the customer details', () => {
    const message = buildWhatsappMessage(quote());
    expect(message).toContain('*New order* — Elmo Cafe');
    expect(message).toContain('🛵 Delivery');
    expect(message).toContain('1. 2× Burger — 140 EGP');
    expect(message).toContain('(Large + Cheese + Bacon)');
    expect(message).toContain('2. 1× Cola — 20 EGP');
    expect(message).toContain('Delivery fee: 25 EGP');
    expect(message).toContain('*Total: 185 EGP*');
    expect(message).toContain('👤 Name: Mona Hassan');
    expect(message).toContain('📞 Phone: 01012345678');
    expect(message).toContain('🏠 Address: 1 Nile St');
    expect(message).toContain(
      'Building: 12 · Floor: 3 · Apartment: 8 · Landmark: Next to the pharmacy',
    );
    expect(message).toContain('📝 Notes: No onions');
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
    expect(message).toContain('Discount: -12.50 EGP');
    expect(message).toContain('*Total: 147.50 EGP*');
    expect(message).not.toContain('Delivery fee');
    expect(message).not.toContain('Address');
  });

  it('writes the labels in Arabic for an Arabic Restaurant', () => {
    const message = buildWhatsappMessage(
      quote({ defaultLocale: 'ar', restaurantName: 'مطعمنا' }),
    );
    expect(message).toContain('*طلب جديد* — مطعمنا');
    expect(message).toContain('توصيل');
    expect(message).toContain('*الإجمالي: 185 EGP*');
    expect(messageLanguage('ar-EG')).toBe('ar');
    expect(messageLanguage('fr')).toBe('en');
  });

  it('cannot be restyled by what the Guest typed', () => {
    expect(plain('*FREE* _food_ ~x~ `code`')).toBe('FREE food x code');
    const message = buildWhatsappMessage(
      quote({ customerNotes: '*URGENT*\n\n\nplease', customerName: '_Mona_' }),
    );
    expect(message).toContain('📝 Notes: URGENT please');
    expect(message).toContain('👤 Name: Mona');
  });

  it('builds the wa.me link with digits only and an encoded message', () => {
    const url = buildWhatsappUrl('+20 101 234 5678', 'Hi & bye\nline 2');
    expect(url).toBe(
      'https://wa.me/201012345678?text=Hi%20%26%20bye%0Aline%202',
    );
  });
});
