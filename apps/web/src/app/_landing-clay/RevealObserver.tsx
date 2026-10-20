'use client';

import { useEffect } from 'react';

/**
 * Scroll reveal for every `[data-reveal]` element on the page (a quiet rise-and-fade as it enters the
 * viewport, optionally staggered with `data-delay`). The hidden start state only applies once this has
 * run (`data-motion="on"` on the page root), so the page is fully readable without JavaScript, and a
 * visitor who prefers reduced motion sees everything at once.
 */
export function RevealObserver() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-landing-root]');
    const targets = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.setAttribute('data-in', '1'));
      return;
    }
    root.setAttribute('data-motion', 'on');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const delay = Number(el.dataset.delay ?? 0);
          window.setTimeout(() => el.setAttribute('data-in', '1'), delay);
          observer.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
