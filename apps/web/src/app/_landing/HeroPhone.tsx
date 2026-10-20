'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { LandingCopy } from './copy';
import styles from './landing.module.css';

type Design = 'classic' | 'gallery' | 'compact';

const DISHES = [
  { image: '/showcase/premium-menu/burger.jpg', name: { ar: 'برجر مشوي', en: 'Grilled burger' }, price: 145 },
  { image: '/showcase/premium-menu/pizza.jpg', name: { ar: 'بيتزا مارجريتا', en: 'Margherita pizza' }, price: 160 },
  { image: '/showcase/premium-menu/pasta.jpg', name: { ar: 'باستا ألفريدو', en: 'Alfredo pasta' }, price: 130 },
  { image: '/showcase/premium-menu/loaded-fries.jpg', name: { ar: 'بطاطس بالجبن', en: 'Loaded fries' }, price: 75 },
] as const;

/**
 * The hero's demo: a phone showing a menu that changes its whole layout when the visitor taps a design.
 * It is an illustration with demo dishes (clearly labelled), not the real guest page; the Gallery layout
 * carries the premium star because it is a premium design in the product (DEC-052).
 */
export function HeroPhone({ locale, copy }: { locale: 'ar' | 'en'; copy: LandingCopy['hero'] }) {
  const [design, setDesign] = useState<Design>('classic');
  const money = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US');
  const cur = locale === 'ar' ? 'ج.م' : 'EGP';
  const tabs: { id: Design; label: string; premium?: boolean }[] = [
    { id: 'classic', label: copy.designs.classic },
    { id: 'gallery', label: copy.designs.gallery, premium: true },
    { id: 'compact', label: copy.designs.compact },
  ];

  return (
    <div className={styles.phone}>
      <div className={styles.screen}>
        <div className={styles.screenHead}>
          <span className={styles.screenName}>{locale === 'ar' ? 'مطعم الأصيل' : 'Al Aseel Grill'}</span>
          <span className={styles.screenTag}>{copy.demoLabel}</span>
        </div>

        <div className={styles.chips} role="tablist" aria-label={copy.demoLabel}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={design === tab.id}
              className={styles.chip}
              onClick={() => setDesign(tab.id)}
            >
              {tab.label}
              {tab.premium ? (
                <span className={styles.star} aria-label={copy.premium} title={copy.premium}>
                  ★
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className={styles.menuBody} role="tabpanel">
          {design === 'classic' ? (
            <div className={styles.rowList}>
              {DISHES.map((dish) => (
                <div key={dish.image} className={styles.row}>
                  <span className={styles.rowImg}>
                    <Image src={dish.image} alt="" fill sizes="54px" style={{ objectFit: 'cover' }} />
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.rowName}>{dish.name[locale]}</span>
                    <br />
                    <span className={`${styles.rowPrice} ${styles.mono}`}>
                      {money.format(dish.price)} {cur}
                    </span>
                  </span>
                  <span className={styles.rowAdd} aria-hidden="true">
                    +
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {design === 'gallery' ? (
            <div className={styles.gallery}>
              {DISHES.map((dish) => (
                <div key={dish.image} className={styles.card}>
                  <Image src={dish.image} alt="" fill sizes="120px" style={{ objectFit: 'cover' }} />
                  <span className={styles.cardShade} />
                  <span className={styles.cardText}>
                    <span className={styles.cardName}>{dish.name[locale]}</span>
                    <br />
                    <span className={`${styles.cardPrice} ${styles.mono}`}>
                      {money.format(dish.price)} {cur}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {design === 'compact' ? (
            <div className={styles.dense}>
              {DISHES.map((dish) => (
                <div key={dish.image} className={styles.denseRow}>
                  <b>{dish.name[locale]}</b>
                  <span className={styles.mono}>
                    {money.format(dish.price)} {cur}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
