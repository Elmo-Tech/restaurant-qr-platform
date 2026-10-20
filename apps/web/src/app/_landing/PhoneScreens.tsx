import Image from 'next/image';
import type { ReactNode } from 'react';
import type { DesignKey } from './copy';
import styles from './landing.module.css';

type Locale = 'ar' | 'en';

export interface Dish {
  image: string;
  name: Record<Locale, string>;
  desc: Record<Locale, string>;
  price: number;
}

/** Demo dishes for the illustrations (clearly labelled "demo menu" on the page). */
export const DISHES: Dish[] = [
  { image: '/showcase/premium-menu/burger.jpg', name: { ar: 'برجر مشوي', en: 'Grilled burger' }, desc: { ar: 'لحم بقري، جبن شيدر، صوص خاص', en: 'Beef, cheddar, house sauce' }, price: 145 },
  { image: '/showcase/premium-menu/pizza.jpg', name: { ar: 'بيتزا مارجريتا', en: 'Margherita pizza' }, desc: { ar: 'موتزاريلا وطماطم وريحان', en: 'Mozzarella, tomato, basil' }, price: 160 },
  { image: '/showcase/premium-menu/pasta.jpg', name: { ar: 'باستا ألفريدو', en: 'Alfredo pasta' }, desc: { ar: 'كريمة وفطر ودجاج', en: 'Cream, mushroom, chicken' }, price: 130 },
  { image: '/showcase/premium-menu/loaded-fries.jpg', name: { ar: 'بطاطس بالجبن', en: 'Loaded fries' }, desc: { ar: 'جبن مذاب وهالبينو', en: 'Melted cheese, jalapeño' }, price: 75 },
];

const REST_NAME: Record<Locale, string> = { ar: 'مطعم الأصيل', en: 'Al Aseel Grill' };

function price(locale: Locale, value: number) {
  return `${new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US').format(value)} ${locale === 'ar' ? 'ج.م' : 'EGP'}`;
}

function Photo({ dish, sizes }: { dish: Dish; sizes: string }) {
  return <Image src={dish.image} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} />;
}

