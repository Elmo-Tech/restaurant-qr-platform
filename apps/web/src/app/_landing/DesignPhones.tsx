import Image from 'next/image';
import type { ReactNode } from 'react';
import styles from './landing.module.css';

type Locale = 'ar' | 'en';

const NAME: Record<Locale, string> = { ar: 'مطعم الأصيل', en: 'Al Aseel Grill' };

const DISHES = [
  { image: '/showcase/premium-menu/burger.jpg', name: { ar: 'برجر مشوي', en: 'Grilled burger' }, desc: { ar: 'لحم بقري، جبن شيدر، صوص خاص', en: 'Beef, cheddar, house sauce' }, price: 145 },
  { image: '/showcase/premium-menu/pizza.jpg', name: { ar: 'بيتزا مارجريتا', en: 'Margherita pizza' }, price: 160 },
  { image: '/showcase/premium-menu/pasta.jpg', name: { ar: 'باستا ألفريدو', en: 'Alfredo pasta' }, price: 130 },
  { image: '/showcase/premium-menu/loaded-fries.jpg', name: { ar: 'بطاطس بالجبن', en: 'Loaded fries' }, price: 75 },
] as const;

function Photo({ src, sizes }: { src: string; sizes: string }) {
  return <Image src={src} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} />;
}

/** Three different menu layouts drawn at the phone's intrinsic size (illustrations; the product has more). */
function Screens({ locale }: { locale: Locale }) {
  const money = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US');
  const cur = locale === 'ar' ? 'ج.م' : 'EGP';
  const p = (value: number) => `${money.format(value)} ${cur}`;

  const gallery: ReactNode = (
    <div className={`${styles.scr} ${styles.scrGallery}`}>
      <div className={styles.scrHead}>
        <b>{NAME[locale]}</b>
        <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
      </div>
      <div className={styles.scrGrid}>
        {DISHES.map((dish) => (
          <div key={dish.image} className={styles.scrCard}>
            <Photo src={dish.image} sizes="130px" />
            <span className={styles.scrShade} />
            <span className={styles.scrCardText}>
              <b>{dish.name[locale]}</b>
              <em>{p(dish.price)}</em>
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const paper: ReactNode = (
    <div className={`${styles.scr} ${styles.scrPaper}`}>
      <div className={styles.paperTitle}>
        <small>{locale === 'ar' ? 'قائمة الطعام' : 'THE MENU'}</small>
        <b>{NAME[locale]}</b>
        <i aria-hidden="true">❦</i>
      </div>
      <div className={styles.paperSection}>{locale === 'ar' ? 'الأطباق الرئيسية' : 'Mains'}</div>
      {DISHES.slice(0, 3).map((dish) => (
        <div key={dish.image} className={styles.paperLine}>
          <span>{dish.name[locale]}</span>
          <span className={styles.paperDots} />
          <span>{p(dish.price)}</span>
        </div>
      ))}
      <div className={styles.paperSection}>{locale === 'ar' ? 'جانبية' : 'Sides'}</div>
      <div className={styles.paperLine}>
        <span>{DISHES[3].name[locale]}</span>
        <span className={styles.paperDots} />
        <span>{p(DISHES[3].price)}</span>
      </div>
      <div className={styles.paperLine}>
        <span>{locale === 'ar' ? 'سلطة سيزر' : 'Caesar salad'}</span>
        <span className={styles.paperDots} />
        <span>{p(85)}</span>
      </div>
      <div className={styles.paperSection}>{locale === 'ar' ? 'مشروبات' : 'Drinks'}</div>
      {([[locale === 'ar' ? 'عصير ليمون بالنعناع' : 'Fresh lemon-mint', 40], [locale === 'ar' ? 'مشروب غازي' : 'Soft drink', 25]] as const).map(([label, value]) => (
        <div key={label} className={styles.paperLine}>
          <span>{label}</span>
          <span className={styles.paperDots} />
          <span>{p(value)}</span>
        </div>
      ))}
    </div>
  );

  const floating: ReactNode = (
    <div className={`${styles.scr} ${styles.scrFloat}`}>
      <div className={styles.floatPhoto}>
        <Photo src={DISHES[0].image} sizes="260px" />
        <span className={styles.scrShade} />
        <b className={styles.floatName}>{NAME[locale]}</b>
      </div>
      <div className={styles.floatCard}>
        <b>{DISHES[0].name[locale]}</b>
        <span>{DISHES[0].desc[locale]}</span>
        <div className={styles.floatFoot}>
          <em>{p(DISHES[0].price)}</em>
          <span className={styles.floatBtn}>{locale === 'ar' ? 'أضف' : 'Add'}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {[gallery, paper, floating].map((screen, index) => (
        <div key={index} className={styles.fanPhone} data-pos={index}>
          <div className={styles.designPhone}>
            <span className={styles.designNotch} aria-hidden="true" />
            <div className={styles.designScreen}>{screen}</div>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * The designs section's picture: three very different menus side by side and a "there are more" tile. The
 * designs are not named or counted on purpose: the point is that there are plenty and the look can change
 * whenever the restaurant likes.
 */
export function DesignPhones({ locale, more }: { locale: Locale; more: string }) {
  return (
    <div className={styles.fan} aria-hidden="true">
      <Screens locale={locale} />
      <div className={styles.moreSticker}>
        <span className={styles.moreStickerPlus}>+</span>
        <b>{more}</b>
      </div>
    </div>
  );
}
