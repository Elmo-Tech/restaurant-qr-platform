'use client';

import { useCallback, useEffect, useState } from 'react';
import { INTRO_COOKIE, INTRO_DURATION_MS } from './intro';
import styles from './landing.module.css';

/**
 * The Wayta intro (the QR scans, its dots fly into the smiling cloche, the wordmark settles in), shown over
 * the landing page the first time a visitor opens it in a session. It never makes anyone wait: the page is
 * already loaded underneath, a click, a key or "Skip" ends it at once, it ends by itself after the animation,
 * and it is not rendered at all for returning visitors (the server knows from the session cookie) or for a
 * visitor who prefers reduced motion. Without JavaScript a CSS animation fades it out on its own.
 */
export function BrandIntro({ skipLabel }: { skipLabel: string }) {
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const finish = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => setGone(true), 450);
  }, []);

  useEffect(() => {
    // remember it for this session, so a reload or a second page does not replay it
    document.cookie = `${INTRO_COOKIE}=1; path=/; samesite=lax`;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const timer = window.setTimeout(finish, INTRO_DURATION_MS);
    const onKey = () => finish();
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      root.style.overflow = previous;
    };
  }, [finish]);

  useEffect(() => {
    if (gone) document.documentElement.style.overflow = '';
  }, [gone]);

  if (gone) return null;

  return (
    <div className={styles.intro} data-leaving={leaving ? '1' : undefined} onClick={finish} aria-hidden="true">
      {/* the light and dark animations; only the one for the active theme is shown (the other is never fetched) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${styles.introArt} ${styles.introArtLight}`} src="/brand/wayta-intro-scan-light.svg" alt="" loading="lazy" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={`${styles.introArt} ${styles.introArtDark}`} src="/brand/wayta-intro-scan-dark.svg" alt="" loading="lazy" decoding="async" />
      <button type="button" className={styles.introSkip} onClick={finish} tabIndex={-1}>
        {skipLabel}
      </button>
    </div>
  );
}
