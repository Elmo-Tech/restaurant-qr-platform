# Wayta — Restaurant SEO and social sharing

**Status:** implemented on isolated feature branch; tests and user acceptance required; **no automatic production deployment**.
**Stack:** existing Next.js Web + NestJS public QR read API. No new services, package features, DB tables or migrations.

## Goal / behavior

A visitor shares a published GENERIC restaurant menu root such as https://{currentSlug}.waytaapp.com/. The HTML must server-render its own:

- Title, meta description and canonical URL (without a guest session or JavaScript).
- Open Graph title/description/url/site name/image/locale, and Twitter summary_large_image metadata.
- Restaurant schema.org JSON-LD (only published safe fields).
- A same-host 1200×630 /share-card image using the public cover and logo, falling back to a Wayta-branded gradient. Media is read read-only from the private API container, restricted to bounded public /media/ images. To avoid the current ImageResponse Arabic GSUB runtime crash, non-Latin name/description remain accurate in Arabic OG/Twitter HTML metadata while only the ASCII restaurant slug and English explanatory label are drawn inside the PNG.
- Host-specific /robots.txt and /sitemap.xml, each containing only that restaurant if its menu is currently public.

The Wayta marketing homepage keeps its own SEO metadata/canonical and a generic Wayta share image at https://waytaapp.com/share-card. Platform console already has noindex; Staff and login explicitly have noindex.

## Where the restaurant description comes from

The published public Menu already has a localized, staff-maintained menu.description, and Restaurant already has name, coverAssetPath and logoAssetPath. There is **no dedicated Restaurant SEO description column in the current schema**. Use the published menu description; otherwise use an accurate, short localized factual fallback rather than inventing a restaurant bio. A separate editable SEO bio would require separate API/UI/schema approval and migrations.

## Isolation and privacy

- Server-rendered internal GET /public/qr/:slug/menu now forwards only a validated tenant Host. Existing NestJS PublicRestaurantHostGuard enforces the current matching RestaurantSlug. Never forward raw arbitrary Host, cookies or untrusted tenant identifiers.
- Only the validated current tenant gets its social card and sitemap. Missing/inactive/suspended menus and Staff design previews receive noindex; opaque Table QRs are never indexed or listed.
- Old apex /q/{slug} and printed Table QRs remain intact. Former tenant hostnames redirect to a verified current slug through a canonical-only non-rendering legacy lookup; no other tenant menu is returned under an alias.
- Server-side menu GETs are uncached to avoid stale tenant metadata. Social platforms may independently cache image previews.
- No cross-restaurant sitemap enumeration, customer data or tenant Staff pages.

## Release validation (before production)

1. CI: Web typecheck, targeted SEO contracts, existing Guest and tenant-isolation regressions, production image-source validation and a Next production Web build.
2. Two live ACTIVE test restaurants A and B: inspect initial HTML (not just hydrated JS) for different titles, descriptions, canonical, OG/Twitter cards and JSON-LD, and verify share-card returns 200 image/png 1200×630.
3. Verify actual cover/logo and fallback, the correct Arabic name/description in server-rendered OG/Twitter HTML, the ASCII slug in the PNG when the name contains unsupported complex-script glyphs, and public media images in PNG/JPEG/WebP. A separate font-shaping/TTF improvement would be needed to print Arabic name directly inside the PNG.
4. On A host, B's public QR must be rejected with 404 QR_NOT_FOUND; A share-card/sitemap must never display B.
5. Inactive, unknown and suspended hosts and design previews: noindex. Unknown tenant /share-card -> 404; tenant /api/v1/platform -> 404.
6. Wayta marketing homepage SEO/share image, console login and Staff noindex remain unchanged.
7. Test old apex /q/{slug}, former subdomain alias redirect, and printed opaque Table QR links.
8. Use Facebook Sharing Debugger and a fresh WhatsApp share to refresh real crawlers; their prior cache is outside Wayta control. Do not claim production preview verified by CI alone.

## Release and rollback

Merge reviewed PR after CI only. Every main push builds prebuilt GHCR images off-server but never deploys. Separate owner-approved Wayta Production - Approve and Deploy workflow promotes the SHA. Keep existing image rollback SHA and backups; monitor disk, logs and persistent volumes. No new migrations and no shared Traefik/DNS changes.

## ERP

**Title:** Add tenant-scoped SEO and social share previews for Wayta restaurant menus

**Description:** Server-render each restaurant's name, localized description, canonical URL, OG/Twitter card, cover/logo-based 1200x630 social preview, Restaurant JSON-LD, tenant sitemap/robots and noindex for inactive/preview/Table QR; preserve Wayta landing SEO, old QR compatibility and enforce tenant Host in SSR API reads. Validate two-restaurant isolation, crawlers, Arabic/English HTML previews and PNG fallback, and CI before separately approved production deployment.
