'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { MessageKey } from '../../../../../lib/i18n/messages';
import { NavTabs } from '../../../../../components/ui/Tabs';

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
    <NavTabs
      ariaLabel={t('settings.title')}
      activeKey={active}
      items={TABS.map((tab) => ({
        key: tab.key,
        label: t(tab.label),
        href: `/staff/restaurants/${restaurantId}/settings/${tab.path}`,
      }))}
    />
  );
}
