# Restaurant Owner Contact — Internal Customer Directory

**Branch:** `feat/platform-restaurant-owner-contacts` (based on `feat/restaurant-acquisition-source`; includes PR #14 content).
**Status:** Draft code. No database migration has been applied and no browser/DB QA has run.
**Scope:** Platform Console only (ElmoTech business contacts).

## Product behavior

When an Admin creates a Restaurant, collect:
- **Owner full name** (required in the Platform UI)
- **Contact telephone/mobile** (required in the Platform UI; normalized by Backend)
- **Facebook profile/page** (optional; HTTPS validated to Facebook-owned domains)
- Existing Owner login email/password remain separate identity fields.
- Existing **Acquisition Source** field remains separate: who referred the restaurant is not necessarily its Owner.

The contact belongs to a Restaurant, not the authentication User: a Restaurant can have multiple Owner memberships, but Platform has one designated **primary business contact** record. The contact does not modify Staff membership, account password, Guest-facing restaurant phone, WhatsApp ordering or QR.

## Storage / security

`RestaurantOwnerContact` is a 1:1 Restaurant-owned table with bounded name/phone/Facebook and an additive Prisma migration `20261116100000_restaurant_owner_contacts`; historic restaurants remain without a record and may be corrected by Platform Admin later. Table RLS and revokes block direct public/anon/authenticated access. Only Platform routes can retrieve/edit.

New Platform-created Restaurant stores contact **inside** the existing provisioning transaction along with Restaurant, OWNER, setup and acquisition. The Operations CLI remains compatible without contact. Server-side validation happens before starting provisioning; input errors cannot create a partial account.

Backend uses existing `normalizePhone` / `normalizeUrl('facebookUrl')` rules to avoid duplicate validation behavior. Never persist contact details in Platform Audit payloads (only the fact that details changed).

## Platform Console

- New Restaurant → separate **Restaurant owner contact** card before login credentials, responsive AR/EN.
- Restaurant Directory → search by Restaurant name, public ID, contact person's full name or stored phone, using server-side paged filtering; show person + phone in existing Restaurant cell, not a new crowded table column.
- Restaurant Detail → dedicated contact card with tap-to-call, Facebook link, edit and add flow. Uses authenticated Platform endpoint; safe fallback for old records.

## No-change contract

No impact on Guest, Staff, order, menu, checkout, packages, table sessions or Owner authentication. Do not confuse Facebook page for the Restaurant (public Menu contact) with the owner's *private* Facebook profile.

## Local acceptance / release gate

1. On a disposable or owner-approved backed-up DB only, apply reviewed additive migrations **after inspecting migration history**; never run `start-dev.ps1`, `dev:all`, `dev:restart` or `prisma migrate deploy` blindly.
2. Platform Admin creates an example Restaurant; verify OWNER, Branch, QR, Setup, Acquisition and OwnerContact all exist together, with correct normalized phone and Facebook.
3. Search by customer name / phone; verify multi-page navigation, responsive mobile RTL/LTR, clickable call and Facebook.
4. Update an older Restaurant's contact and verify audit leaves no PII.
5. Verify no exposure of ownerContact in any Staff or Guest API responses and no cross-restaurant leakage.
6. Verify existing CLI provisioning still works without contact and database rollback/integrity safeguards.
7. Only then review against PR #13/#15 and the separate menu-import fix in an integration branch. No merge to main or Production deploy yet.
