/**
 * Offers / Bundles (DEC-069): the Guest-visible words, Arabic and English. Kept apart from `copy.ts` (the generic menu
 * copy) so the feature is one self-contained piece. Offer names, slot titles and option names come from the Restaurant's
 * data in the menu language; everything here is the chrome around them.
 */
export interface OffersCopy {
  /** Strip heading and the first category chip. */
  sectionTitle: string;
  sectionHint: string;
  previousOffers: string;
  nextOffers: string;
  /** "3 offers". */
  offersCount: (count: number) => string;
  badge: { OFFER: string; GIFT: string; MOST_ORDERED: string };
  notAvailableToday: string;
  /** An included item is sold out right now. */
  notAvailableNow: string;
  /** "Every day", "Friday only", "Mon, Thu". */
  days: (daysOfWeek: number[]) => string;
  fixedPrice: string;
  chooseAndAdd: string;
  /** Slot status chips in the sheet. */
  included: string;
  pickOne: string;
  pickN: (count: number) => string;
  slotDone: string;
  leftToPick: (count: number) => string;
  /** The hint under the slots while the Add button is still disabled. */
  stillMissing: (slotTitle: string) => string;
  addOffer: string;
  updateOffer: string;
  closeSheet: string;
  increaseOption: (name: string) => string;
  decreaseOption: (name: string) => string;
  /** Cart line. */
  cartOfferTag: string;
  chooseAgain: string;
  lineNotToday: string;
  lineUnavailable: string;
  lineChanged: string;
  /** Errors after sending (the Backend refused an offer line; nothing was created). */
  unavailableError: string;
  changedError: string;
}

const WEEKDAYS: Record<'ar' | 'en', string[]> = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const EN: OffersCopy = {
  sectionTitle: 'Offers',
  sectionHint: 'Swipe for more',
  previousOffers: 'Previous offers',
  nextOffers: 'Next offers',
  offersCount: (count) => (count === 1 ? '1 offer' : `${count} offers`),
  badge: { OFFER: 'Offer', GIFT: 'Gift', MOST_ORDERED: 'Most ordered' },
  notAvailableToday: 'Not available today',
  notAvailableNow: 'Not available right now',
  days: (days) => {
    if (days.length === 0) return 'Every day';
    const names = days.map((day) => WEEKDAYS.en[day] ?? '');
    return days.length === 1 ? `${names[0]} only` : names.join(', ');
  },
  fixedPrice: 'Fixed offer price',
  chooseAndAdd: 'Choose & add',
  included: 'Included',
  pickOne: 'Pick one',
  pickN: (count) => `Pick ${count}`,
  slotDone: 'Done',
  leftToPick: (count) => `${count} left`,
  stillMissing: (title) => `Still to choose: ${title}`,
  addOffer: 'Add to order',
  updateOffer: 'Update offer',
  closeSheet: 'Close',
  increaseOption: (name) => `Add one ${name}`,
  decreaseOption: (name) => `Remove one ${name}`,
  cartOfferTag: 'Offer',
  chooseAgain: 'Choose again',
  lineNotToday: 'This offer is not available today. Remove it to continue.',
  lineUnavailable: 'This offer is no longer available. Remove it to continue.',
  lineChanged: 'This offer has changed. Choose its items again to continue.',
  unavailableError: 'An offer in your order is not available right now. Please review your order.',
  changedError: 'An offer in your order has changed. Please choose its items again.',
};

const AR: OffersCopy = {
  sectionTitle: 'العروض',
  sectionHint: 'اسحب لمزيد من العروض',
  previousOffers: 'العروض السابقة',
  nextOffers: 'العروض التالية',
  offersCount: (count) => (count === 1 ? 'عرض واحد' : count === 2 ? 'عرضان' : `${count} عروض`),
  badge: { OFFER: 'عرض', GIFT: 'هدية', MOST_ORDERED: 'الأكثر طلبًا' },
  notAvailableToday: 'غير متاح اليوم',
  notAvailableNow: 'غير متاح حاليًا',
  days: (days) => {
    if (days.length === 0) return 'كل الأيام';
    const names = days.map((day) => WEEKDAYS.ar[day] ?? '');
    return days.length === 1 ? `${names[0]} فقط` : names.join('، ');
  },
  fixedPrice: 'سعر العرض ثابت',
  chooseAndAdd: 'اختر وأضف',
  included: 'مضمّن',
  pickOne: 'اختيار واحد',
  pickN: (count) => `اختر ${count}`,
  slotDone: 'تم',
  leftToPick: (count) => `متبقي ${count}`,
  stillMissing: (title) => `لا يزال ينقصك: ${title}`,
  addOffer: 'أضف إلى الطلب',
  updateOffer: 'تحديث العرض',
  closeSheet: 'إغلاق',
  increaseOption: (name) => `زِد واحدًا من ${name}`,
  decreaseOption: (name) => `أنقِص واحدًا من ${name}`,
  cartOfferTag: 'عرض',
  chooseAgain: 'اختر من جديد',
  lineNotToday: 'هذا العرض غير متاح اليوم. احذفه للمتابعة.',
  lineUnavailable: 'هذا العرض لم يعد متاحًا. احذفه للمتابعة.',
  lineChanged: 'تغيّر هذا العرض. اختر مكوّناته من جديد للمتابعة.',
  unavailableError: 'يوجد عرض في طلبك غير متاح الآن. يرجى مراجعة الطلب.',
  changedError: 'تغيّر أحد العروض في طلبك. يرجى اختيار مكوّناته من جديد.',
};

export function getOffersCopy(locale: string): OffersCopy {
  return locale === 'ar' ? AR : EN;
}

/** A paid adjustment in a sentence: "+10". */
export function extraLabel(adjustment: string): string {
  const whole = /^(\d+)\.0+$/.exec(adjustment);
  return `+${whole ? whole[1] : adjustment}`;
}
