import Link from 'next/link';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewMenu } from '../../../../../../lib/menu/capabilities';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { canViewTables } from '../../../../../../lib/tables/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../../components/ui/PageHeader';

interface Props { params: Promise<{ restaurantId: string }> }

function HubCard({ title, description, href, icon, enabled, unavailable }: {
  title: string; description: string; href: string; icon: ReactNode;
  enabled: boolean; unavailable: string;
}) {
  const body = (
    <>
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-lg font-bold text-foreground">{title}</span>
        <span className="text-sm leading-6 text-muted-foreground">{description}</span>
        {!enabled ? <span className="text-xs text-muted-foreground">{unavailable}</span> : null}
      </span>
      {enabled ? <span aria-hidden="true" className="text-2xl text-primary rtl:rotate-180">→</span> : null}
    </>
  );
  const classes = 'flex min-h-44 items-start gap-4 rounded-2xl border border-border bg-card p-5 text-start shadow-sm transition-colors sm:p-6';
  return enabled
    ? <Link href={href} className={classes + ' hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'}>{body}</Link>
    : <div className={classes + ' opacity-65'} aria-disabled="true">{body}</div>;
}

const icon = (path: string) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-6">
    <path d={path} />
  </svg>
);

/** Navigation-only hub. Existing menu and settings screens stay authoritative. */
export default async function MenuOverviewPage({ params }: Props) {
  const { restaurantId } = await params;
  const [session, { t }] = await Promise.all([getAuthSessionState(), getStaffI18n()]);
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'error') return <Alert variant="error">{session.message}</Alert>;
  const member = session.context.memberships.find(m => m.restaurant.id === restaurantId);
  if (!member) return <Alert variant="error">{t('guard.restaurantNotFound')}</Alert>;
  if (member.restaurant.status !== 'ACTIVE') {
    return <Alert variant="error">{t('guard.notOperational', {
      state: t(member.restaurant.status === 'SUSPENDED' ? 'guard.state.suspended' : 'guard.state.inactive'),
    })}</Alert>;
  }
  if (!canViewMenu(member)) return <Alert variant="error">{t('guard.noPermission.menu')}</Alert>;

  const base = `/staff/restaurants/${restaurantId}`;
  const settings = canViewRestaurantSettings(member);
  // The existing QR settings route additionally needs tables.view.
  const qr = settings && canViewTables(member);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('menuHub.title')} description={t('menuHub.subtitle')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:gap-5">
        <HubCard title={t('menuHub.menus')} description={t('menuHub.menus.description')} href={base + '/menu'}
          enabled icon={icon('M4 5h16M4 12h16M4 19h16')} unavailable={t('menuHub.locked')} />
        <HubCard title={t('menuHub.design')} description={t('menuHub.design.description')} href={base + '/settings/design'}
          enabled={settings} icon={icon('M4 20l5-1 11-11-4-4L5 15l-1 5ZM14 6l4 4')} unavailable={t('menuHub.locked')} />
        <HubCard title={t('menuHub.guest')} description={t('menuHub.guest.description')} href={base + '/menu/guest-experience'}
          enabled={settings} icon={icon('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16v5M16.5 18.5h5')} unavailable={t('menuHub.locked')} />
        <HubCard title={t('menuHub.share')} description={t('menuHub.share.description')} href={base + '/settings/guest-qr'}
          enabled={qr} icon={icon('M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3M20 14v3M14 20h6')} unavailable={t('menuHub.locked')} />
      </div>
    </div>
  );
}
