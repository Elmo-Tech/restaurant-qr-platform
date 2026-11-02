# Temporary Demo Restaurants (DEC-060, DEC-061)

Status: implemented. Decisions: `PROJECT_DECISIONS.md` DEC-060 (the demo) and DEC-061 (the kinds of business).

A **demo restaurant** is a complete, private, short-lived restaurant that the Platform team creates for one prospect.
The prospect opens a secret link, lands in the real dashboard with a ready bilingual menu, and uses it. When the time
ends the demo is locked and then removed **completely**. Nothing the prospect does can touch another restaurant.

---

# 1. What a demo is

- A normal `restaurants` row with `is_demo = true`, a hard `demo_expires_at` and a team-only `demo_label`. A database
  CHECK keeps the three fields consistent: a demo always has an expiry, a normal restaurant never has demo fields.
- Created from a **template**, never from a live restaurant: `apps/api/demo-template/<kind>/template.json` and its
  photos, one folder per **kind of business** (section 2b). The templates are plain data shipped with the API image
  (`Dockerfile.api` copies the whole folder), reviewed in git and checked by a unit test, so nobody can change them by
  accident on a server. `restaurants.demo_kind` records the kind (`restaurant`, `cafe`, `sweets`); a demo made before
  kinds existed has a null kind and is shown as a restaurant.
- Default language Arabic, Arabic and English both active, currency EGP. **No package** (every feature the Platform
  gives by default) and **Menu Import is off** (it is opt-in, and a demo already has a full menu).
- The owner is a throw-away `User` (`demo-<uuid>@demo.wayta.invalid`, an address that can never receive mail, and a
  random password nobody knows). The Backend recognizes a demo user by that domain.

# 2. What the template contains

Restaurant "Wayta Bistro" with logo and cover; **2 branches** (always open, so a demo never shows "closed" at the wrong
hour) with **12 tables** and their QR codes and **4 delivery zones** (fee and minimum order); one menu with **7
categories and 24 products**, every product with a **photo**, an Arabic and an English name and description, **sizes**
on the pizzas and some drinks, **extras** (modifier groups) on burgers, pizzas, pasta and the steak, two **discounts**,
four **featured** products, **suggestions** ("goes well with"), two **announcements**, and the `GALLERY` Guest menu
template. The restaurant has **no WhatsApp number** and WhatsApp ordering is **off**: the dashboard's ordering page
tells the visitor to add their own number first (`settings.ordering.whatsappNeedsNumber`), then they can see how
WhatsApp orders look.

The photos are copied once into the upload directory (`demo-template-<name>`) and **shared by every demo**: a demo costs
no disk. A demo cannot upload or delete images and the purge never deletes files, so the shared files are never removed.
Credits (`apps/api/demo-template/CREDITS.md`, also shown at `/demo-credits`) follow the licences.

# 2b. Kinds of business (DEC-061)

The team picks the kind when it creates the demo, so a prospect sees a menu that looks like their own business. Each
kind is a complete template of its own (two branches with tables and delivery zones, a bilingual menu with a photo on
every product, sizes, extras, discounts, featured products, suggestions, announcements, no WhatsApp number) and ends
on its own **signature menu design**:

| Kind | Business name | Menu design | What the menu is |
|---|---|---|---|
| `restaurant` | Wayta Bistro | `GALLERY` | the template above: starters, burgers, pizza, pasta, grills, desserts, drinks (24 products) |
| `cafe` | Wayta Café | `BREW` (forest palette) | hot coffee, cold drinks, tea and juices, bakery and sandwiches, sweets (25 products) |
| `sweets` | Wayta Sweets | `BLOOM` (rose palette) | oriental sweets, cakes, pastries, ice cream and crepes, gift boxes, drinks (26 products; sizes by weight, box or cake size) |

- **Design copy.** BREW and BLOOM have their own copy and palette (`restaurant_template_configs`). A kind's template
  carries it in a `design` block, and the demo stores it as both the draft and the published settings, normalized by
  the same rules the dashboard uses. It is stored **only when the demo ends up on that design**: a Package that does
  not allow the design puts the demo on Classic and no design settings are stored.
