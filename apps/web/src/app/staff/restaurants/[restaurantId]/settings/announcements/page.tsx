import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canManageLanguages,
  canViewRestaurantSettings,
} from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { AnnouncementsWorkspace } from './AnnouncementsWorkspace';

interface AnnouncementsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/announcements` (DEC-042). Same checks and the
 * same capability rule as the other Restaurant Settings pages: `restaurant.view` to see it,
 * `restaurant.manage` plus Restaurant-wide Branch scope to change it (UX hints only; the
 * Backend guards decide).
 */
export default async function AnnouncementsPage({ params }: AnnouncementsPageProps) {
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
  if (!canViewRestaurantSettings(membership)) {
    return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;
  }

  return (
    <AnnouncementsWorkspace
      restaurantId={restaurantId}
      defaultLocale={membership.restaurant.defaultLocale}
      canManage={canManageLanguages(membership)}
    />
  );
}
