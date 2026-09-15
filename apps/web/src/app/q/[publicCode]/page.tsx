import { getPublicMenu } from '../../../lib/public-menu/api';
import { getPublicMenuCopy } from '../../../lib/public-menu/copy';
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

  if (result.outcome === 'notFound' || result.outcome === 'unavailable') {
    // FT-3B, Section 15: neither outcome carries a Backend-resolved locale
    // (an unknown/inactive QR has no Restaurant context to resolve one
    // from) -- the raw `?lang=` the Guest's own URL already carried is the
    // only locale signal available here, and using it leaks nothing new
    // about the Restaurant.
    const copy = getPublicMenuCopy(lang);
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    return (
      <GuestStatusPage
        title={result.outcome === 'notFound' ? copy.qrNotFoundTitle : copy.menuUnavailableTitle}
        message={
          result.outcome === 'notFound' ? copy.qrNotFoundMessage : copy.menuUnavailableMessage
        }
        dir={dir}
      />
    );
  }

  return <PublicMenuView data={result.data} publicCode={publicCode} />;
}
