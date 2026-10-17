'use client';

import type { PublicMenuCopy } from '../../../lib/public-menu/copy';
import type { PublicHours } from '../../../lib/public-menu/types';

/** "09:30" -> "9:30 AM" / "٩:٣٠ ص" in the Guest's menu language. The clock is the Branch's own; no time zone conversion. */
export function formatBranchClock(time: string, locale: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2026, 0, 1, hours, minutes)),
  );
}

/** The one line the Guest reads about opening hours, from the Backend's own evaluation. */
export function hoursLabel(hours: PublicHours, copy: PublicMenuCopy, locale: string): string {
  if (hours.open) {
    return hours.closesAt ? copy.openUntil(formatBranchClock(hours.closesAt, locale)) : copy.openNow;
  }
  if (hours.opensAt) {
    const time = formatBranchClock(hours.opensAt.time, locale);
    if (hours.opensAt.dayOffset === 0) return copy.closedOpensToday(time);
    if (hours.opensAt.dayOffset === 1) return copy.closedOpensTomorrow(time);
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 18 + hours.opensAt.dayOfWeek)),
    );
    return copy.closedOpensOn(day, time);
  }
  return hours.temporarilyClosed ? copy.temporarilyClosed : copy.closedNow;
}

/**
 * "Open now" (green) / "Closed · opens at 12:00 PM" (red) pill for the hero. The dot and
 * the words both carry the meaning, so it never relies on colour alone.
 */
export function HoursBadge({
  hours,
  copy,
  locale,
}: {
  hours: PublicHours;
  copy: PublicMenuCopy;
  locale: string;
}) {
  return (
    <p
      className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12.5px] font-bold lg:text-[14px] ${
        hours.open
          ? 'border-[#2f9e5a]/40 bg-[#2f9e5a]/15 text-[#5fd68a]'
          : 'border-[#e5484d]/40 bg-[#e5484d]/15 text-[#ff8a8f]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${hours.open ? 'bg-[#5fd68a]' : 'bg-[#ff8a8f]'}`}
      />
      <span dir="auto">{hoursLabel(hours, copy, locale)}</span>
    </p>
  );
}