- **Photos.** The restaurant keeps the file names it always had (`demo-template-<name>`); the other kinds are prefixed
  (`demo-template-<kind>-<name>`) so two kinds can never overwrite each other. A photo reused by two kinds is a copy in
  each folder. Credits for all kinds are in `CREDITS.md` and `/demo-credits`. The kind's logo is Wayta artwork made for
  the demo (shapes only, no third-party licence).
- **Adding a kind** is a new folder, a value in `DEMO_KINDS` (API) and the console, a `demo_kind` CHECK update and a
  line in the unit test that walks every kind. Nothing else changes.

# 3. Life of a demo

1. **Create** (Platform console, Demos): the kind of business (default restaurant), a label (who it is for) and a duration (1 hour to 14 days; presets 1 h, 4 h, 1
   day, 3 days, 7 days). At most `DEMO_MAX_ACTIVE` (default 20) demos exist at once. The result is the **secret link**,
   shown once. Only the SHA-256 hash of the token is stored (`demo_access_links`).
   The team may also pick an active **Package**: the demo is put on it (`restaurants.package_id`), so the visitor sees
   exactly what that package includes, hidden or locked like a real restaurant on it (DEC-043, DEC-046, DEC-051). The
   demo menu design is the template's when the package allows it, otherwise Classic. No package = every feature. Only
   the dashboard follows the package: the sample content stays complete. No subscription is created, so the
   subscription sweep never touches a demo.
2. **Enter**: `POST /demo/enter { token }` (rate limited like a sign-in) creates an Auth Session for the demo owner
   and sets the usual HttpOnly cookie; the web page `/demo/<token>` then goes to the restaurant's dashboard. The link
   works repeatedly until the demo ends. The session never outlives the demo. A wrong, expired or locked link always
   answers `404 DEMO_LINK_INVALID`.
3. **Use**: the full dashboard, with a banner (demo, time left, photo credits) and the visitor's name shown as "Demo
   visitor" instead of the throw-away address.
4. **Extend / new link / remove now** from the console. A new link replaces the old one.
5. **Expiry**: a job inside the API (`DEMO_SWEEP_SECONDS`, default 60) **locks** a demo that has ended (restaurant
   status `SUSPENDED`, which already blocks sign-in and the Guest menu, and every session of its users is deleted).
   After `DEMO_PURGE_GRACE_MINUTES` (default 60) it is **removed completely**. Extending inside the grace period opens
   it again.

# 4. What a demo may not do (enforced in the Backend)

One list, `apps/api/src/demo/demo-restrictions.ts`, applied by a global middleware, answering `403 DEMO_RESTRICTED`:

| Blocked | Why |
|---|---|
| change password | the owner has no password anyone knows |
| invitations, staff members, roles | no real people are added |
| subscription requests | no commercial actions |
| any image upload or removal (logo, cover, product, category, template pictures) | storage and abuse |
| the whole Menu Import | it spends model quota and the menu is already complete |

Everything else works, including editing the contact details (this is where the visitor enters a WhatsApp number),
orders, the kitchen, tables, settings and menu editing.

# 5. The purge

`apps/api/src/demo/demo-purge.ts`. Refuses anything that is not a demo (`NotADemoError`, checked under a row lock,
before any delete). The plan is computed **from the database's own foreign keys**, not from a hand-kept list:

- tables that have `restaurant_id` are chosen by it; others through their foreign key to a table that is part of the
  demo (composite keys included); a `SET NULL` link (the platform audit log) is left alone, so the audit of "demo
  created / removed" stays, detached;
- children are deleted before parents, each table once; the demo's users are removed afterwards by the same method;
- one transaction with a Postgres advisory lock, so several API instances never purge at once.

The end-to-end test (`test/demo-http.e2e-spec.ts`) looks at **every table that has a `restaurant_id`** after a purge and
requires zero rows for the demo, compares every other restaurant's rows before and after, and checks that a normal
restaurant is refused. A table added later and forgotten fails that test.

# 6. Not part of the demo numbers

Demos are excluded from the Platform console's restaurants list and overview totals (restaurants, branches, products,
orders, "restricted" count). They have their own section.

# 7. Out of scope (possible later)

A public "Try the demo" form, a "send a test order" button, a reset button, linking a demo to a lead, activity tracking,
converting a demo into a trial that keeps its data, seeded order history, and demos with several templates.
