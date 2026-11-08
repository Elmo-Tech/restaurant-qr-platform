'use client';

import { useState } from 'react';
import { GuestLocaleProvider } from '../../../../../../components/guest/GuestLocale';
import { useStaffI18n } from '../../../../../../lib/i18n/client';
import { getPublicMenuCopy } from '../../../../../../lib/public-menu/copy';
import { getOffersCopy } from '../../../../../../lib/public-menu/offers-copy';
import type { PublicOffer } from '../../../../../../lib/public-menu/types';
import { OfferSheet } from '../../../../../q/[publicCode]/OfferSheet';
import { OffersStrip } from '../../../../../q/[publicCode]/OffersStrip';

/**
 * "How guests will see it": the REAL Guest Menu offer card (`OffersStrip`) and the REAL choice sheet (`OfferSheet`), fed by
 * the form as it is typed (the same pattern as the product editor's preview). Not a lookalike: spacing, badge, price lockup,
 * the included items with their quantities, the choice groups with their extra prices and the validity days are drawn by the
 * guest components themselves. It has its own Arabic / English toggle (so the right-to-left layout can be checked) and a
 * light / dark one. The card is inert; the sheet can be tried (pick choices, see the total) and nothing is ordered.
 */
export function OfferPreview({
  offer,
  currencyCode,
  imageUrl,
}: {
  /** The draft as a guest would receive it, in the previewed language. */
  offer: (language: 'ar' | 'en') => PublicOffer;
  currencyCode: string;
  imageUrl: string | null;
}) {
  const { t, locale } = useStaffI18n();
  const [view, setView] = useState<'card' | 'sheet'>('card');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState<'ar' | 'en'>(locale === 'ar' ? 'ar' : 'en');
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const shown = offer(language);
  const menuCopy = getPublicMenuCopy(language);
  const offersCopy = getOffersCopy(language);

  const segment = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
      active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;
  const group = (label: string, children: React.ReactNode) => (
    <div role="group" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
      {children}
    </div>
  );

  return (
    <section
      aria-label={t('offers.preview.title')}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground">{t('offers.preview.title')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        {group(
          t('offers.preview.view'),
          <>
            <button type="button" aria-pressed={view === 'card'} onClick={() => setView('card')} className={segment(view === 'card')}>
              {t('offers.preview.viewCard')}
            </button>
            <button type="button" aria-pressed={view === 'sheet'} onClick={() => setView('sheet')} className={segment(view === 'sheet')}>
              {t('offers.preview.viewSheet')}
            </button>
          </>,
        )}
        {group(
          t('offers.preview.language'),
          <>
            <button type="button" aria-pressed={language === 'ar'} onClick={() => setLanguage('ar')} className={segment(language === 'ar')}>
              العربية
            </button>
            <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')} className={segment(language === 'en')}>
              English
            </button>
          </>,
        )}
        {group(
          t('product.preview.theme'),
          <>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} className={segment(theme === 'light')}>
              {t('product.preview.light')}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} className={segment(theme === 'dark')}>
              {t('product.preview.dark')}
            </button>
          </>,
        )}
      </div>

      <div data-guest-theme={theme} dir={dir} lang={language} className="guest-root g-body rounded-xl bg-g-bg p-4 text-g-text">
        <GuestLocaleProvider locale={language}>
          {view === 'card' ? (
            <div inert className="mx-auto w-full max-w-[360px]">
              <OffersStrip
                offers={[shown]}
                currency={currencyCode}
                offersCopy={offersCopy}
                canOrder
                showPhotos
                onOpen={() => undefined}
                previewImageUrl={imageUrl}
              />
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[400px]">
              <OfferSheet
                key={`${language}-${shown.slots.map((slot) => `${slot.id}:${slot.options.map((option) => option.id).join('.')}`).join('|')}`}
                offer={shown}
                currency={currencyCode}
                copy={menuCopy}
                offersCopy={offersCopy}
                dir={dir}
                showPhotos
                inline
                previewImageUrl={imageUrl}
                onCancel={() => undefined}
                onConfirm={() => undefined}
              />
            </div>
          )}
        </GuestLocaleProvider>
      </div>
      <p className="text-xs text-muted-foreground">
        {view === 'card' ? t('offers.preview.noteCard') : t('offers.preview.noteSheet')}
      </p>
    </section>
  );
}
