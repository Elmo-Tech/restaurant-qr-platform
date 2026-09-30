'use client';

import { useStaffI18n } from '../../../../../lib/i18n/client';
import type { ProductAvailability } from '../../../../../lib/menu/types';
import { Badge } from '../../../../../components/ui/Badge';

/**
 * Small display-only badges shared by the Menu context bar, Category
 * navigation, and Product list (UX-3, Section 11; design-system-v2: thin
 * wrappers over the shared `Badge` primitive, so every status pill in Menu
 * Management shares one visual system instead of each screen re-deriving its
 * own colors). These translate the Backend's exact
 * `ACTIVE`/`INACTIVE`/`AVAILABLE`/`SOLD_OUT` enum values into human-readable
 * labels -- the underlying values themselves are never changed, mapped, or
 * re-derived here.
 */

export function StatusBadge({ active }: { active: boolean }) {
  const { t } = useStaffI18n();
  return (
    <Badge variant={active ? 'success' : 'neutral'} dot>
      {active ? t('common.active') : t('common.inactive')}
    </Badge>
  );
}

export function AvailabilityBadge({ availability }: { availability: ProductAvailability }) {
  const { t } = useStaffI18n();
  const isAvailable = availability === 'AVAILABLE';
  return (
    <Badge variant={isAvailable ? 'success' : 'destructive'} dot>
      {isAvailable ? t('menu.badge.available') : t('menu.badge.soldOut')}
    </Badge>
  );
}

export function FeaturedBadge() {
  const { t } = useStaffI18n();
  return <Badge variant="warning">{t('menu.badge.featured')}</Badge>;
}

export function PrimaryBadge() {
  const { t } = useStaffI18n();
  return <Badge variant="primary">{t('menu.badge.primary')}</Badge>;
}
