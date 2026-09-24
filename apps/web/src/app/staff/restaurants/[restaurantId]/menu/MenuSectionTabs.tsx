'use client';

import Link from 'next/link';
import { useStaffI18n } from '../../../../../lib/i18n/client';

export type MenuSection = 'products' | 'modifier-library';

/**
 * FT-6B closeout, Section 2: the Menu Management sub-navigation --
 * "Menu & Products" / "Modifier Library" -- reachable from both pages so
 * Staff can move between them without hunting for an isolated button.
 * "Modifier Library" is the Staff-facing rename of the `ModifierPreset`
 * concept (internal API/model names are unchanged, Section 2's own
 * instruction). Plain `<Link>`s, not a client-side tab switcher -- each
 * destination is already its own real route.
 */
export function MenuSectionTabs({
  restaurantId,
  active,
}: {
  restaurantId: string;
  active: MenuSection;
}) {
  const { t } = useStaffI18n();
  const tabs: { key: MenuSection; label: string; href: string }[] = [
    { key: 'products', label: t('menu.section.products'), href: `/staff/restaurants/${restaurantId}/menu` },
    {
      key: 'modifier-library',
      label: t('menu.section.library'),
      href: `/staff/restaurants/${restaurantId}/menu/modifier-presets`,
    },
  ];

  return (
    <nav
      aria-label={t('menu.section.aria')}
      className="flex flex-wrap gap-1 border-b border-[#E5DED6]"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-[#7A5138] text-[#7A5138]'
                : 'border-transparent text-[#655D56] hover:text-[#302C29]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
