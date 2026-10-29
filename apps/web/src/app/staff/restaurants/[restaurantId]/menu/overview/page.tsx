import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthSessionState } from '../../../../../../lib/auth/session';
import { getStaffI18n } from '../../../../../../lib/i18n/server';
import { canViewMenu } from '../../../../../../lib/menu/capabilities';
import { canViewRestaurantSettings } from '../../../../../../lib/settings/capabilities';
import { canViewTables } from '../../../../../../lib/tables/capabilities';
import { Alert } from '../../../../../../components/ui/Alert';
import { PageHeader } from '../../../../../../components/ui/PageHeader';

interface Props { params: Promise<{ restaurantId: string }> }
type CardKind = 'menus' | 'design' | 'guest' | 'share';
type Tone = 'amber' | 'violet' | 'mint' | 'navy';

const tones: Record<Tone, { icon: string; hover: string }> = {
  amber: { icon: 'bg-[#fff0df] text-[#ab5200]', hover: 'hover:border-[#edb884]' },
  violet: { icon: 'bg-[#f2edff] text-[#7651bd]', hover: 'hover:border-[#bca5e4]' },
  mint: { icon: 'bg-[#e5f6ed] text-[#167e51]', hover: 'hover:border-[#9dceb2]' },
  navy: { icon: 'bg-[#e8f0fa] text-[#315981]', hover: 'hover:border-[#9fb8d4]' },
};

function MenuIcon({ kind, className = 'size-6' }: { kind: CardKind | 'hero'; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      {kind === 'menus' ? <><path d="M4 5h16M4 12h16M4 19h16" /><path d="M7 3v4M7 10v4M7 17v4" /></>
        : kind === 'design' ? <><path d="M4 20l5-1L20 8l-4-4L5 15l-1 5Z" /><path d="m13 7 4 4" /></>
          : kind === 'guest' ? <><path d="m12 2 2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3L12 2Z" /><path d="M20 19h-4M18 17v4" /></>
            : kind === 'share' ? <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM21 14v4m-7 3h4m3 0v-1" /></>
              : <><path d="M12 6c-2.4-1.9-5.5-2.2-9-1v14c3.5-1.2 6.6-.9 9 1 2.4-1.9 5.5-2.2 9-1V5c-3.5-1.2-6.6-.9-9 1Z" /><path d="M12 6v14" /></>}
    </svg>
  );
}

function HubCard({ title, description, href, kind, tone, number, enabled, unavailable, openLabel }: {
  title: string;
  description: string;
  href: string;
  kind: CardKind;
  tone: Tone;
  number: string;
  enabled: boolean;
  unavailable: string;
  openLabel: string;
}) {
  const style = tones[tone];
  const layout = `group grid min-h-[148px] grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-2xl border border-border bg-card p-4 text-start shadow-sm transition-all duration-200 sm:flex sm:min-h-[210px] sm:flex-col sm:gap-4 sm:p-6 ${enabled
    ? `hover:-translate-y-0.5 hover:shadow-lg ${style.hover} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`
    : 'opacity-60'}`;
  const body = (
    <>
      <div className="col-start-1 row-span-2 flex items-start justify-between gap-3 sm:w-full">
        <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${style.icon}`}>
          <MenuIcon kind={kind} className="size-[26px]" />
        </span>
        <span dir="ltr" className="hidden text-xs font-semibold tabular-nums text-muted-foreground/80 sm:inline">
          {number} / 04
        </span>
      </div>
      <div className="col-start-2 row-start-1 min-w-0 sm:w-full">
        <h2 className="text-base font-bold leading-6 text-foreground sm:text-lg">{title}</h2>
        <p className="mt-1.5 text-xs leading-6 text-muted-foreground sm:text-sm">{description}</p>
      </div>
      <div className="col-start-2 row-start-2 flex w-full items-center justify-between gap-3 border-t border-border/70 pt-2 text-xs font-bold text-primary sm:mt-auto sm:pt-3 sm:text-sm">
        <span>{enabled ? openLabel : unavailable}</span>
        {enabled ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" className="size-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        ) : null}
      </div>
    </>
  );
  return enabled
    ? <Link href={href} className={layout}>{body}</Link>
    : <div className={layout} aria-disabled="true">{body}</div>;
}

/** Uses existing permissions and workspaces; no copies of product or design editors. */
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

  const base = `/staff/restaurants/${encodeURIComponent(restaurantId)}`;
  const settings = canViewRestaurantSettings(member);
  const qr = settings && canViewTables(member); // Existing QR page requires both grants.
  const openLabel = t('menuHub.openPage');
  const unavailable = t('menuHub.locked');

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 sm:gap-6">
      <PageHeader title={t('menuHub.title')} description={t('menuHub.subtitle')} />
      <section className="relative isolate overflow-hidden rounded-[20px] bg-[linear-gradient(110deg,#1b232d_0%,#242b37_58%,#3e2a23_100%)] px-5 py-6 text-white shadow-md sm:px-8 sm:py-8">
        <div aria-hidden="true" className="pointer-events-none absolute -start-20 -top-24 size-64 rounded-full bg-[#ba681b]/20 blur-3xl" />
        <div className="relative flex items-center justify-between gap-5">
          <div className="min-w-0">
            <span className="inline-flex max-w-full items-center rounded-full border border-[#91613f] bg-[#4b352c]/70 px-3 py-1 text-[11px] font-semibold text-[#ffd19d]">
              <span dir="auto" className="truncate">{t('menuHub.heroBadge', { name: member.restaurant.name })}</span>
            </span>
            <h2 className="mt-3 text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl">
              {t('menuHub.heroTitle')}
            </h2>
            <p className="mt-2 max-w-xl text-xs leading-6 text-[#d8dfec] sm:text-sm sm:leading-7">
              {t('menuHub.heroDescription')}
            </p>
          </div>
          <span aria-hidden="true" className="flex size-14 shrink-0 -rotate-6 items-center justify-center rounded-2xl bg-[#cc7012] text-white shadow-xl sm:size-[76px] sm:rounded-[20px]">
            <MenuIcon kind="hero" className="size-7 sm:size-10" />
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <HubCard title={t('menuHub.menus')} description={t('menuHub.menus.description')}
          href={base + '/menu'} kind="menus" tone="amber" number="01" enabled
          unavailable={unavailable} openLabel={openLabel} />
        <HubCard title={t('menuHub.design')} description={t('menuHub.design.description')}
          href={base + '/settings/design'} kind="design" tone="violet" number="02" enabled={settings}
          unavailable={unavailable} openLabel={openLabel} />
        <HubCard title={t('menuHub.guest')} description={t('menuHub.guest.description')}
          href={base + '/menu/guest-experience'} kind="guest" tone="mint" number="03" enabled={settings}
          unavailable={unavailable} openLabel={openLabel} />
        <HubCard title={t('menuHub.share')} description={t('menuHub.share.description')}
          href={base + '/settings/guest-qr'} kind="share" tone="navy" number="04" enabled={qr}
          unavailable={unavailable} openLabel={openLabel} />
      </div>
    </div>
  );
}
