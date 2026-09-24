import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../../lib/i18n/server';
import { canManageMenu, canViewMenu } from '../../../../../../../lib/menu/capabilities';
import { Alert } from '../../../../../../../components/ui/Alert';
import { ProductEditor } from '../ProductEditor';

interface NewProductPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/menu/products/new` (FT-1, Section 9).
 * Mirrors `MenuManagementPage`'s exact session/Membership/operational-status
 * checks, then additionally requires `menu.manage` AND `allBranches` --
 * unlike the read-only `/menu` page, this route is mutation-only, so a
 * Membership without full manage authority is refused the page entirely
 * rather than shown a read-only editor (Section 16).
 */
export default async function NewProductPage({ params }: NewProductPageProps) {
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

  if (!canViewMenu(membership) || !canManageMenu(membership)) {
    return (
      <Alert variant="error">{t('guard.noPermission.menuManage')}</Alert>
    );
  }

  return (
    <ProductEditor
      restaurantId={restaurantId}
      currencyCode={membership.restaurant.currencyCode}
      canManage
      mode="create"
    />
  );
}
