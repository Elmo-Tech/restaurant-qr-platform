import { getPublicMenu } from '../../../lib/public-menu/api';
import { GuestStatusPage } from './GuestStatusPage';
import { PublicMenuView } from './PublicMenuView';

interface PublicMenuPageProps {
  params: Promise<{ publicCode: string }>;
  searchParams: Promise<{ lang?: string }>;
}

/**
 * FT-3: the public Guest QR Menu entry point, `/q/[publicCode]`. Deliberately
 * outside `app/staff/` -- no Staff auth gate, no sidebar/header chrome, no
 * login redirect (this route's `layout.tsx` tree is just the shared root
 * layout). A Server Component: the fetch happens before any HTML streams,
 * so the very first response already carries the resolved language and
 * content -- no client-side loading waterfall for the common case, and it
 * works identically with no cookies at all (incognito).
 */
export default async function PublicMenuPage({ params, searchParams }: PublicMenuPageProps) {
  const { publicCode } = await params;
  const { lang } = await searchParams;

  const result = await getPublicMenu(publicCode, lang);

  if (result.outcome === 'notFound') {
    return (
      <GuestStatusPage
        title="This QR code is no longer active."
        message="Please ask a member of staff for help."
      />
    );
  }

  if (result.outcome === 'unavailable') {
    return (
      <GuestStatusPage
        title="Menu unavailable"
        message="This restaurant menu is temporarily unavailable. Please check back soon."
      />
    );
  }

  return <PublicMenuView data={result.data} publicCode={publicCode} />;
}
