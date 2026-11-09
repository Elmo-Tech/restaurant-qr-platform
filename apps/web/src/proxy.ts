import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { restaurantSlugFromHost } from './lib/public-menu/restaurant-subdomains';

/**
 * Next.js 16 Proxy: preserve the public landing and Staff on the apex while
 * rendering the existing (themed, SSR) /q/[publicCode] Guest UI at restaurant /.
 * Host matching is constrained to one validated subdomain. No direct DB/API
 * access here; the existing public QR resolver remains the only tenant lookup.
 */
export function proxy(request: NextRequest) {
  const baseDomain = process.env.RESTAURANT_BASE_DOMAIN;
  if (!baseDomain) return NextResponse.next(); // Dev/legacy deployments remain unchanged.
  const slug = restaurantSlugFromHost(request.headers.get('host'), baseDomain);
  if (!slug) {
    // A reserved, nested or malformed subdomain must not accidentally render
    // Staff or marketing content if its traffic reaches the Guest container.
    const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '');
    if (host.endsWith(`.${baseDomain}`)) return new NextResponse('Not Found', { status: 404 });
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname === '/') {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = `/q/${slug}`;
    return NextResponse.rewrite(rewritten);
  }

  // Assets and guest API requests must retain the visitor's host. The gateway
  // serves API/media/socket paths and the backend enforces the QR->host tenant.
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/media/') ||
    pathname.startsWith('/socket.io/') ||
    pathname === '/favicon.ico'
  ) return NextResponse.next();

  // A restaurant hostname is never a Staff login, Platform page or an
  // arbitrary /q/{otherTenantQr} host. Keep those routes on the apex.
  const apex = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `https://${baseDomain}`);
  return NextResponse.redirect(apex);
}
