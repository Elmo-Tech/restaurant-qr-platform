'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DESIGN_KEYS, type LandingCopy } from './copy';
import { MenuScreen, PhoneFrame } from './PhoneScreens';
import styles from './landing.module.css';

const SWAP_MS = 3400;

/**
 * The hero's centrepiece: a phone whose menu keeps changing its whole layout (every design the product
 * has, one after another), with live orders dropping in beside it. The cycle pauses while the visitor
 * points at the phone, a design can be picked from the dots, and a visitor who prefers reduced motion
 * gets a still phone they can step through by hand.
 */
export function HeroStage({ locale, copy }: { locale: 'ar' | 'en'; copy: LandingCopy['hero'] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

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

  function track(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    stage.current?.style.setProperty('--mx', `${((event.clientX - box.left) / box.width) * 100}%`);
    stage.current?.style.setProperty('--my', `${((event.clientY - box.top) / box.height) * 100}%`);
  }

  const design = DESIGN_KEYS[index];
  const order = copy.orders[index % copy.orders.length];

  return (
    <div ref={stage} className={styles.heroStage} onPointerMove={track}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.orbit} aria-hidden="true">
        <span />
        <span />
      </div>

      <div className={styles.qrBadge} aria-hidden="true">
        <svg viewBox="0 0 16 16" shapeRendering="crispEdges">
          {[
            [0, 0],
            [10, 0],
            [0, 10],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="6" height="6" fill="currentColor" />
              <rect x={x + 1} y={y + 1} width="4" height="4" fill="var(--ink)" />
              <rect x={x + 2} y={y + 2} width="2" height="2" fill="currentColor" />
            </g>
          ))}
          {[[9, 1], [11, 2], [13, 1], [9, 4], [12, 4], [10, 6], [14, 6], [7, 9], [9, 9], [12, 10], [14, 9], [10, 12], [13, 13], [8, 14], [7, 12], [1, 8], [3, 8], [5, 7]].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
          ))}
        </svg>
        <i className={styles.qrScan} />
      </div>

      <div onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
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
            <button
              key={key}
              type="button"
              aria-label={copy.designNames[key]}
              aria-pressed={position === index}
              onClick={() => setIndex(position)}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
