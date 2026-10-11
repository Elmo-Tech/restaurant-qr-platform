# Proposal: Bilingual Branch and Delivery Zone Names

Status: **IMPLEMENTED (V1 Final Features, Batch 1, 2026-10-11).** The "expand" and "dual-read" steps below shipped; the "contract" step is intentionally not done. Migration `20261010120000_add_cover_image_and_name_translations`. Implementation notes:

- `name` stays the Restaurant default-locale name and the legacy fallback; it is kept equal to the default-locale translation on every write.
- Staff create/update DTOs accept `translations: [{ locale, name }]`. A non-empty name upserts that locale, an empty name removes it, the default locale can never be removed (`400 DEFAULT_TRANSLATION_REQUIRED`), and a default-locale entry is authoritative for `name`. A legacy client that sends only `name` keeps working.
- Branch and zone responses (Staff) carry `translations`; `/auth/me` branches carry them too so the Staff UI can show its own language with fallback to `name`.
- The public menu resolves requested locale, then default locale, then legacy `name` for the TABLE QR branch, Pickup branches, Delivery branches and zones. The order endpoint accepts an optional display-only `locale` so the confirmation matches the menu language.
- `orders.delivery_zone_name_snapshot` still stores the zone's default-locale name at order time and is never rewritten.
- Backfill: one default-locale row per existing Branch and zone, copied from `name`.

Origin: Guest Menu Final Polish (FT-13B).

## Problem

`Branch.name` and `DeliveryZone.name` are single plain strings (`apps/api/prisma/schema.prisma`). A Restaurant that serves Arabic and English Guests sees the same text in both locales on the Guest checkout, for example `Smoke Branch` next to `وسط البلد`. Menu, Category, Product, Modifier Group and Modifier Option names already have translation tables. These two do not.

## Why it was not done in the polish task

It needs a schema migration and an API contract change. The polish task forbids both. It also touches tenant-scoped Staff CRUD, the public menu DTO and the Order snapshots.

## Proposed model

Follow the existing translation-table pattern (see `ProductTranslation`, `I18N_SPEC.md`), not `name_ar` / `name_en` columns (CLAUDE.md #29).

```text
BranchTranslation        (branchId, locale, name)       unique (branchId, locale)
DeliveryZoneTranslation  (deliveryZoneId, locale, name) unique (deliveryZoneId, locale)
```

- `restaurants.defaultLocale` stays the only default-locale authority (#30). The default-locale translation is required and the others are optional.
- Resolution order when the Guest requests locale L: translation for L, then the default-locale translation, then the legacy `name`.
- Staff DTOs accept `translations: [{ locale, name }]`. The Guest menu DTO returns the resolved `name` only (Guest DTOs stay minimal).

## Backward compatibility (expand, then contract)

1. **Expand.** Add the two tables and backfill one default-locale row per existing Branch and Zone from the current `name`. Keep `name` and keep reading and writing it, so older clients and tests do not break.
2. **Dual-read.** The API resolves by the order above, so a missing translation never produces an empty label.
3. **Contract (later, separately approved).** Make `name` a derived or cache column, or remove it. This is a second migration and is not needed to get the feature.

Custom SQL is not needed. The migration is plain Prisma, with unique indexes only.

## Order snapshots

- `Order.deliveryZoneNameSnapshot` already exists as a single string. Keep it: it is a historical record and must not change when a zone is renamed or translated later.
- Decision to make: which locale the snapshot uses. Recommended: the Restaurant default locale, matching `OrderItem.productNameSnapshot`. Guest-facing order status can then show the snapshot as written, or re-resolve the live zone translation for display. The first is simpler and always historically correct.
- Orders have no Branch name snapshot today and read the live Branch. A rename already changes how history displays. This proposal does not change that. If historical correctness is wanted, add `branchNameSnapshot` as a separate, explicit decision.

## Impact

| Area | Change |
| --- | --- |
| Database | 2 new tables, backfill, indexes |
| API | Staff Branch / Zone create-update DTOs gain `translations`. Guest menu returns a resolved name. OpenAPI regenerated |
| Staff UI | Branch and Zone forms get a per-locale name field (RTL-aware) |
| Guest UI | None. It already renders the string it receives |
| Tests | Resolution fallback, tenant scoping on the new tables, backfill |

## Risks and recovery

- Backfill failure leaves Branches without a translation row. The `name` fallback keeps the Guest menu working while it is re-run.
- Rollback before the contract step is safe: drop the two tables. `name` is untouched throughout.
