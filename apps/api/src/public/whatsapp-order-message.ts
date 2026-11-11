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
    customer: string;
    phone: string;
    address: string;
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
    customer: 'Customer',
    phone: 'Phone',
    address: 'Address',
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
    customer: 'العميل',
    phone: 'الهاتف',
    address: 'العنوان',
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
    // Guest-controlled direction overrides must not defeat the message's RTL base.
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gi, '')
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

/**
 * Presentation-only fixed-point math. OrderQuote prices are 2-decimal strings
 * issued by NestJS; never use JS floating-point or recalculate checkout truth.
 */
function amountCents(amount: string): bigint {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(amount);
  if (!match) throw new Error('Invalid priced amount in WhatsApp quote');
  const cents = BigInt(match[2]) * 100n + BigInt(match[3]);
  return match[1] ? -cents : cents;
}

function centsAmount(cents: bigint): string {
  const abs = cents < 0n ? -cents : cents;
  return (cents < 0n ? '-' : '') + (abs / 100n).toString() +
    '.' + (abs % 100n).toString().padStart(2, '0');
}

function extendedAmount(amount: string, quantity: number): string {
  return centsAmount(amountCents(amount) * BigInt(quantity));
}

/** A modifier's own extended price (including the cart quantity), or no price when free. */
function extraPrice(
  amount: string,
  currency: string,
  language: MessageLanguage,
): string {
  const cents = amountCents(amount);
  if (cents === 0n) return '';
  const absolute = centsAmount(cents < 0n ? -cents : cents);
  return ' (' + (cents < 0n ? '-' : '+') + money(absolute, currency, language) + ')';
}

export function buildWhatsappMessage(quote: OrderQuote): string {
  const language = messageLanguage(quote.defaultLocale);
  const t = LABELS[language];
  const cost = (amount: string): string =>
    money(amount, quote.currencyCode, language);
  const separator = language === 'ar' ? '، ' : ', ';
  const lines: string[] = ['*' + t.newOrder + '*'];

  const orderType =
    quote.orderType === 'DELIVERY' ? t.delivery : t.pickup;
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

  const itemLine = (item: OrderQuote['items'][number]): string => {
    const variant = item.variantName ? ' (' + plain(item.variantName) + ')' : '';
    // The unit price excludes modifiers. Product discounts are itemized below
    // so the displayed product + extras + discount reconciles with the quote.
    const baseTotal = extendedAmount(item.unitPrice, item.quantity);
    return '* ' + item.quantity + ' × *' + plain(item.name) + '*' +
      variant + ' = ' + cost(baseTotal);
  };

  if (offerItems.length) {
    lines.push('', '*' + t.offers + '*');
    for (const item of offerItems) {
      lines.push(itemLine(item));
      for (const slot of item.offerSlots ?? []) {
        const picked = slot.choices.map((choice) => {
          const totalQuantity = choice.quantity * item.quantity;
          return (totalQuantity > 1 ? totalQuantity + '× ' : '') +
            plain(choice.name) +
            extraPrice(
              extendedAmount(choice.priceAdjustment, totalQuantity),
              quote.currencyCode,
              language,
            );
        });
        if (picked.length)
          lines.push(
            '↳ ' + plain(slot.title) + ': ' + picked.join(separator),
          );
      }
    }
  }

  for (const group of groups) {
    lines.push('');
    if (group.name) lines.push('*' + plain(group.name) + '*');
    for (const item of group.items) {
      lines.push(itemLine(item));

      // One plain-text line per cart item (even across several modifier groups).
      // Preserve non-generic group names where they disambiguate chosen options.
      if (item.modifiers.length > 0) {
        const groups = [...new Set(item.modifiers.map(
          (modifier) => plain(modifier.groupName) || t.extras,
        ))];
        const oneGroup = groups.length === 1;
        const label = oneGroup ? groups[0] : t.extras;
        const options = item.modifiers.map((modifier) => {
          const group = plain(modifier.groupName) || t.extras;
          const name = (oneGroup || group === t.extras ? '' : group + ': ') +
            plain(modifier.optionName);
          return name +
            (item.quantity > 1 ? ' × ' + item.quantity : '') +
            extraPrice(
              extendedAmount(modifier.priceAdjustment, item.quantity),
              quote.currencyCode,
              language,
            );
        });
        lines.push('↳ ' + label + ': ' + options.join(separator));
      }
    }
  }

  const details: string[] = [];
  // Keep contact details independently readable on narrow WhatsApp screens.
  // Each visible Arabic line gets the existing RTL mark below; the signed
  // Wayta-Ref footer is issued separately and must remain byte-for-byte intact.
  if (quote.customerName)
    details.push(t.customer + ': ' + plain(quote.customerName));
  if (quote.customerPhone)
    details.push(t.phone + ': ' + plain(quote.customerPhone));
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
  if (address.length) details.push(t.address + ': ' + address.join(separator));
  // The current quote only contains ORDER-level notes, not item-specific notes.
  // Do not attribute these notes to an arbitrary product.
  if (quote.customerNotes)
    details.push(t.notes + ': ' + plain(quote.customerNotes));
  if (details.length) lines.push('', ...details);

  const hasBreakdown =
    quote.deliveryFee !== '0.00' || quote.discountTotal !== '0.00';
  if (hasBreakdown) {
    // The backend subtotal is already NET of product discounts. Show the
    // pre-discount items figure only when also showing the discount line,
    // so the summary still reconciles: items - discount + delivery = total.
    const itemsBeforeDiscount = centsAmount(
      amountCents(quote.subtotal) + amountCents(quote.discountTotal),
    );
    lines.push(t.subtotal + ': ' + cost(itemsBeforeDiscount));
    if (quote.discountTotal !== '0.00')
      lines.push(t.discount + ': -' + cost(quote.discountTotal));
    if (quote.deliveryFee !== '0.00')
      lines.push(t.deliveryFee + ': ' + cost(quote.deliveryFee));
  }
  lines.push('*' + t.total + ': ' + cost(quote.total) + '*');

  // Direction is an attribute of EACH visible line, not just item lines.
  // U+200F (RLM) anchors neutral punctuation, leading stars and mixed numerals
  // to the right in Arabic WhatsApp messages. Keep blank lines untouched.
  // The optional signed Wayta-Ref is appended AFTER this function by the
  // tracking service, so its raw, ASCII-only footer is never modified.
  return lines
    .map((line) => (language === 'ar' && line ? '\u200F' + line : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The `wa.me` link that opens WhatsApp on the Restaurant's number with the message ready to send. */
export function buildWhatsappUrl(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
