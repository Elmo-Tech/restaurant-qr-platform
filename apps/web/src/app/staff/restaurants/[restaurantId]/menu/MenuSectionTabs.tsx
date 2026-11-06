'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import { NavTabs } from '../../../../../components/ui/Tabs';

export type MenuSection = 'products' | 'modifier-library' | 'offers';

/**
 * FT-6B closeout, Section 2 (design-system-v2: rebuilt on the shared
 * `NavTabs` primitive): the Menu Management sub-navigation -- "Menu &
 * Products" / "Modifier Library" -- reachable from every page so Staff can
 * move between them without hunting for an isolated button. "Modifier
 * Library" is the Staff-facing rename of the `ModifierPreset` concept
 * (internal API/model names are unchanged, Section 2's own instruction).
 * "Offers" (DEC-069) is a third tab, shown only when the package includes
 * the Offers feature.
 */
export function MenuSectionTabs({
  restaurantId,
  active,
  offersEnabled = false,
}: {
  restaurantId: string;
  active: MenuSection;
  /** The package includes Offers (UX only; the Backend refuses the rest). */
  offersEnabled?: boolean;
}) {
  const { t } = useStaffI18n();
  return (
    <NavTabs
      ariaLabel={t('menu.section.aria')}
      activeKey={active}
      items={[
        {
          key: 'products',
          label: t('menu.section.products'),
          href: `/staff/restaurants/${restaurantId}/menu`,
        },
        {
          key: 'modifier-library',
          label: t('menu.section.library'),
          href: `/staff/restaurants/${restaurantId}/menu/modifier-presets`,
        },
        ...(offersEnabled
          ? [
              {
                key: 'offers',
                label: t('menu.section.offers'),
                href: `/staff/restaurants/${restaurantId}/menu/offers`,
              },
            ]
          : []),
      ]}
    />
  );
}
