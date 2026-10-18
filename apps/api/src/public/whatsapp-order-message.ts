import type { OrderQuote } from './public-orders.service';

/**
 * The WhatsApp order message (DEC-042, slice 7): built ONLY from the Backend's own priced
 * order (`OrderQuote`), never from anything the Guest's device calculated. It is written for
 * the Restaurant to read, so labels, product, size and extra names are in the Restaurant's
 * default language; the Guest's own free text (name, address, notes) is quoted as typed.
 * WhatsApp's own markup is used: *bold* for the headline and the total.
 */

export type MessageLanguage = 'ar' | 'en';

const LABELS: Record<
  MessageLanguage,
  {
    newOrder: string;
    delivery: string;
    pickup: string;
    branch: string;
    area: string;
    subtotal: string;
    discount: string;
    deliveryFee: string;
    total: string;
    customer: string;
    phone: string;
    address: string;
    building: string;
    floor: string;
    apartment: string;
    landmark: string;
    notes: string;
    thanks: string;
  }
> = {
  en: {
    newOrder: 'New order',
    delivery: 'Delivery',
    pickup: 'Pickup',
    branch: 'Branch',
    area: 'Delivery area',
    subtotal: 'Items',
    discount: 'Discount',
    deliveryFee: 'Delivery fee',
    total: 'Total',
    customer: 'Name',
    phone: 'Phone',
    address: 'Address',
    building: 'Building',
    floor: 'Floor',
    apartment: 'Apartment',
    landmark: 'Landmark',
    notes: 'Notes',
    thanks: 'Thank you!',
  },
  ar: {
    newOrder: 'طلب جديد',
    delivery: 'توصيل',
    pickup: 'استلام من الفرع',
    branch: 'الفرع',
    area: 'منطقة التوصيل',
    subtotal: 'الأصناف',
    discount: 'الخصم',
    deliveryFee: 'رسوم التوصيل',
    total: 'الإجمالي',
    customer: 'الاسم',
    phone: 'الهاتف',
    address: 'العنوان',
    building: 'المبنى',
    floor: 'الدور',
    apartment: 'الشقة',
    landmark: 'علامة مميزة',
    notes: 'ملاحظات',
    thanks: 'شكرًا لكم!',
  },
};

/** The two-letter language of the Restaurant's default locale; anything else reads as English. */
export function messageLanguage(locale: string): MessageLanguage {
  return locale.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Neutralizes WhatsApp's formatting characters in text the Guest typed, so it cannot restyle the message. */
export function plain(value: string): string {
  return value
    .replace(/[*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function money(amount: string, currency: string): string {
  const whole = /^(-?\d+)\.00$/.exec(amount);
  return `${whole ? whole[1] : amount} ${currency}`;
}

export function buildWhatsappMessage(quote: OrderQuote): string {
  const t = LABELS[messageLanguage(quote.defaultLocale)];
  const lines: string[] = [];

  lines.push(`🧾 *${t.newOrder}* — ${plain(quote.restaurantName)}`);
  lines.push(
    quote.orderType === 'DELIVERY' ? `🛵 ${t.delivery}` : `🛍️ ${t.pickup}`,
  );
  if (quote.branchName)
    lines.push(`📍 ${t.branch}: ${plain(quote.branchName)}`);
  if (quote.deliveryZoneName)
    lines.push(`🗺️ ${t.area}: ${plain(quote.deliveryZoneName)}`);
  lines.push('');

  quote.items.forEach((item, index) => {
    const extras = [item.variantName, ...item.modifiers]
      .filter((part): part is string => !!part)
      .map(plain);
    lines.push(
      `${index + 1}. ${item.quantity}× ${plain(item.name)} — ${money(item.lineTotal, quote.currencyCode)}`,
    );
    if (extras.length > 0) lines.push(`   (${extras.join(' + ')})`);
  });
  lines.push('');

  const hasBreakdown =
    quote.deliveryFee !== '0.00' || quote.discountTotal !== '0.00';
  if (hasBreakdown) {
    lines.push(`${t.subtotal}: ${money(quote.subtotal, quote.currencyCode)}`);
    if (quote.discountTotal !== '0.00')
      lines.push(
        `${t.discount}: -${money(quote.discountTotal, quote.currencyCode)}`,
      );
    if (quote.deliveryFee !== '0.00')
      lines.push(
        `${t.deliveryFee}: ${money(quote.deliveryFee, quote.currencyCode)}`,
      );
  }
  lines.push(`💰 *${t.total}: ${money(quote.total, quote.currencyCode)}*`);
  lines.push('');

  if (quote.customerName)
    lines.push(`👤 ${t.customer}: ${plain(quote.customerName)}`);
  if (quote.customerPhone)
    lines.push(`📞 ${t.phone}: ${plain(quote.customerPhone)}`);
  if (quote.deliveryAddress)
    lines.push(`🏠 ${t.address}: ${plain(quote.deliveryAddress)}`);
  const place = [
    quote.deliveryBuilding
      ? `${t.building}: ${plain(quote.deliveryBuilding)}`
      : null,
    quote.deliveryFloor ? `${t.floor}: ${plain(quote.deliveryFloor)}` : null,
    quote.deliveryApartment
      ? `${t.apartment}: ${plain(quote.deliveryApartment)}`
      : null,
    quote.deliveryLandmark
      ? `${t.landmark}: ${plain(quote.deliveryLandmark)}`
      : null,
  ].filter((part): part is string => part !== null);
  if (place.length > 0) lines.push(`   ${place.join(' · ')}`);
  if (quote.customerNotes)
    lines.push(`📝 ${t.notes}: ${plain(quote.customerNotes)}`);

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The `wa.me` link that opens WhatsApp on the Restaurant's number with the message ready to send. */
export function buildWhatsappUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
