'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { LandingCopy } from './copy';
import { DISHES, PhoneFrame } from './PhoneScreens';
import styles from './landing.module.css';

/**
 * "How it works" as a story told by one device. The steps scroll on one side; on the other a sticky phone
 * goes through scanning, ordering and "order received", and a kitchen screen slides in for the last step
 * with the new ticket. The step in the middle of the viewport decides the scene.
 */
export function Journey({ locale, copy }: { locale: 'ar' | 'en'; copy: LandingCopy['journey'] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const money = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US');
  const cur = locale === 'ar' ? 'ج.م' : 'EGP';

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      // wide screens: the step in the middle of the viewport; narrow ones: the step just under the sticky device
      { rootMargin: window.matchMedia('(max-width: 899px)').matches ? '-58% 0px -12% 0px' : '-42% 0px -42% 0px' },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.journey}>
      <ol className={styles.journeySteps}>
        {copy.steps.map((step, index) => (
          <li
            key={step.title}
            ref={(el) => {
              refs.current[index] = el;
            }}
            data-step={index}
            data-active={active === index ? '1' : undefined}
            className={styles.journeyStep}
          >
            <span className={styles.journeyNo}>{money.format(index + 1)}</span>
            <span className={styles.journeyTag}>{step.tag}</span>
            <h3 className={styles.journeyTitle}>{step.title}</h3>
            <p>{step.text}</p>
          </li>
        ))}
      </ol>

      <div className={styles.journeyStageWrap}>
        <div className={styles.journeyStage} data-scene={active}>
          <div className={styles.journeyHalo} aria-hidden="true" />

          <PhoneFrame className={styles.journeyPhone}>
            {/* scene 1: scanning */}
            <div className={`${styles.scene} ${styles.sceneScan}`} data-on={active === 0 ? '1' : undefined}>
              <div className={styles.camera}>
                <span className={styles.finder}>
                  <i /><i /><i /><i />
                  <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
                    {[[0, 0], [10, 0], [0, 10]].map(([x, y]) => (
                      <g key={`${x}-${y}`}>
                        <rect x={x} y={y} width="6" height="6" fill="#fff" />
                        <rect x={x + 1} y={y + 1} width="4" height="4" fill="#0f0d0b" />
                        <rect x={x + 2} y={y + 2} width="2" height="2" fill="#fff" />
                      </g>
                    ))}
                    {[[9, 1], [11, 2], [13, 1], [9, 4], [12, 4], [10, 6], [14, 6], [7, 9], [9, 9], [12, 10], [14, 9], [10, 12], [13, 13], [8, 14], [7, 12], [1, 8], [3, 8], [5, 7]].map(([x, y]) => (
                      <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#fff" />
                    ))}
                  </svg>
                  <b className={styles.finderLine} />
                </span>
                <p>{copy.scan}</p>
                <small>{copy.scanHint}</small>
              </div>
            </div>

            {/* scene 2: ordering */}
            <div className={`${styles.scene} ${styles.sceneCart}`} data-on={active === 1 ? '1' : undefined}>
              <div className={`${styles.scr} ${styles.scrClassic}`}>
                <div className={styles.scrHead}>
                  <b>{locale === 'ar' ? 'مطعم الأصيل' : 'Al Aseel Grill'}</b>
                  <span className={styles.scrLang}>{locale === 'ar' ? 'EN' : 'ع'}</span>
                </div>
                <div className={styles.scrRows}>
                  {DISHES.slice(0, 3).map((dish, index) => (
                    <div key={dish.image} className={styles.scrRow}>
                      <span className={styles.scrThumb}>
                        <Image src={dish.image} alt="" fill sizes="56px" style={{ objectFit: 'cover' }} />
                      </span>
                      <span className={styles.scrRowText}>
                        <b>{dish.name[locale]}</b>
                        <em>{`${money.format(dish.price)} ${cur}`}</em>
                      </span>
                      <span className={styles.scrPlus} style={{ animationDelay: `${index * 0.9}s` }}>
                        +
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.cartBar}>
                  <span className={styles.cartCount}>
                    <i>{money.format(1)}</i>
                    <i>{money.format(2)}</i>
                    <i>{money.format(3)}</i>
                  </span>
                  <b>{copy.cart}</b>
                  <em>{`${money.format(450)} ${cur}`}</em>
                </div>
              </div>
            </div>

            {/* scene 3: order received */}
            <div className={`${styles.scene} ${styles.sceneSent}`} data-on={active === 2 ? '1' : undefined}>
              <div className={styles.sentBox}>
                <span className={styles.sentMark}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                <b>{copy.sent}</b>
                <small>{copy.sentHint}</small>
                <span className={styles.sentBar}>
                  <i />
                </span>
              </div>
            </div>
          </PhoneFrame>

          <div className={styles.board} data-on={active === 2 ? '1' : undefined}>
            <div className={styles.boardHead}>
              <b>{copy.board.title}</b>
              <span className={styles.boardLive}>LIVE</span>
            </div>
            <div className={styles.boardCols}>
              {copy.board.cols.map((col, index) => (
                <div key={col} className={styles.boardCol}>
                  <small>{col}</small>
                  {index === 0 ? (
                    <div className={`${styles.boardTicket} ${styles.boardTicketNew}`}>
                      <b>{copy.board.ticketTable}</b>
                      <span>{copy.board.ticketItems}</span>
                      <em>{copy.board.fresh}</em>
                    </div>
                  ) : null}
                  {index === 1 ? (
                    <div className={styles.boardTicket}>
                      <b>{locale === 'ar' ? 'طاولة ٣' : 'Table 3'}</b>
                      <span>{locale === 'ar' ? '١ بيتزا' : '1 pizza'}</span>
                    </div>
                  ) : null}
                  {index === 2 ? (
                    <div className={`${styles.boardTicket} ${styles.boardTicketDone}`}>
                      <b>{locale === 'ar' ? 'استلام #١٠٩' : 'Pickup #109'}</b>
                      <span>{locale === 'ar' ? '٢ باستا' : '2 pasta'}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
