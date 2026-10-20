'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Cloche } from './Cloche';
import { DESIGN_KEYS, type LandingCopy } from './copy';
import { MenuScreen, PhoneFrame } from './PhoneScreens';
import styles from './landing.module.css';

const SWAP_MS = 3400;

/**
 * The hero picture: three arched photo frames (the cloche's dome as a shape) standing on the plate line,
 * a phone in front whose menu keeps changing its whole layout, the cloche lifting its lid above, and live
 * orders dropping in. The design cycle pauses while the visitor points at the phone; a design can be picked
 * from the dots; a visitor who prefers reduced motion gets a still phone they step through by hand.
 */
export function HeroStage({ locale, copy }: { locale: 'ar' | 'en'; copy: LandingCopy['hero'] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % DESIGN_KEYS.length), SWAP_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduced]);

  const design = DESIGN_KEYS[index];
  const order = copy.orders[index % copy.orders.length];

  return (
    <div className={styles.heroStage}>
      <div className={`${styles.arch} ${styles.arch1}`}>
        <Image src="/showcase/premium-menu/pasta.jpg" alt="" fill sizes="170px" priority style={{ objectFit: 'cover' }} />
      </div>
      <div className={`${styles.arch} ${styles.arch2}`}>
        <Image src="/showcase/premium-menu/burger.jpg" alt="" fill sizes="200px" priority style={{ objectFit: 'cover' }} />
      </div>
      <div className={`${styles.arch} ${styles.arch3}`}>
        <Image src="/showcase/premium-menu/pizza.jpg" alt="" fill sizes="170px" priority style={{ objectFit: 'cover' }} />
      </div>
      <span className={styles.plate} aria-hidden="true" />

      <Cloche animated className={styles.cloche} />

      <div className={styles.heroPhoneWrap} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
        <PhoneFrame className={styles.heroPhone}>
          <div key={design} className={styles.screenSwap}>
            <MenuScreen design={design} locale={locale} />
          </div>
        </PhoneFrame>
      </div>

      <div key={`order-${index}`} className={styles.orderToast} role="status" aria-live="off">
        <span className={styles.orderDot} aria-hidden="true" />
        <span>
          <small>{order.kicker}</small>
          <b>{order.line}</b>
          <em>{order.status}</em>
        </span>
      </div>

      <div className={styles.designBar}>
        <span className={styles.designLabel}>{copy.designLabel}</span>
        <b key={design} className={styles.designName}>
          {copy.designNames[design]}
        </b>
        <span className={styles.dots} role="group" aria-label={copy.designLabel}>
          {DESIGN_KEYS.map((key, position) => (
            <button key={key} type="button" aria-label={copy.designNames[key]} aria-pressed={position === index} onClick={() => setIndex(position)} />
          ))}
        </span>
      </div>
    </div>
  );
}
