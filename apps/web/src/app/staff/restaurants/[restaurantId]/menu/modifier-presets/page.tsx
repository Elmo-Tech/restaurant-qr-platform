import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canManageMenu,
  canViewMenu,
  hasMenuManagePermission,
} from '../../../../../../lib/menu/capabilities';
import { usesOffers } from '../../../../../../lib/entitlements/access';
import { Alert } from '../../../../../../components/ui/Alert';
import { ModifierPresetsWorkspace } from './ModifierPresetsWorkspace';

interface ModifierPresetsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/menu/modifier-presets` (FT-6B, Section
 * 7). Mirrors `MenuManagementPage`'s exact session/Membership/operational-
 * status/`menu.view` checks -- a Modifier Preset is Restaurant-wide
 * configuration, same authorization surface as Menu/Category/Product.
 */
export default async function ModifierPresetsPage({ params }: ModifierPresetsPageProps) {
  const { restaurantId } = await params;
  const { t } = await getStaffI18n();
  const sessionState = await getAuthSessionState();

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return <Alert variant="error">{sessionState.message}</Alert>;
  }

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  }

  if (membership.restaurant.status !== 'ACTIVE') {
    return (
      <Alert variant="error">
        {t('guard.notOperational', {
          state: t(
            membership.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive',
          ),
        })}
      </Alert>
    );
  }

  if (!canViewMenu(membership)) {
    return (
      <Alert variant="error">{t('guard.noPermission.menu')}</Alert>
    );
  }

  return (
    <ModifierPresetsWorkspace
      restaurantId={restaurantId}
      currencyCode={membership.restaurant.currencyCode}
      canManage={canManageMenu(membership)}
      hasMenuManagePermission={hasMenuManagePermission(membership)}
      offersEnabled={usesOffers(membership)}
    />
  );
}
