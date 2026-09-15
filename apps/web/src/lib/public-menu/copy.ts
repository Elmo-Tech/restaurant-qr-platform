/**
 * FT-3B, Section 3: the public Guest Menu's own INTERFACE copy (chrome
 * labels, never Restaurant/Menu/Product content -- that always comes from
 * the Backend's already-resolved, field-level-fallback text and must never
 * be retranslated here). Only two Platform locales exist (`en`/`ar`), so a
 * full i18n library is unjustified (CLAUDE.md #52) -- this is one small
 * typed lookup instead.
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
