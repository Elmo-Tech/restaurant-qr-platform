import type { OrderQuote } from './public-orders.service';

/**
 * The WhatsApp order message (DEC-042, slice 7): built ONLY from the Backend's own priced
 * order (`OrderQuote`), never from anything the Guest's device calculated. It is written for
 * the Restaurant to read, so labels, product, Category, size and extra names are in the
 * Restaurant's default language; the Guest's own free text (name, address, notes) is quoted as typed.
 * WhatsApp's own markup is used: *bold* for the headline, the Category, each product and the total.
 *
 * Layout (the owner approved it): a headline that says the order came from the digital menu; the
 * order type and branch; the products GROUPED BY CATEGORY (in menu order, a divider between groups)
 * so two products with the same name in two Categories are never confused; each product with its
 * size and its extras (one line per extras group, each extra with its own price) and the line
 * price; then the customer, the totals and a closing line.
 */

export type MessageLanguage = 'ar' | 'en';

const LABELS: Record<
  MessageLanguage,
  {
    newOrder: string;
    sentFromMenu: string;
    category: string;
    size: string;
    price: string;
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
  }
> = {
  en: {
    newOrder: 'New order from the digital menu',
    sentFromMenu: 'Sent from the digital menu',
    category: 'Category',
    size: 'Size',
    price: 'Price',
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
  },
  ar: {
    newOrder: 'طلب جديد من المنيو الإلكتروني',
    sentFromMenu: 'تم إرسال الطلب من المنيو الإلكتروني',
    category: 'القسم',
    size: 'المقاس',
    price: 'السعر',
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

/** How the Restaurant's own language writes a currency; any other code is shown as it is. */
const CURRENCY_SYMBOLS: Record<MessageLanguage, Record<string, string>> = {
  ar: { EGP: 'ج.م', SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', USD: '$' },
  en: {},
};

function amountText(amount: string): string {
  const whole = /^(-?\d+)\.00$/.exec(amount);
  return whole ? whole[1] : amount;
}

function money(
  amount: string,
  currency: string,
  language: MessageLanguage,
): string {
  return `${amountText(amount)} ${CURRENCY_SYMBOLS[language][currency] ?? currency}`;
}

/** An extra's own price: " (+50)" for a paid one, " (-5)" for a reduction, nothing for a free one. */
function extraPrice(amount: string): string {
  if (/^-?0+(\.0+)?$/.test(amount)) return '';
  return amount.startsWith('-')
    ? ` (${amountText(amount)})`
    : ` (+${amountText(amount)})`;
}

const DIVIDER = '━━━━━━━━━━';

export function buildWhatsappMessage(quote: OrderQuote): string {
  const language = messageLanguage(quote.defaultLocale);
  const t = LABELS[language];
  const cost = (amount: string): string =>
    money(amount, quote.currencyCode, language);
  const lines: string[] = [];

  lines.push(`🧾 *${t.newOrder}*`);
  lines.push(`🏪 ${plain(quote.restaurantName)}`);
  const orderType =
    quote.orderType === 'DELIVERY' ? `🛵 ${t.delivery}` : `🛍️ ${t.pickup}`;
  lines.push(
    quote.deliveryZoneName
      ? `${orderType} — ${t.area}: ${plain(quote.deliveryZoneName)}`
      : orderType,
  );
  if (quote.branchName)
    lines.push(`📍 ${t.branch}: ${plain(quote.branchName)}`);

  // Products grouped by Category in menu order; inside a group, the order the Guest added them.
  const groups: {
    key: string;
    name: string;
    order: number;
    items: OrderQuote['items'];
  }[] = [];
  for (const item of quote.items) {
    const key = `${item.categoryOrder}|${item.categoryName}`;
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = {
        key,
        name: item.categoryName,
        order: item.categoryOrder,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }
  groups.sort((a, b) => a.order - b.order);

  let number = 0;
  for (const group of groups) {
    lines.push(DIVIDER);
    if (group.name) lines.push(`🗂️ *${t.category}: ${plain(group.name)}*`);
    for (const item of group.items) {
      number += 1;
      lines.push('');
      lines.push(`*${number}) ${plain(item.name)}* × ${item.quantity}`);
      if (item.variantName)
        lines.push(`📏 ${t.size}: ${plain(item.variantName)}`);
      // One line per extras group, each extra with its own price.
      const byGroup = new Map<string, string[]>();
      for (const modifier of item.modifiers) {
        const label = plain(modifier.groupName);
        const list = byGroup.get(label) ?? [];
        list.push(
          `${plain(modifier.optionName)}${extraPrice(modifier.priceAdjustment)}`,
        );
        byGroup.set(label, list);
      }
      for (const [label, options] of byGroup)
        lines.push(`➕ ${label}: ${options.join(' · ')}`);
      lines.push(`💰 ${t.price}: ${cost(item.lineTotal)}`);
    }
  }
  lines.push(DIVIDER);

  const details: string[] = [];
  if (quote.customerName)
    details.push(`👤 ${t.customer}: ${plain(quote.customerName)}`);
  if (quote.customerPhone)
    details.push(`📞 ${t.phone}: ${plain(quote.customerPhone)}`);
  if (quote.deliveryAddress)
    details.push(`🏠 ${t.address}: ${plain(quote.deliveryAddress)}`);
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
  if (place.length > 0) details.push(`   ${place.join(' · ')}`);
  if (quote.customerNotes)
    details.push(`📝 ${t.notes}: ${plain(quote.customerNotes)}`);
  if (details.length > 0) {
    lines.push(...details);
    lines.push(DIVIDER);
  }

  const hasBreakdown =
    quote.deliveryFee !== '0.00' || quote.discountTotal !== '0.00';
  if (hasBreakdown) {
    lines.push(`${t.subtotal}: ${cost(quote.subtotal)}`);
    if (quote.discountTotal !== '0.00')
      lines.push(`${t.discount}: -${cost(quote.discountTotal)}`);
    if (quote.deliveryFee !== '0.00')
      lines.push(`${t.deliveryFee}: ${cost(quote.deliveryFee)}`);
  }
  lines.push(`💰 *${t.total}: ${cost(quote.total)}*`);
  lines.push('');
  lines.push(`📲 ${t.sentFromMenu}`);

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The `wa.me` link that opens WhatsApp on the Restaurant's number with the message ready to send. */
export function buildWhatsappUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
