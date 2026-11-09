import type { OrderQuote } from './public-orders.service';

/**
 * Compact WhatsApp order message (DEC-042): based only on the Backend-priced
 * OrderQuote, never on Guest-calculated prices. Keep categories in menu order
 * (to distinguish duplicate product names) and every modifier directly below
 * its product. The optional signed Wayta-Ref footer is added later by
 * WhatsappTrackingService.prepare; never append or modify it here.
 */

export type MessageLanguage = 'ar' | 'en';

const LABELS: Record<
  MessageLanguage,
  {
    newOrder: string;
    offers: string;
    delivery: string;
    pickup: string;
    branch: string;
    area: string;
    subtotal: string;
    discount: string;
    deliveryFee: string;
    total: string;
    building: string;
    floor: string;
    apartment: string;
    landmark: string;
    extras: string;
    perItem: string;
    notes: string;
  }
> = {
  en: {
    newOrder: 'New order',
    offers: 'Offers',
    delivery: 'Delivery',
    pickup: 'Pickup',
    branch: 'Branch',
    area: 'Area',
    subtotal: 'Items',
    discount: 'Discount',
    deliveryFee: 'Delivery fee',
    total: 'Total',
    building: 'Building',
    floor: 'Floor',
    apartment: 'Apartment',
    landmark: 'Landmark',
    extras: 'Extras',
    perItem: 'per item',
    notes: 'Order notes',
  },
  ar: {
    newOrder: 'طلب جديد',
    offers: 'العروض',
    delivery: 'توصيل',
    pickup: 'استلام',
    branch: 'فرع',
    area: 'منطقة',
    subtotal: 'الأصناف',
    discount: 'الخصم',
    deliveryFee: 'التوصيل',
    total: 'الإجمالي',
    building: 'المبنى',
    floor: 'الدور',
    apartment: 'الشقة',
    landmark: 'علامة مميزة',
    extras: 'إضافات',
    perItem: 'لكل قطعة',
    notes: 'ملاحظات الطلب',
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
  ar: { EGP: 'ج', SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', USD: '$' },
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

export function buildWhatsappMessage(quote: OrderQuote): string {
  const language = messageLanguage(quote.defaultLocale);
  const t = LABELS[language];
  const cost = (amount: string): string =>
    money(amount, quote.currencyCode, language);
  const separator = language === 'ar' ? '، ' : ', ';
  const lines: string[] = ['🧾 *' + t.newOrder + '*'];

  const orderType =
    quote.orderType === 'DELIVERY' ? '🛵 ' + t.delivery : '🛍️ ' + t.pickup;
  const context = [
    quote.branchName ? t.branch + ' ' + plain(quote.branchName) : null,
    quote.orderType === 'DELIVERY' && quote.deliveryZoneName
      ? t.area + ' ' + plain(quote.deliveryZoneName)
      : null,
  ].filter((part): part is string => part !== null);
  lines.push(orderType + (context.length ? ' | ' + context.join(' | ') : ''));

  // Offers are first; product categories remain in menu order to distinguish
  // otherwise identical product names. No icons or lengthy category labels.
  const offerItems = quote.items.filter((item) => item.kind === 'OFFER');
  const groups: {
    key: string;
    name: string;
    order: number;
    items: OrderQuote['items'];
  }[] = [];
  for (const item of quote.items) {
    if (item.kind === 'OFFER') continue;
    const key = item.categoryOrder + '|' + item.categoryName;
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
  const itemLine = (item: OrderQuote['items'][number]): string => {
    number += 1;
    const variant = item.variantName ? ' (' + plain(item.variantName) + ')' : '';
    return (
      number + ') *' + plain(item.name) + variant + ' × ' +
      item.quantity + ' — ' + cost(item.lineTotal) + '*'
    );
  };

  if (offerItems.length) {
    lines.push('', '*' + t.offers + '*');
    for (const item of offerItems) {
      lines.push(itemLine(item));
      for (const slot of item.offerSlots ?? []) {
        const picked = slot.choices.map(
          (choice) =>
            (choice.quantity > 1 ? choice.quantity + '× ' : '') +
            plain(choice.name) + extraPrice(choice.priceAdjustment),
        );
        if (picked.length)
          lines.push(
            '↳ ' + (slot.included ? '🎁 ' : '') +
            plain(slot.title) + ': ' + picked.join(separator),
          );
      }
    }
  }

  for (const group of groups) {
    lines.push('');
    if (group.name) lines.push('*' + plain(group.name) + '*');
    for (const item of group.items) {
      lines.push(itemLine(item));

      // Modifiers follow the *specific cart line* immediately, even when the
      // same product is ordered with different extras or in other categories.
      const byGroup = new Map<string, string[]>();
      for (const modifier of item.modifiers) {
        const label = plain(modifier.groupName) || t.extras;
        const list = byGroup.get(label) ?? [];
        list.push(
          plain(modifier.optionName) + extraPrice(modifier.priceAdjustment),
        );
        byGroup.set(label, list);
      }
      for (const [label, options] of byGroup) {
        lines.push(
          '↳ ' + label + ': ' + options.join(separator) +
          (item.quantity > 1 ? ' ' + t.perItem : ''),
        );
      }
    }
  }

  const details: string[] = [];
  if (quote.customerName || quote.customerPhone) {
    details.push(
      [
        quote.customerName ? '👤 ' + plain(quote.customerName) : null,
        quote.customerPhone ? '📞 ' + plain(quote.customerPhone) : null,
      ]
        .filter((part): part is string => part !== null)
        .join(' | '),
    );
  }
  const address = [
    quote.deliveryAddress ? plain(quote.deliveryAddress) : null,
    quote.deliveryBuilding
      ? t.building + ' ' + plain(quote.deliveryBuilding)
      : null,
    quote.deliveryFloor ? t.floor + ' ' + plain(quote.deliveryFloor) : null,
    quote.deliveryApartment
      ? t.apartment + ' ' + plain(quote.deliveryApartment)
      : null,
    quote.deliveryLandmark
      ? t.landmark + ' ' + plain(quote.deliveryLandmark)
      : null,
  ].filter((part): part is string => part !== null);
  if (address.length) details.push('📍 ' + address.join(separator));
  // The current quote only contains ORDER-level notes, not item-specific notes.
  // Do not attribute these notes to an arbitrary product.
  if (quote.customerNotes)
    details.push('📝 ' + t.notes + ': ' + plain(quote.customerNotes));
  if (details.length) lines.push('', ...details);

  const hasBreakdown =
    quote.deliveryFee !== '0.00' || quote.discountTotal !== '0.00';
  if (hasBreakdown) {
    lines.push(t.subtotal + ': ' + cost(quote.subtotal));
    if (quote.discountTotal !== '0.00')
      lines.push(t.discount + ': -' + cost(quote.discountTotal));
    if (quote.deliveryFee !== '0.00')
      lines.push(t.deliveryFee + ': ' + cost(quote.deliveryFee));
  }
  lines.push('💰 *' + t.total + ': ' + cost(quote.total) + '*');

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The `wa.me` link that opens WhatsApp on the Restaurant's number with the message ready to send. */
export function buildWhatsappUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
