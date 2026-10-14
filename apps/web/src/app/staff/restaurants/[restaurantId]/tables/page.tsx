import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canManageTables, canViewTables } from '../../../../../lib/tables/capabilities';
import { getWebOrigin } from '../../../../../lib/env/web-origin';
import { sessionCapabilities } from '../../../../../lib/table-sessions/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { TablesWorkspace } from './TablesWorkspace';

interface TablesPageProps {
  params: Promise<{ restaurantId: string }>;
  /** `?session=` opens that Table Session's panel (Dashboard deep link). */
  searchParams: Promise<{ session?: string | string[] }>;
}

/**
 * FT-4: `/staff/restaurants/[restaurantId]/tables`. Mirrors
 * `MenuManagementPage`'s exact session/Membership/operational-status/
 * capability checks. `membership.branches` (already returned by `/auth/me`,
 * scoped to exactly this Membership's authorized Branches -- all of them if
 * `allBranches`, else only its assigned ones) is passed straight through:
 * there is no separate Branch List fetch to duplicate data the session
 * already carries. `webOrigin` is read once here (Server Component only,
 * never sent to the browser as its own request) and handed down as a plain
 * prop so the QR panel can build the exact `${webOrigin}/q/{publicCode}`
 * Guest URL without hardcoding `localhost`.
 */
export default async function TablesPage({ params, searchParams }: TablesPageProps) {
  const { restaurantId } = await params;
  const { session } = await searchParams;
  const initialSessionId = typeof session === 'string' && session !== '' ? session : null;
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

  if (!canViewTables(membership)) {
    return (
      <Alert variant="error">{t('guard.noPermission.tables')}</Alert>
    );
  }

  return (
    <TablesWorkspace
      restaurantId={restaurantId}
      restaurantName={membership.restaurant.name}
      branches={membership.branches}
      canManage={canManageTables(membership)}
      webOrigin={getWebOrigin()}
      sessionCaps={sessionCapabilities(membership)}
      permissions={membership.permissions}
      qrStyle={membership.restaurant.qrStyle}
      logoAssetPath={membership.restaurant.logoAssetPath}
      initialSessionId={initialSessionId}
      tableOrderingEnabled={membership.restaurant.tableOrderingEnabled}
    />
  );
}
