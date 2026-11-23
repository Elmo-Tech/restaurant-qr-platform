import type { OrderQuote } from './public-orders.service';
import { buildWhatsappMessage } from './whatsapp-order-message';

it('shows legacy savings, named promotions, and free delivery without double-counting', () => {
  const product: OrderQuote['items'][number] = {
    kind: 'PRODUCT',
    offerSlots: null,
    name: 'Main',
    categoryName: 'Mains',
    categoryOrder: 0,
    variantName: null,
    quantity: 1,
    modifiers: [],
    unitPrice: '100.00',
    discountAmount: '0.00',
    lineTotal: '100.00',
  };
  const message = buildWhatsappMessage({
    restaurantId: 'test-restaurant',
    branchId: 'test-branch',
    restaurantName: 'Restaurant',
    whatsappNumber: '',
    defaultLocale: 'en',
    currencyCode: 'EGP',
    orderType: 'DELIVERY',
    branchName: 'Test branch',
    deliveryZoneName: 'Test zone',
    items: [
      product,
      { ...product, discountAmount: '20.00', lineTotal: '80.00' },
    ],
    subtotal: '150.00',
    discountTotal: '50.00',
    deliveryFeeOriginal: '30.00',
    deliveryDiscount: '30.00',
    deliveryFee: '0.00',
    total: '150.00',
    promotions: [
      { title: '*Mains*', scope: 'CATEGORY', amount: '30.00' },
      { title: 'Free delivery', scope: 'DELIVERY', amount: '30.00' },
    ],
    customerName: null,
    customerPhone: null,
    customerNotes: null,
    deliveryAddress: null,
    deliveryBuilding: null,
    deliveryFloor: null,
    deliveryApartment: null,
    deliveryLandmark: null,
  });
  expect(message).toContain(
    'Items: 200 EGP\nDiscount: -20 EGP\nMains: -30 EGP',
  );
  expect(message).toContain(
    'Delivery fee: 30 EGP - 30 EGP (Free delivery) = 0 EGP',
  );
  expect(message).toContain('*Total: 150 EGP*');
  expect(message).not.toContain('Discount: -50 EGP');
});
