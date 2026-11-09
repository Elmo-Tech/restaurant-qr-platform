import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPublicMenu } from '../../../lib/public-menu/api';
import { getPublicMenuCopy } from '../../../lib/public-menu/copy';
import { parseMenuTemplate } from '../../../lib/public-menu/templates';
import { validRestaurantHostSlug } from '../../../lib/public-menu/restaurant-subdomains';
import { GUEST_THEME_COOKIE } from '../../../lib/public-menu/theme';
import { BrandedMenuPending } from './BrandedMenuPending';
import { GuestStatusPage } from './GuestStatusPage';
import { PublicMenuView } from './PublicMenuView';

interface PublicMenuPageProps {
  params: Promise<{ publicCode: string }>;
  searchParams: Promise<{ lang?: string; template?: string; designPreview?: string }>;
}

/**
 * FT-3: the public Guest QR Menu entry point, `/q/[publicCode]`. Deliberately
 * outside `app/staff/` -- no Staff auth gate, no sidebar/header chrome, no
 * login redirect (this route's `layout.tsx` tree is just the shared root
 * layout).
 *
 * DEC-066: the segment is the Restaurant's readable slug (`/q/el-sherbiny`) or an opaque QR
 * public code (Table QRs, and every link printed or shared before slugs existed). The Backend
 * resolves either; an old generic-QR code or a renamed slug is redirected to the current
 * readable URL, so no existing link breaks. The folder keeps its historical name. A Server Component: the fetch happens before any HTML streams,
 * so the very first response already carries the resolved language and
 * content -- no client-side loading waterfall for the common case, and it
 * works identically with no cookies at all (incognito).
 */
export default async function PublicMenuPage({ params, searchParams }: PublicMenuPageProps) {
  const { publicCode: segment } = await params;
  const { lang, template, designPreview } = await searchParams;

  const result = await getPublicMenu(segment, lang);

  // A Restaurant with an exclusive design whose menu is not published yet: a branded page, not a generic error.
  if (result.outcome === 'unavailable' && result.branding) {
    return <BrandedMenuPending branding={result.branding} copy={getPublicMenuCopy(result.branding.locale)} />;
  }

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

  // QR links printed before this rollout still resolve via the opaque publicCode.
  // Generic menus canonicalize to the restaurant's root hostname; Table QR
  // menus retain /q/{opaquePublicCode} and all their session semantics.
  const { redirectToSlug, publicCode } = result.data.context.entry;
  const query = new URLSearchParams();
  if (lang) query.set('lang', lang);
  if (template) query.set('template', template);
  if (designPreview) query.set('designPreview', designPreview);
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : '';
  const baseDomain = process.env.RESTAURANT_BASE_DOMAIN;
  const shareCode = result.data.context.restaurant.shareCode;
  if (
    baseDomain &&
    result.data.context.qrType === 'GENERIC' &&
    shareCode &&
    validRestaurantHostSlug(shareCode) &&
    designPreview !== '1' // Staff previews must remain embeddable on the apex.
  ) {
    const host = (await headers()).get('host')?.toLowerCase().replace(/:\\d+$/, '');
    const canonicalHost = `${shareCode}.${baseDomain}`;
    if (host !== canonicalHost) {
      redirect(`https://${canonicalHost}/${suffix}`);
    }
  }

  if (redirectToSlug) {
    redirect(`/q/${encodeURIComponent(redirectToSlug)}${suffix}`);
  }

  // The Restaurant's saved template; `?template=` previews another layout (the Staff design picker uses it),
  // but only one the package allows (DEC-043, DEC-051).
  const { allowedTemplates, templatesAllowed } = result.data.context;
  // The exclusive design is shown when the Restaurant chose it; the staff editor can still preview it
  // (`?template=exclusive&designPreview=1`) before choosing. A stock template is shown otherwise.
  const exclusiveKey = result.data.context.restaurant.exclusiveRendererKey;
  const previewExclusive = Boolean(exclusiveKey) && designPreview === '1' && template?.toLowerCase() === 'exclusive';
  const stockTemplate = previewExclusive ? undefined : template;
  const previewAllowed =
    stockTemplate !== undefined &&
    (allowedTemplates ? allowedTemplates.includes(stockTemplate.toUpperCase()) : templatesAllowed !== false);
  // An allowed `?template=` (the staff picker previewing a stock design) wins over the exclusive design.
  const showExclusive =
    Boolean(exclusiveKey) &&
    (previewExclusive || (result.data.context.restaurant.exclusiveInUse !== false && !previewAllowed));
  // The guest's own light / dark pick (null = never chose), so an exclusive design renders it on the first paint.
  const savedTheme = (await cookies()).get(GUEST_THEME_COOKIE)?.value;
  const guestTheme = savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null;
  return (
    <PublicMenuView
      data={result.data}
      guestTheme={guestTheme}
      publicCode={publicCode}
      exclusiveRendererKey={showExclusive ? exclusiveKey : undefined}
      template={parseMenuTemplate(
        (previewAllowed ? stockTemplate : undefined) ?? result.data.context.restaurant.menuTemplate,
      )}
      designPreview={Boolean(
        designPreview === '1' &&
        (showExclusive ||
          (previewAllowed &&
            (template?.toUpperCase() === 'EMBER' || template?.toUpperCase() === 'BLOOM' || template?.toUpperCase() === 'BREW' || template?.toUpperCase() === 'EDITORIAL')))
      )}
    />
  );
}
