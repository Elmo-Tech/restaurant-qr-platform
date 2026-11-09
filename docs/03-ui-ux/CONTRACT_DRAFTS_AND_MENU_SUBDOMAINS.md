# Contract drafts, signing images and restaurant subdomains

Owner request, 2026-11-09. Implemented locally; not deployed. This amends the
contract rendering and issuance behavior in DEC-049 and the Restaurant generic
menu link in DEC-066. Subscription pricing and the payment ledger remain Backend
authority; changing the document text does not change either. The editor warns
the administrator to check that they agree before issuing.

## Contract

New paid subscriptions create an editable draft. The Platform administrator can
edit the complete document text, save it, upload the provider's seal and
signature for that contract, and issue one language. A revision check rejects stale saves and uploads. Issuing
freezes the text, language, and the contract's own images. The issued document is
printable through the browser as PDF. An issued document created by this flow
cannot be reopened. Older contracts have no editable document: an administrator
may explicitly reopen one as a draft, taking the current primary business
contact and menu link only where the old snapshot lacks them. This is how the
owner's existing Makhboz contract can be reviewed without deleting its
subscription or payment ledger. There is no automatic change to existing rows.

The editor presents client, service, financial and company details as separate
fields with a live A4 preview. Signature and seal have separate vertical spaces
for each party. The footer identifies Wayta as an ElmoTech application and
shows both websites. A structured, versioned document is stored in the existing
text field; an untouched default from the first editor can be displayed in the
same structured layout. Arbitrary older saved text stays intact and editable as
text. Generated sentences follow edits to their source fields only while their
wording remains unchanged; customized sentences are never rewritten.

This format needs a coordinated frontend/API rollout: a previous frontend does
not understand the structured text. Before any later deployment, account for
old clients and a rollback that would otherwise display the stored JSON as text.

Signing images are stored only inside their individual contract, not as shared
Platform settings or public `/media` files. New contracts start without images;
each draft needs its own uploads. Existing issued image snapshots remain intact.
The old shared image table is removed; existing drafts that previously displayed
its images need them uploaded again. Platform session and Origin checks protect reads and writes; uploads are
limited to 1 MB and validate MIME, magic bytes and dimensions. Only JPEG, PNG and
WebP are allowed. The original file is retained; the signature preview identifies
ink within a white or transparent margin and presents it larger without changing
the saved image. Images uploaded to another contract do not change issued documents. Audit
records contain the action and resource ID, never document text or images.

## Menu hosts

The current slug is a public lookup of that Restaurant's existing GENERIC QR,
never authorization. Table QRs retain `/q/{opaque-code}`. Old path links,
former slugs and generic QR codes retain their existing resolution behavior.
The root of a single-label restaurant subdomain is internally rewritten to
`/q/{slug}`; Guest QR API requests use the same host. The server retains the
existing authorization and QR checks. No wildcard credentialed CORS is added.

`MENU_SUBDOMAIN_ORIGIN` is optional on both API and Web. Unset, links continue
to use the existing configured Web origin and `/q/{slug}`. For a local run set
it to `http://localhost:3000` in both processes and open, for example,
`http://mkhbwz.localhost:3000/`. Once production routing is verified, set it
to `https://waytaapp.com` in both services to produce links such as
`https://makhboz.waytaapp.com`. Changing it does not change old printed links.
The default Powered by link is updated to `https://waytaapp.com/` only when the
previous default was still in use; a custom administrator value is preserved.

## Release procedure

This change has only been exercised locally. Do not assume DNS, certificates,
proxy routing, production data or migration history have been checked.

1. Review the complete change and confirm the three contract/domain migrations
   are included in the release. Take a restorable database backup before the
   migration, following `docs/02-technical/COOLIFY_DEPLOYMENT.md` section 11.
   Record the deployed versions and validate the backup/restore procedure.
2. Schedule a maintenance window and stop traffic to the Platform console and
   API while the new migration, API and frontend are deployed together. Old
   versions do not understand the structured contract document, and the final
   migration removes the former shared image table. Existing issued images in
   their contract snapshots remain; any images that existed *only* in the
   shared table are removed and must be uploaded to each draft again.
3. Keep `MENU_SUBDOMAIN_ORIGIN` empty initially and retain the existing Web
   host and its certificate so already printed QR codes continue to work.
   Verify the migration runner completes successfully and that the API, Web,
   Platform and gateway are healthy. Check an existing contract, draft editing,
   contract-only image uploads, issuing and browser PDF printing.
4. Separately configure wildcard DNS and a valid wildcard TLS certificate in
   the outer proxy, and route `*.waytaapp.com` to the gateway. The exact
   Platform host must take precedence over the wildcard. Check current restaurant
   slugs against all infrastructure hosts, including the actual Platform host.
   Verify a known restaurant, an unknown/inactive restaurant, old path links,
   ordering, and denial of Platform API routes on the restaurant host.
5. Only after those checks, set `MENU_SUBDOMAIN_ORIGIN=https://waytaapp.com`
   for both API and Web (the Coolify compose file passes the same variable to
   both) and redeploy. Check links in the console, dashboard, contract and
   Guest share action, plus the complete Guest ordering flow on a subdomain.

For rollback, stop writes first. A previous frontend can show structured
contract JSON as raw text, and the removed shared image table is not recreated
by rolling the application image back. Restore a verified compatible database
backup only with an explicit plan for reconciling any data written since that
backup; a simple image rollback is not a complete recovery. Keep the previous
Web host and TLS throughout. No server, DNS or certificate is changed by this
branch.

Local release checks include `npm run test:contract-ui`, the API contract HTTP
test against a disposable local database, and the menu URL tests with
`node --test apps/web/src/lib/guest-menu/menu-url.test.mjs`.
