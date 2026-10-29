import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewMenu } from '../../../../../../lib/menu/capabilities';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../../components/ui/PageHeader';

/** Lightweight navigation. The original Announcements CRUD and Suggestions pages remain intact. */
export default async function GuestExperiencePage({ params }: {
  params: Promise<{ restaurantId: string }>;
}) {
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
  if (!canViewRestaurantSettings(member)) return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;
  const base = `/staff/restaurants/${restaurantId}`;
  const cards = [
    { name: t('menuHub.announcements'), description: t('menuHub.announcements.description'), href: base + '/settings/announcements' },
    { name: t('menuHub.suggestions'), description: t('menuHub.suggestions.description'), href: base + '/settings/suggestions' },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Link href={base + '/menu/overview'} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
        <span aria-hidden="true" className="rtl:rotate-180">←</span>{t('menuHub.back')}
      </Link>
      <PageHeader title={t('menuHub.guest')} description={t('menuHub.guest.description')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map(card => (
          <Link key={card.href} href={card.href}
            className="flex min-h-44 flex-col justify-between gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-6">
            <span className="flex flex-col gap-2">
              <span className="text-lg font-bold text-foreground">{card.name}</span>
              <span className="text-sm leading-6 text-muted-foreground">{card.description}</span>
            </span>
            <span aria-hidden="true" className="self-end text-xl text-primary rtl:rotate-180">→</span>
          </Link>
        ))}
      </div>
      <Link href={base + '/menu'} className="w-fit text-sm font-semibold text-primary underline underline-offset-4">{t('menuHub.productSuggestionsLink')}</Link>
    </div>
  );
}
