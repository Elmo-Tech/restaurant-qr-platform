'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { ProductAvailability } from '../../../../../lib/menu/types';

/**
 * Small display-only badges shared by the Menu context bar, Category
 * navigation, and Product list (UX-3, Section 11). These translate the
 * Backend's exact `ACTIVE`/`INACTIVE`/`AVAILABLE`/`SOLD_OUT` enum values
 * into human-readable labels -- the underlying values themselves are never
 * changed, mapped, or re-derived here.
 */

export function StatusBadge({ active }: { active: boolean }) {
  const { t } = useStaffI18n();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        active
          ? 'bg-[#2F6B4F]/10 text-[#2F6B4F]'
          : 'bg-[#8A8177]/10 text-[#8A8177]'
      }`}
    >
      {active ? t('common.active') : t('common.inactive')}
    </span>
  );
}

export function AvailabilityBadge({
  availability,
}: {
  availability: ProductAvailability;
}) {
  const { t } = useStaffI18n();
  const isAvailable = availability === 'AVAILABLE';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isAvailable
          ? 'bg-[#2F6B4F]/10 text-[#2F6B4F]'
          : 'bg-[#B3261E]/10 text-[#B3261E]'
      }`}
    >
      {isAvailable ? t('menu.badge.available') : t('menu.badge.soldOut')}
    </span>
  );
}

export function FeaturedBadge() {
  const { t } = useStaffI18n();
  return (
    <span className="inline-flex items-center rounded-full bg-[#C89B6D]/20 px-2 py-0.5 text-xs font-medium text-[#7A5138]">
      {t('menu.badge.featured')}
    </span>
  );
}

export function PrimaryBadge() {
  const { t } = useStaffI18n();
  return (
    <span className="inline-flex items-center rounded-full bg-[#7A5138]/10 px-2 py-0.5 text-xs font-medium text-[#7A5138]">
      {t('menu.badge.primary')}
    </span>
  );
}
