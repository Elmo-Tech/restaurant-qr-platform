import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { canViewBranches } from '../../../../../../lib/branches/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../../components/ui/PageHeader';

type HubKind = 'profile' | 'ordering' | 'branches' | 'languages';

const tones = {
  profile: 'bg-[#fff0df] text-[#a75508]',
  ordering: 'bg-[#e9f5ef] text-[#19744c]',
  branches: 'bg-[#ecf0ff] text-[#5b57a8]',
  languages: 'bg-[#eff5fc] text-[#426d9f]',
} as const;

function SettingsIcon({ kind }: { kind: HubKind }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" className="size-7">
      {kind === 'profile' ? <><path d="M4 20v-9l8-6 8 6v9H4Z"/><path d="M9 20v-6h6v6M8 11h.01M16 11h.01"/></>
        : kind === 'ordering' ? <><path d="M5 8h14l-1 12H6L5 8ZM8 8V6a4 4 0 0 1 8 0v2"/><path d="M9 14h6m-3-3v6"/></>
          : kind === 'branches' ? <><path d="M4 20h16M6 20V9l6-5 6 5v11M9 12h1m4 0h1M9 16h1m4 0h1"/></>
            : <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18"/></>}
    </svg>
  );
}

function SettingCard({ kind, href, title, description, openLabel, lockedLabel, enabled, index }: {
  kind: HubKind; href: string; title: string; description: string;
  openLabel: string; lockedLabel: string; enabled: boolean; index: number;
}) {
  const style = `group flex min-h-[178px] flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all sm:min-h-[210px] sm:p-6 ${enabled
    ? 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
    : 'opacity-65'}`;
  const child = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-12 items-center justify-center rounded-2xl ${tones[kind]}`}><SettingsIcon kind={kind}/></span>
        <span dir="ltr" className="text-xs font-semibold tabular-nums text-muted-foreground">{String(index).padStart(2, '0')} / 04</span>
      </div>
      <div className="flex-1">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center justify-between border-t border-border/75 pt-3 text-sm font-bold text-primary">
        <span>{enabled ? openLabel : lockedLabel}</span>
        {enabled ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" className="size-4 rtl:rotate-180">
            <path d="M5 12h14m-6-6 6 6-6 6"/>
          </svg>
        ) : null}
      </div>
    </>
  );
  return enabled ? <Link href={href} className={style}>{child}</Link>
    : <div aria-disabled="true" className={style}>{child}</div>;
}

/** Navigation-only: the existing settings editors and API endpoints remain authoritative. */
export default async function RestaurantSettingsOverviewPage({ params }: {
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

  const base = `/staff/restaurants/${encodeURIComponent(restaurantId)}/settings`;
  const cards: { kind: HubKind; title: string; description: string; href: string; enabled: boolean }[] = [
    { kind: 'profile', title: t('settingsHub.profile'), description: t('settingsHub.profile.description'), href: base+'/profile', enabled: true },
    { kind: 'ordering', title: t('settingsHub.ordering'), description: t('settingsHub.ordering.description'), href: base+'/ordering', enabled: true },
    // A restaurant viewer may have delivery access without branches.view.
    // Keep that feature discoverable, but do not link to a forbidden Branches page.
    { kind: 'branches',
      title: canViewBranches(member) ? t('settingsHub.branches') : t('settingsHub.delivery'),
      description: canViewBranches(member) ? t('settingsHub.branches.description') : t('settings.delivery.subtitle'),
      href: canViewBranches(member) ? base+'/branches' : base+'/delivery',
      enabled: true },
    { kind: 'languages', title: t('settingsHub.languages'), description: t('settingsHub.languages.description'), href: base+'/languages', enabled: true },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 sm:gap-6">
      <PageHeader title={t('settingsHub.title')} description={t('settingsHub.subtitle')}/>
      <section className="relative isolate overflow-hidden rounded-[20px] bg-[linear-gradient(110deg,#1b232d_0%,#242b37_58%,#3e2a23_100%)] px-5 py-6 text-white shadow-md sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -start-20 -top-24 size-64 rounded-full bg-[#c47625]/20 blur-3xl"/>
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span dir="auto" className="inline-flex max-w-full truncate rounded-full border border-[#91613f] bg-[#4b352c]/70 px-3 py-1 text-[11px] font-semibold text-[#ffd19d]">
              {t('settingsHub.heroBadge', { name: member.restaurant.name })}
            </span>
            <h2 className="mt-3 text-xl font-extrabold leading-tight text-white sm:text-2xl">{t('settingsHub.heroTitle')}</h2>
            <p className="mt-2 max-w-xl text-xs leading-6 text-[#d8dfec] sm:text-sm">{t('settingsHub.heroDescription')}</p>
          </div>
          <span aria-hidden="true" className="flex size-14 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-[#cc7012] text-white shadow-xl sm:size-[72px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" className="size-9">
              <circle cx="12" cy="12" r="3"/><path d="M19 13a7.5 7.5 0 0 0 0-2l2-1.3-2-3.4-2.3.6a7 7 0 0 0-1.7-1L14.6 3h-4l-.4 2.9a7 7 0 0 0-1.7 1l-2.3-.6-2 3.4L6 11a7.5 7.5 0 0 0 0 2l-1.8 1.3 2 3.4 2.3-.6a7 7 0 0 0 1.7 1l.4 2.9h4l.4-2.9a7 7 0 0 0 1.7-1l2.3.6 2-3.4L19 13Z"/>
            </svg>
          </span>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {cards.map((card,i)=><SettingCard key={card.kind} {...card}
          index={i+1} openLabel={t('settingsHub.openPage')} lockedLabel={t('settingsHub.noAccess')}/>)}
      </div>
    </div>
  );
}
