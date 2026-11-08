import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import {
  canManageMenu,
  canViewMenu,
  hasMenuManagePermission,
} from '../../../../../lib/menu/capabilities';
import { usesMenuImport, usesOffers } from '../../../../../lib/entitlements/access';
import { Alert } from '../../../../../components/ui/Alert';
import { MenuWorkspace } from './MenuWorkspace';

interface MenuManagementPageProps {
  params: Promise<{ restaurantId: string }>;
  /** FT-1, Section 20: `?menuId=&categoryId=` round-tripped from the Product Editor's "Back to Menu" link to restore the selection the User came from -- purely a UX convenience, never authorization. */
  searchParams: Promise<{ menuId?: string; categoryId?: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/menu` (Batch H, Section 3). Mirrors the
 * Restaurant landing page's exact session/Membership/operational-status
 * checks, then additionally requires `menu.view` (UX only -- every real
 * Menu/Category/Product request still goes through its own
 * `PermissionGuard`-protected Backend route independently). Safe,
 * server-validated context is passed into the Client Component workspace;
 * the workspace itself never re-derives authorization, only capability UX
 * hints (Section 5).
 */
export default async function MenuManagementPage({
  params,
  searchParams,
}: MenuManagementPageProps) {
  const { restaurantId } = await params;
  const { menuId: initialMenuId, categoryId: initialCategoryId } = await searchParams;
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
    <MenuWorkspace
      restaurantId={restaurantId}
      restaurantName={membership.restaurant.name}
      currencyCode={membership.restaurant.currencyCode}
      canManage={canManageMenu(membership)}
      canImportMenu={usesMenuImport(membership)}
      offersEnabled={usesOffers(membership)}
      hasMenuManagePermission={hasMenuManagePermission(membership)}
      initialMenuId={initialMenuId}
      initialCategoryId={initialCategoryId}
    />
  );
}
