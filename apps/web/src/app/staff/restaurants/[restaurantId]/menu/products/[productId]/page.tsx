import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../../lib/i18n/server';
import { canManageMenu, canViewMenu } from '../../../../../../../lib/menu/capabilities';
import { Alert } from '../../../../../../../components/ui/Alert';
import { ProductEditor } from '../ProductEditor';

interface EditProductPageProps {
  params: Promise<{ restaurantId: string; productId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/menu/products/[productId]` (FT-1,
 * Section 9/13). Same session/Membership/operational-status/`menu.manage`
 * checks as the `new` route -- see its docstring for the full rationale.
 */
export default async function EditProductPage({ params }: EditProductPageProps) {
  const { restaurantId, productId } = await params;
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
      mode="edit"
      productId={productId}
    />
  );
}
