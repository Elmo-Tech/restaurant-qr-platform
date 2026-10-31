import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../lib/i18n/server';
import { canViewRestaurantSettings } from '../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../components/ui/PageHeader';
import { RestaurantSetupPanel } from '../../../../../components/staff/RestaurantSetupPanel';

/**
 * The REAL guide. Unlike /setup-preview, it never uses synthetic states;
 * the guarded NestJS endpoint computes every step from current data.
 * Old restaurants explicitly opt in. No forced wizard or popup.
 */
export default async function RestaurantSetupPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const [session, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'error') return <Alert variant="error">{session.message}</Alert>;
  const member = session.context.memberships.find(item => item.restaurant.id === restaurantId);
  if (!member) return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  if (member.restaurant.status !== 'ACTIVE') {
    return <Alert variant="error">{t('guard.notOperational', {
      state: t(member.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive'),
    })}</Alert>;
  }
  if (!['OWNER', 'MANAGER'].includes(member.role) ||
      !member.allBranches || !canViewRestaurantSettings(member)) {
    return <Alert variant="error">{t('setup.live.noPermission')}</Alert>;
  }
  const base = '/staff/restaurants/' + encodeURIComponent(restaurantId);
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-5 sm:gap-6">
      <Link href={base}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary shadow-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:rotate-180">
          <path d="M19 12H5m7 7-7-7 7-7" />
        </svg>
        {t('setup.live.back')}
      </Link>
      <PageHeader title={t('setup.title')} description={t('setup.subtitle')} />
      <RestaurantSetupPanel restaurantId={restaurantId} mode="page"
        memberRole={member.role} fullRestaurantScope={member.allBranches} />
    </div>
  );
}
