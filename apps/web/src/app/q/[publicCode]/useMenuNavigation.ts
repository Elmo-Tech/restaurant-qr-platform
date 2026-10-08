'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Height of the sticky stack (compact bar 52px + category nav 56px) plus a little breathing room. */
const SPY_OFFSET_PX = 128;

export function categoryDomId(categoryId: string): string {
  return `category-${categoryId}`;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Scroll behaviour for the Guest Menu's category navigation:
 *
 * - `compact`: true once the brand block has scrolled away (the compact bar
 *   slides in; the nav moves beneath it).
 * - `activeId`: the category currently under the sticky stack ("scroll spy"),
 *   computed from section positions on an rAF-throttled passive scroll listener.
 * - `select(id)`: smooth-scrolls to a category and pins it as active until the
 *   programmatic scroll finishes, so the highlight doesn't flicker across the
 *   categories it passes over.
 *
 * Paused while a search is active -- results are a flat filtered list, so there
 * is no meaningful "current category".
 */
export function useMenuNavigation(categoryIds: string[], paused: boolean) {
  const headerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(categoryIds[0] ?? null);
  const lockedRef = useRef(false);
  const lockTimerRef = useRef<number | null>(null);
  const idsKey = categoryIds.join('|');

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused) return;
    const ids = idsKey ? idsKey.split('|') : [];
    if (ids.length === 0) return;
    let frame = 0;

    function update() {
      frame = 0;
      if (lockedRef.current) return;
      let current = ids[0];
      for (const id of ids) {
        const element = document.getElementById(categoryDomId(id));
        if (!element) continue;
        if (element.getBoundingClientRect().top - SPY_OFFSET_PX <= 0) current = id;
        else break;
      }
      // At the very bottom the last (short) section may never reach the offset.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActiveId(atBottom ? ids[ids.length - 1] : current);
    }

    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [idsKey, paused]);

  const select = useCallback((id: string) => {
    const element = document.getElementById(categoryDomId(id));
    if (!element) return;
    setActiveId(id);
    lockedRef.current = true;
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    const unlock = () => {
      lockedRef.current = false;
      window.removeEventListener('scrollend', unlock);
    };
    window.addEventListener('scrollend', unlock, { once: true });
    // Fallback for browsers without `scrollend`.
    lockTimerRef.current = window.setTimeout(unlock, 1100);
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(
    () => () => {
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    },
    [],
  );

  return { headerRef, compact, activeId, select };
}
