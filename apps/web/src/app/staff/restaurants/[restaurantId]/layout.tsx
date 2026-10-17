import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../lib/auth/session';
import { canViewMenu } from '../../../../lib/menu/capabilities';
import { canViewTables } from '../../../../lib/tables/capabilities';
import { canViewOrders } from '../../../../lib/orders/capabilities';
import { canViewKitchen } from '../../../../lib/kitchen/capabilities';
import { canViewRestaurantSettings } from '../../../../lib/settings/capabilities';
import { canViewStaff } from '../../../../lib/staff/capabilities';
import { resolveAssetUrl } from '../../../../lib/media/asset-url';
import { Alert } from '../../../../components/ui/Alert';
import { StaffShell } from '../../../../components/staff/StaffShell';
import { getStaffI18n } from '../../../../lib/i18n/server';

interface RestaurantWorkspaceLayoutProps {
  params: Promise<{ restaurantId: string }>;
  children: ReactNode;
}

/**
 * Workspace shell for every `/staff/restaurants/[restaurantId]/...` route
 * (UX-1, Section 3). Re-derives session/Membership state independently,
 * mirroring the exact pattern every sibling page under this Restaurant
 * already uses (`RestaurantLandingPage`, `MenuManagementPage`) rather than
 * inventing a new one -- this is navigation/UX chrome only (Section 12).
 * Each page underneath still performs its own identical checks and remains
 * the actual authorization boundary for its own content
 * (CLAUDE.md #21/#82); this layout's checks exist solely to build the
 * sidebar/breadcrumb chrome (Restaurant name/status, `canViewMenu`) and to
 * avoid rendering that chrome around a state that has no valid Restaurant
 * context at all.
 */
export default async function RestaurantWorkspaceLayout({
  params,
  children,
}: RestaurantWorkspaceLayoutProps) {
  const { restaurantId } = await params;
  const [sessionState, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);

  if (sessionState.status === 'unauthenticated') {
    redirect('/login');
  }

  if (sessionState.status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Alert variant="error">{sessionState.message}</Alert>
      </div>
    );
  }

  const membership = sessionState.context.memberships.find(
    (candidate) => candidate.restaurant.id === restaurantId,
  );

  if (!membership) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>
      </div>
    );
  }

  return (
    <StaffShell
      restaurantId={restaurantId}
      restaurantName={membership.restaurant.name}
      restaurantStatus={membership.restaurant.status}
      restaurantLogoUrl={resolveAssetUrl(membership.restaurant.logoAssetPath)}
      userEmail={sessionState.context.user.email}
      canViewMenu={canViewMenu(membership)}
      canViewTables={canViewTables(membership)}
      canViewOrders={canViewOrders(membership)}
      canViewKitchen={canViewKitchen(membership)}
      canViewStaff={canViewStaff(membership)}
      canViewRestaurantSettings={canViewRestaurantSettings(membership)}
    >
      {children}
    </StaffShell>
  );
}
