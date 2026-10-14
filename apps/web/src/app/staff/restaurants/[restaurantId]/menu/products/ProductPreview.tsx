'use client';

import { useState } from 'react';
import { ProductCard } from '../../../../../q/[publicCode]/ProductCard';
import { GuestLocaleProvider } from '../../../../../../components/guest/GuestLocale';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { localeLabel } from '../../../../../../lib/settings/locale-labels';
import { getPublicMenuCopy } from '../../../../../../lib/public-menu/copy';
import type { PublicMenuProduct, PublicProductDiscount } from '../../../../../../lib/public-menu/types';

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
}: {
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
    modifierGroups: [],
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
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t('product.preview.layout')} className="flex rounded-lg bg-muted p-0.5">
            <button type="button" aria-pressed={layout === 'phone'} onClick={() => setLayout('phone')} className={segment(layout === 'phone')}>
              {t('product.preview.phone')}
            </button>
            <button type="button" aria-pressed={layout === 'wide'} onClick={() => setLayout('wide')} className={segment(layout === 'wide')}>
              {t('product.preview.wide')}
            </button>
          </div>
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
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <p>
          {t('product.preview.language', { language: localeLabel(locale) })}
          {usingFallback ? ` · ${t('product.preview.fallback')}` : ''}
        </p>
        {!values.active ? <p className="text-warning">{t('product.preview.inactive')}</p> : null}
        {values.discount ? <p>{t('product.preview.discountNote')}</p> : null}
        <p>{t('product.preview.scope')}</p>
      </div>
    </section>
  );
}
