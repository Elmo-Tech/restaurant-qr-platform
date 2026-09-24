'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';

export type SettingsSection = 'languages' | 'delivery';

const TABS: { key: SettingsSection; label: MessageKey; path: string }[] = [
  { key: 'languages', label: 'settings.tab.languages', path: 'languages' },
  { key: 'delivery', label: 'settings.tab.delivery', path: 'delivery' },
];

/**
 * Restaurant Settings local navigation (LOC-3, Section 19; FT-8 adds
 * Delivery). Only sections that actually exist are shown -- General and
 * Branding are not implemented yet and are deliberately NOT rendered (no
 * disabled placeholder tabs). Adding one later means adding one entry to
 * TABS and its route.
 */
export function SettingsTabs({
  restaurantId,
  active,
}: {
  restaurantId: string;
  active: SettingsSection;
}) {
  const { t } = useStaffI18n();
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[#E5DED6]">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/staff/restaurants/${restaurantId}/settings/${tab.path}`}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-[#7A5138] text-[#7A5138]'
                : 'border-transparent text-[#655D56] hover:text-[#302C29]'
            }`}
          >
            {t(tab.label)}
          </Link>
        );
      })}
    </div>
  );
}
