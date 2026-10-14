'use client';

import { useState } from 'react';
import { ProductCard } from '../../../../../q/[publicCode]/ProductCard';
import { ProductSheet } from '../../../../../q/[publicCode]/ProductSheet';
import { GuestLocaleProvider } from '../../../../../../components/guest/GuestLocale';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localeLabel } from '../../../../../../lib/settings/locale-labels';
import { getPublicMenuCopy } from '../../../../../../lib/public-menu/copy';
import type {
  PublicMenuModifierGroup,
  PublicMenuProduct,
  PublicProductDiscount,
} from '../../../../../../lib/public-menu/types';

export interface ProductPreviewValues {
  name: string;
  description: string;
  basePrice: string;
  /** The discount as it would apply now, or `null` for none / not yet valid. */
  discount: PublicProductDiscount | null;
  imageUrl: string | null;
  soldOut: boolean;
  featured: boolean;
  active: boolean;
}

/**
 * "How guests will see it": the real Guest Menu product card, fed by the form
 * as it is being typed. It is the same component the Guest Menu renders (not a
 * lookalike), so spacing, price lockup, discount badge, sold-out and featured
 * states cannot drift from what guests actually get. Wrapped in the Guest theme
 * scope (light / dark) and the language of the tab being edited (so Arabic is
 * shown right-to-left with Arabic labels). The card is inert: nothing in it can
 * be clicked or focused.
 *
 * It shows the CARD only: add-ons, the product sheet and live availability
 * rules are the Backend's and are not simulated here.
 */
export function ProductPreview({
  values,
  locale,
  usingFallback,
  currencyCode,
  modifierGroups,
  addonsAvailable,
  view,
  onViewChange,
}: {
  /** The product's guest-visible add-ons in the previewed language (empty when none). */
  modifierGroups: PublicMenuModifierGroup[];
  /** False in create mode: add-ons can only be configured once the product exists. */
  addonsAvailable: boolean;
  view: 'card' | 'page';
  onViewChange: (view: 'card' | 'page') => void;
  values: ProductPreviewValues;
  /** The content language being edited; also sets direction and the card's labels. */
  locale: string;
  /** The edited language has no text yet, so guests would see the default language. */
  usingFallback: boolean;
  currencyCode: string;
}) {
  const { t } = useStaffI18n();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [layout, setLayout] = useState<'phone' | 'wide'>('phone');

  const guestLocale = locale === 'ar' ? 'ar' : 'en';
  const copy = getPublicMenuCopy(guestLocale);

  const product: PublicMenuProduct = {
    id: 'preview',
    name: values.name.trim() === '' ? t('product.preview.placeholderName') : values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    basePrice: values.basePrice,
    discount: values.discount,
    primaryImageAssetPath: null,
    availability: values.soldOut ? 'SOLD_OUT' : 'AVAILABLE',
    featured: values.featured,
    modifierGroups,
  };

  const segment = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
      active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <section
      aria-label={t('product.preview.title')}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t('product.preview.title')}</h2>
        <div role="group" aria-label={t('product.preview.view')} className="flex rounded-lg bg-muted p-0.5">
          <button type="button" aria-pressed={view === 'card'} onClick={() => onViewChange('card')} className={segment(view === 'card')}>
            {t('product.preview.viewCard')}
          </button>
          <button type="button" aria-pressed={view === 'page'} onClick={() => onViewChange('page')} className={segment(view === 'page')}>
            {t('product.preview.viewPage')}
            {modifierGroups.length > 0 ? (
              <span className="ms-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                {modifierGroups.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {view === 'card' ? (
            <div role="group" aria-label={t('product.preview.layout')} className="flex rounded-lg bg-muted p-0.5">
              <button type="button" aria-pressed={layout === 'phone'} onClick={() => setLayout('phone')} className={segment(layout === 'phone')}>
                {t('product.preview.phone')}
              </button>
              <button type="button" aria-pressed={layout === 'wide'} onClick={() => setLayout('wide')} className={segment(layout === 'wide')}>
                {t('product.preview.wide')}
              </button>
            </div>
          ) : null}
          <div role="group" aria-label={t('product.preview.theme')} className="flex rounded-lg bg-muted p-0.5">
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} className={segment(theme === 'light')}>
              {t('product.preview.light')}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} className={segment(theme === 'dark')}>
              {t('product.preview.dark')}
            </button>
          </div>
        </div>
      </div>

      <div
        data-guest-theme={theme}
        dir={guestLocale === 'ar' ? 'rtl' : 'ltr'}
        lang={guestLocale}
        className="guest-root g-body rounded-xl bg-g-bg p-4 text-g-text"
      >
        {view === 'card' ? (
          <div inert className={layout === 'phone' ? 'mx-auto w-full max-w-[360px]' : 'mx-auto w-full max-w-[300px]'}>
            <GuestLocaleProvider locale={guestLocale}>
              <ProductCard
                product={product}
                currency={currencyCode}
                copy={copy}
                canOrder
                compact={layout === 'phone'}
                simpleQuantity={0}
                totalQuantity={0}
                onOpen={() => undefined}
                onQuickAdd={() => undefined}
                onIncrement={() => undefined}
                onDecrement={() => undefined}
                previewImageUrl={values.imageUrl}
              />
            </GuestLocaleProvider>
          </div>
        ) : (
          // The product page a guest opens from the card, with its add-ons. It is the real
          // sheet, so it can be tried (pick options, see the rules and the total); nothing
          // is ordered.
          <div className="mx-auto w-full max-w-[400px]">
            <GuestLocaleProvider locale={guestLocale}>
              <ProductSheet
                key={`${guestLocale}-${modifierGroups.map((group) => group.id).join(',')}`}
                product={product}
                currency={currencyCode}
                copy={copy}
                dir={guestLocale === 'ar' ? 'rtl' : 'ltr'}
                onCancel={() => undefined}
                onConfirm={() => undefined}
                inline
                previewImageUrl={values.imageUrl}
              />
            </GuestLocaleProvider>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <p>
          {t('product.preview.language', { language: localeLabel(locale) })}
          {usingFallback ? ` · ${t('product.preview.fallback')}` : ''}
        </p>
        {!values.active ? <p className="text-warning">{t('product.preview.inactive')}</p> : null}
        {values.discount ? <p>{t('product.preview.discountNote')}</p> : null}
        {view === 'page' && !addonsAvailable ? (
          <p>{t('product.preview.addonsAfterCreate')}</p>
        ) : view === 'page' && modifierGroups.length === 0 ? (
          <p>{t('product.preview.noAddons')}</p>
        ) : null}
        <p>{view === 'page' ? t('product.preview.scopePage') : t('product.preview.scope')}</p>
      </div>
    </section>
  );
}
