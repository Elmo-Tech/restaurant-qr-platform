import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import {
  canManageLanguages,
  canViewRestaurantSettings,
} from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { DesignWorkspace } from './DesignWorkspace';

interface DesignSettingsPageProps {
  params: Promise<{ restaurantId: string }>;
}

/**
 * `/staff/restaurants/[restaurantId]/settings/design` (DEC-044). Same session / Membership /
 * operational-status checks as the sibling Settings pages: `restaurant.view` to see it,
 * `restaurant.manage` with Restaurant-wide Branch scope to change it (UX hints only; the
 * Backend guards decide).
 */
export default async function DesignSettingsPage({ params }: DesignSettingsPageProps) {
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
    <DesignWorkspace
      restaurantId={restaurantId}
      canManage={canManageLanguages(membership)}
      initialTemplate={membership.restaurant.menuTemplate}
      allowedTemplates={
        membership.restaurant.allowedTemplates ??
        (membership.restaurant.features.MENU_TEMPLATES
          ? ['CLASSIC', 'LIST', 'GALLERY', 'MENU', 'FLOATING', 'CENTERED', 'COMPACT']
          : ['CLASSIC'])
      }
    />
  );
}
