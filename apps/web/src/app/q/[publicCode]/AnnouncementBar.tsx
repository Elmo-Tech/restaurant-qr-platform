'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GuestIconClose } from '../../../components/guest/icons';
import { useGuestLocale } from '../../../components/guest/GuestLocale';
import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicAnnouncement } from '../../../lib/public-menu/types';

/** Constant reading speed, in CSS pixels per second. */
const SPEED_PX_PER_SECOND = 55;

type Style = PublicAnnouncement['style'];

const BAR: Record<Style, string> = {
  // An offer is the one that should catch the eye: the brand colour, filled.
  PROMO: 'border-transparent bg-g-accent text-g-on-accent',
  INFO: 'border-g-line bg-g-surface text-g-text',
  WARNING: 'border-[#e0a100]/45 bg-[#2a2210] text-g-text [html[data-theme=light]_&]:bg-[#fff4d6]',
};

/** The bar takes the look of its most eye-catching message: offer, then notice, then information. */
function barStyle(announcements: PublicAnnouncement[]): Style {
  if (announcements.some((a) => a.style === 'PROMO')) return 'PROMO';
  if (announcements.some((a) => a.style === 'WARNING')) return 'WARNING';
  return 'INFO';
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true" focusable="false">
      {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
    </svg>
  );
}

/**
 * The Restaurant's announcements (DEC-042) as ONE slim ticker under the hero, above the
 * ordering bar. The messages sit in a single strip separated by a mark and the strip scrolls
 * continuously (a seamless loop at a constant reading speed), so a Guest who only glances
 * sees movement and every message passes by; short messages simply repeat.
 *
 * Direction follows the menu language (Arabic scrolls the other way). The motion stops
 * while the Guest hovers, touches or focuses it, has a visible pause button (WCAG 2.2.2),
 * and is off entirely under "reduce motion" (the messages then wrap and stay put). Screen
 * readers get a plain list once, not the moving copies. Plain text only, emoji welcome.
 * The close button hides the bar for the rest of the visit (`sessionStorage`, best effort);
 * a changed set of messages shows it again.
 *
 * It renders nothing when there is nothing to say; its parent slot is then empty.
 */
export function AnnouncementBar({
  announcements,
  publicCode,
  copy,
}: {
  announcements: PublicAnnouncement[];
  publicCode: string;
  copy: PublicMenuCopy;
}) {
  const locale = useGuestLocale();
  const isRtl = locale === 'ar';
  const storageKey = `announcements-dismissed:${publicCode}`;
  // What was closed is remembered as a fingerprint of the whole set.
  const fingerprint = announcements.map((a) => `${a.id}:${a.text.length}:${a.text.slice(0, 24)}`).join('|');
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [metrics, setMetrics] = useState({ group: 0, viewport: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLUListElement>(null);

  const hidden = announcements.length === 0 || dismissedFingerprint === fingerprint;

  useEffect(() => {
    // Read after mount so the server render and the first client render are identical.
    queueMicrotask(() => {
      try {
        setDismissedFingerprint(window.sessionStorage.getItem(storageKey));
      } catch {
        // Storage blocked: show it.
      }
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    });
  }, [storageKey]);

  // Measure one copy of the messages and the room it has, again on every resize.
  useEffect(() => {
    if (hidden) return;
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group) return;
    const measure = () => setMetrics({ group: group.scrollWidth, viewport: viewport.clientWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, [hidden, fingerprint, reduceMotion]);

  if (hidden) return null;

  // It always moves (movement is what makes a Guest glance at it), repeating short messages as needed.
  const animating = !reduceMotion && metrics.group > 0 && metrics.viewport > 0;
  // Enough copies per half that the strip always covers the viewport; the loop moves by one half.
  const copiesPerHalf = animating ? Math.max(1, Math.ceil(metrics.viewport / metrics.group)) : 1;
  const distance = metrics.group * copiesPerHalf;
  const running = animating && !userPaused && !touched;
  const style = barStyle(announcements);

  function dismiss() {
    setDismissedFingerprint(fingerprint);
    try {
      window.sessionStorage.setItem(storageKey, fingerprint);
    } catch {
      // Not persisted: it simply comes back on the next visit.
    }
  }

  const trackStyle = animating
    ? ({
        '--announce-shift': `${isRtl ? distance : -distance}px`,
        '--announce-duration': `${Math.max(distance / SPEED_PX_PER_SECOND, 8)}s`,
        animationPlayState: running ? 'running' : 'paused',
      } as CSSProperties)
    : undefined;

  const messages = (ariaHidden: boolean, ref?: React.Ref<HTMLUListElement>) => (
    <ul
      ref={ref}
      aria-hidden={ariaHidden || undefined}
      className={`flex shrink-0 items-center ${reduceMotion ? 'flex-wrap gap-y-1' : 'whitespace-nowrap'}`}
    >
      {announcements.map((announcement, position) => (
        <li key={announcement.id} className="flex items-center">
          <span dir="auto">{announcement.text}</span>
          {position < announcements.length - 1 || animating ? (
            <span aria-hidden="true" className="mx-5 text-[0.7em] opacity-60">
              ✦
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-label={copy.announcementsLabel}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setTouched(true);
      }}
      onPointerLeave={() => setTouched(false)}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse') setTouched(true);
      }}
      onPointerUp={() => setTouched(false)}
      onPointerCancel={() => setTouched(false)}
      onFocus={() => setTouched(true)}
      onBlur={() => setTouched(false)}
      className={`guest-anim-rise flex min-h-[44px] items-center gap-2 rounded-full border ps-5 pe-2 text-[14.5px] font-semibold lg:text-[15.5px] ${BAR[style]}`}
    >
      {/* The marquee itself: decorative for assistive tech, which gets the plain list below. */}
      <div
        ref={viewportRef}
        className="relative min-w-0 flex-1 overflow-hidden py-2.5 [mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-20px),transparent)]"
      >
        <div className={animating ? 'announce-track flex w-max' : 'flex'} style={trackStyle}>
          {messages(false, groupRef)}
          {animating
            ? Array.from({ length: copiesPerHalf * 2 - 1 }, (_, copy) => (
                <div key={copy} className="flex shrink-0">
                  {messages(true)}
                </div>
              ))
            : null}
        </div>
      </div>
      <ul className="sr-only">
        {announcements.map((announcement) => (
          <li key={announcement.id}>{announcement.text}</li>
        ))}
      </ul>

      {animating ? (
        <button
          type="button"
          onClick={() => setUserPaused((value) => !value)}
          aria-pressed={userPaused}
          aria-label={userPaused ? copy.resumeAnnouncements : copy.pauseAnnouncements}
          title={userPaused ? copy.resumeAnnouncements : copy.pauseAnnouncements}
          className="grid size-8 shrink-0 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        >
          <PauseIcon paused={userPaused} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={dismiss}
        aria-label={copy.dismissAnnouncement}
        title={copy.dismissAnnouncement}
        className="grid size-8 shrink-0 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100"
      >
        <GuestIconClose className="size-4" />
      </button>
    </section>
  );
}
