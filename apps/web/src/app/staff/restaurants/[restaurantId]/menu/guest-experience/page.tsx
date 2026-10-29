import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../../components/ui/PageHeader';
import { MenuHubBackLink } from '../../../../../../components/staff/MenuHubBackLink';

/** Navigation only: real announcement CRUD and suggestion modes are the existing workspaces. */
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
  if (!canViewRestaurantSettings(member)) return <Alert variant="error">{t('guard.noPermission.settings')}</Alert>;

  const base = `/staff/restaurants/${encodeURIComponent(restaurantId)}`;
  const sections = [
    {
      key: 'announcements',
      title: t('menuHub.announcements'),
      subtitle: t('menuHub.announcements.description'),
      description: t('menuHub.announcementsDetails'),
      label: t('menuHub.announcementsTag'),
      action: t('menuHub.manageAnnouncements'),
      href: base + '/settings/announcements',
      enabled: true,
      iconBg: 'bg-[#fff0e4] text-[#ad5c13]',
      options: [
        t('announcements.add'),
        t('announcements.dialog.edit'),
        t('announcements.preview'),
      ],
    },
    {
      key: 'suggestions',
      title: t('menuHub.suggestions'),
      subtitle: t('menuHub.suggestions.description'),
      description: t('menuHub.suggestionsDetails'),
      label: t('menuHub.suggestionsTag'),
      action: t('menuHub.manageSuggestions'),
      href: base + '/settings/suggestions',
      enabled: Boolean(member.restaurant.features.SMART_SUGGESTIONS),
      iconBg: 'bg-[#f0eaff] text-[#7b4eb5]',
      options: [
        t('suggestions.mode.off'),
        t('suggestions.mode.manual'),
        t('suggestions.mode.auto'),
        t('suggestions.mode.both'),
      ],
    },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 sm:gap-6">
      <MenuHubBackLink restaurantId={restaurantId} parent="hub" />
      <PageHeader title={t('menuHub.guest')} description={t('menuHub.guest.description')} />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        {sections.map(section => (
          <article key={section.key} className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:gap-6 sm:p-7">
            <div className="flex items-start gap-3.5">
              <span aria-hidden="true" className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${section.iconBg}`}>
                {section.key === 'announcements' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="size-7">
                    <path d="m12 3 2.5 5.4 6 .8-4.4 4.1 1.1 6-5.2-2.9-5.2 2.9 1.1-6-4.4-4.1 6-.8L12 3Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" className="size-7">
                    <path d="m12 2 2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6L12 2ZM19 17v5M16.5 19.5h5" />
                  </svg>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-foreground">{section.title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{section.subtitle}</p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center rounded-full border border-[#efcfac] bg-[#fff5e9] px-3 py-1 text-xs font-bold text-[#95500c]">
              {section.enabled ? section.label : t('features.suggestions.locked')}
            </span>

            <p className="text-sm leading-7 text-muted-foreground">{section.description}</p>

            <div className="flex flex-wrap gap-2">
              {section.options.map((item, index) => (
                <span key={index} className="rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground">
                  {item}
                </span>
              ))}
            </div>

            <div className="mt-auto pt-1">
              {section.enabled ? (
                <Link href={section.href}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto">
                  {section.action}
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:rotate-180">
                    <path d="M5 12h14m-6-6 6 6-6 6" />
                  </svg>
                </Link>
              ) : (
                <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  {t('features.suggestions.locked')}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#efd9b7] bg-[#fff8ed] px-4 py-3 text-xs leading-6 text-[#80511d] sm:text-sm">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5 shrink-0">
          <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 10v7m0-11v1" />
        </svg>
        <span>{t('menuHub.guestTip')}</span>
        <Link href={base + '/menu'} className="font-bold underline underline-offset-4">{t('menuHub.productSuggestionsLink')}</Link>
      </div>
    </div>
  );
}
