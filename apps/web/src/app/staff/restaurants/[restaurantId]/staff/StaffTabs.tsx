'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import { NavTabs } from '../../../../../components/ui/Tabs';

export type StaffSectionTab = 'users' | 'roles';

/** Staff & Access local navigation: Users, and the read-only Roles & Permissions view. */
export function StaffTabs({
  restaurantId,
  active,
}: {
  restaurantId: string;
  active: StaffSectionTab;
}) {
  const { t } = useStaffI18n();
  const base = `/staff/restaurants/${restaurantId}/staff`;
  return (
    <NavTabs
      ariaLabel={t('staff.title')}
      activeKey={active}
      items={[
        { key: 'users', label: t('staff.tab.users'), href: base },
        { key: 'roles', label: t('staff.tab.roles'), href: `${base}/roles` },
      ]}
    />
  );
}
