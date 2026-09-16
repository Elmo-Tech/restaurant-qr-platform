/**
 * FT-3B, Section 3 / FT-5: the public Guest Menu's own INTERFACE copy
 * (chrome labels, never Restaurant/Menu/Product content -- that always
 * comes from the Backend's already-resolved, field-level-fallback text and
 * must never be retranslated here). Only two Platform locales exist
 * (`en`/`ar`), so a full i18n library is unjustified (CLAUDE.md #52) --
 * this is one small typed lookup instead.
 */
export interface PublicMenuCopy {
  table: string;
  featured: string;
  soldOut: string;
  categories: string;
  noItemsInCategory: string;
  noItemsInMenu: string;
  menuUnavailableTitle: string;
  menuUnavailableMessage: string;
  qrNotFoundTitle: string;
  qrNotFoundMessage: string;
  add: string;
  cart: string;
  viewCart: string;
  yourOrder: string;
  emptyCart: string;
  remove: string;
  total: string;
  placeOrder: string;
  placingOrder: string;
  removeToContinue: string;
  orderSent: string;
  orderStatusPending: string;
  itemsUnavailableError: string;
  orderNetworkError: string;
  orderNotFoundError: string;
  close: string;
  backToMenu: string;
}

const EN_COPY: PublicMenuCopy = {
  table: 'Table',
  featured: 'Featured',
  soldOut: 'Sold out',
  categories: 'Categories',
  noItemsInCategory: 'No items in this category yet.',
  noItemsInMenu: "This menu doesn't have any items yet.",
  menuUnavailableTitle: 'Menu unavailable',
  menuUnavailableMessage:
    'This restaurant menu is temporarily unavailable. Please check back soon.',
  qrNotFoundTitle: 'This QR code is no longer active.',
  qrNotFoundMessage: 'Please ask a member of staff for help.',
  add: 'Add',
  cart: 'Cart',
  viewCart: 'View cart',
  yourOrder: 'Your order',
  emptyCart: 'Your cart is empty.',
  remove: 'Remove',
  total: 'Total',
  placeOrder: 'Place order',
  placingOrder: 'Sending order…',
  removeToContinue: 'No longer available — remove to continue.',
  orderSent: 'Order sent',
  orderStatusPending: 'Waiting for the restaurant to accept your order.',
  itemsUnavailableError:
    'One or more items in your cart are no longer available. Please review your cart.',
  orderNetworkError: "Couldn't send your order. Please try again.",
  orderNotFoundError: 'This QR code is no longer active. Please ask a member of staff for help.',
  close: 'Close',
  backToMenu: 'Back to menu',
};

const AR_COPY: PublicMenuCopy = {
  table: 'طاولة',
  featured: 'مميز',
  soldOut: 'نفد مؤقتًا',
  categories: 'الأقسام',
  noItemsInCategory: 'لا توجد أصناف في هذا القسم حاليًا.',
  noItemsInMenu: 'لا توجد أصناف متاحة في القائمة حاليًا.',
  menuUnavailableTitle: 'القائمة غير متاحة',
  menuUnavailableMessage: 'قائمة المطعم غير متاحة حاليًا. يرجى المحاولة مرة أخرى لاحقًا.',
  qrNotFoundTitle: 'رمز QR هذا غير متاح حاليًا.',
  qrNotFoundMessage: 'يرجى التواصل مع أحد أفراد طاقم المطعم للمساعدة.',
  add: 'إضافة',
  cart: 'السلة',
  viewCart: 'عرض السلة',
  yourOrder: 'طلبك',
  emptyCart: 'سلتك فارغة.',
  remove: 'إزالة',
  total: 'الإجمالي',
  placeOrder: 'إرسال الطلب',
  placingOrder: 'جارٍ إرسال الطلب…',
  removeToContinue: 'لم يعد متاحًا — يرجى الإزالة للمتابعة.',
  orderSent: 'تم إرسال الطلب',
  orderStatusPending: 'في انتظار موافقة المطعم على طلبك.',
  itemsUnavailableError: 'بعض الأصناف في سلتك لم تعد متاحة. يرجى مراجعة سلتك.',
  orderNetworkError: 'تعذر إرسال طلبك. يرجى المحاولة مرة أخرى.',
  orderNotFoundError: 'رمز QR هذا غير متاح حاليًا. يرجى التواصل مع أحد أفراد طاقم المطعم للمساعدة.',
  close: 'إغلاق',
  backToMenu: 'العودة إلى القائمة',
};

/**
 * Resolves the public interface copy for a locale. Any non-`ar` value
 * (including the guest-status pages' own best-effort guess when the
 * Backend never resolved a real locale at all -- see `GuestStatusPage`)
 * safely defaults to English, mirroring the Backend's own default-locale
 * fallback spirit without needing to duplicate its Restaurant-scoped logic
 * here.
 */
export function getPublicMenuCopy(locale: string | null | undefined): PublicMenuCopy {
  return locale === 'ar' ? AR_COPY : EN_COPY;
}