/** One menu layout, drawn at the phone's intrinsic size. The names follow the product's real designs. */
export function MenuScreen({ design, locale }: { design: DesignKey; locale: Locale }) {
  const p = (value: number) => price(locale, value);
  const name = REST_NAME[locale];

  const screens: Record<DesignKey, ReactNode> = {
    classic: (
      <div className={`${styles.scr} ${styles.scrClassic}`}>
        <div className={styles.scrHead}>
          <b>{name}</b>
          <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
        </div>
        <div className={styles.scrChips}>
          <span data-on="1">{locale === 'ar' ? 'الكل' : 'All'}</span>
          <span>{locale === 'ar' ? 'برجر' : 'Burgers'}</span>
          <span>{locale === 'ar' ? 'بيتزا' : 'Pizza'}</span>
        </div>
        <div className={styles.scrRows}>
          {DISHES.map((dish) => (
            <div key={dish.image} className={styles.scrRow}>
              <span className={styles.scrThumb}>
                <Photo dish={dish} sizes="56px" />
              </span>
              <span className={styles.scrRowText}>
                <b>{dish.name[locale]}</b>
                <em>{p(dish.price)}</em>
              </span>
              <span className={styles.scrPlus}>+</span>
            </div>
          ))}
        </div>
      </div>
    ),
    gallery: (
      <div className={`${styles.scr} ${styles.scrGallery}`}>
        <div className={styles.scrHead}>
          <b>{name}</b>
          <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
        </div>
        <div className={styles.scrGrid}>
          {DISHES.map((dish) => (
            <div key={dish.image} className={styles.scrCard}>
              <Photo dish={dish} sizes="130px" />
              <span className={styles.scrShade} />
              <span className={styles.scrCardText}>
                <b>{dish.name[locale]}</b>
                <em>{p(dish.price)}</em>
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    menu: (
      <div className={`${styles.scr} ${styles.scrPaper}`}>
        <div className={styles.paperTitle}>
          <small>{locale === 'ar' ? 'قائمة الطعام' : 'THE MENU'}</small>
          <b>{name}</b>
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
      </div>
    ),
    floating: (
      <div className={`${styles.scr} ${styles.scrFloat}`}>
        <div className={styles.floatPhoto}>
          <Photo dish={DISHES[0]} sizes="260px" />
          <span className={styles.scrShade} />
          <b className={styles.floatName}>{name}</b>
        </div>
        <div className={styles.floatCard}>
          <b>{DISHES[0].name[locale]}</b>
          <span>{DISHES[0].desc[locale]}</span>
          <div className={styles.floatFoot}>
            <em>{p(DISHES[0].price)}</em>
            <span className={styles.floatBtn}>{locale === 'ar' ? 'أضف' : 'Add'}</span>
          </div>
        </div>
        <div className={styles.floatDots} aria-hidden="true">
          <i data-on="1" />
          <i />
          <i />
        </div>
      </div>
    ),
    centered: (
      <div className={`${styles.scr} ${styles.scrCentered}`}>
        <div className={styles.cenLogo}>{locale === 'ar' ? 'أ' : 'A'}</div>
        <b className={styles.cenName}>{name}</b>
        <span className={styles.cenSub}>{locale === 'ar' ? 'مشويات · بيتزا · باستا' : 'Grill · Pizza · Pasta'}</span>
        <div className={styles.scrChips} style={{ justifyContent: 'center' }}>
          <span data-on="1">{locale === 'ar' ? 'الكل' : 'All'}</span>
          <span>{locale === 'ar' ? 'برجر' : 'Burgers'}</span>
          <span>{locale === 'ar' ? 'بيتزا' : 'Pizza'}</span>
        </div>
        <div className={styles.cenCard}>
          <span className={styles.cenPhoto}>
            <Photo dish={DISHES[1]} sizes="240px" />
          </span>
          <b>{DISHES[1].name[locale]}</b>
          <em>{p(DISHES[1].price)}</em>
        </div>
      </div>
    ),
    compact: (
      <div className={`${styles.scr} ${styles.scrCompact}`}>
        <div className={styles.scrHead}>
          <b>{name}</b>
          <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
        </div>
        {[...DISHES, { ...DISHES[0], image: 'x1', name: { ar: 'سلطة سيزر', en: 'Caesar salad' }, price: 85 }, { ...DISHES[0], image: 'x2', name: { ar: 'مشروب غازي', en: 'Soft drink' }, price: 25 }].map((dish, index) => (
          <div key={dish.image} className={styles.cmpRow}>
            <b>{dish.name[locale]}</b>
            <em>{p(dish.price)}</em>
            <span className={styles.cmpStep}>
              <i>−</i>
              <u>{index === 0 ? '2' : '0'}</u>
              <i>+</i>
            </span>
          </div>
        ))}
      </div>
    ),
    list: (
      <div className={`${styles.scr} ${styles.scrList}`}>
        <div className={styles.scrHead}>
          <b>{name}</b>
          <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
        </div>
        <div className={styles.listTabs}>
          <span data-on="1">{locale === 'ar' ? 'الرئيسية' : 'Mains'}</span>
          <span>{locale === 'ar' ? 'جانبية' : 'Sides'}</span>
          <span>{locale === 'ar' ? 'مشروبات' : 'Drinks'}</span>
        </div>
        {DISHES.map((dish) => (
          <div key={dish.image} className={styles.listItem}>
            <span>
              <b>{dish.name[locale]}</b>
              <small>{dish.desc[locale]}</small>
            </span>
            <em>{p(dish.price)}</em>
          </div>
        ))}
      </div>
    ),
  };

  return <>{screens[design]}</>;
}

/** The phone frame around any screen. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.phone} ${className ?? ''}`}>
      <span className={styles.notch} aria-hidden="true" />
      <div className={styles.phoneScreen}>{children}</div>
    </div>
  );
}
