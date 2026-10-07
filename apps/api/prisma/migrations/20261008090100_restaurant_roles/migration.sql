-- FT-12C: Restaurant-scoped Roles. Every Restaurant gets its five starter Roles (seeded
-- from the V1 Role -> Permission matrix that was previously hard-coded), and every
-- existing Membership is linked to the Role of its current kind. A Membership whose
-- Role cannot be resolved makes the final SET NOT NULL fail, which aborts the whole
-- migration -- access is never silently lost.

CREATE TABLE "restaurant_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "kind" "restaurant_membership_role" NOT NULL,
    "permissions" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_roles_restaurant_id_name_normalized_key"
    ON "restaurant_roles"("restaurant_id", "name_normalized");

CREATE INDEX "restaurant_roles_restaurant_id_idx" ON "restaurant_roles"("restaurant_id");

-- At most one Role per starter kind (OWNER, MANAGER, CASHIER, KITCHEN, WAITER) per
-- Restaurant; any number of CUSTOM Roles. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "restaurant_roles_one_per_starter_kind"
    ON "restaurant_roles"("restaurant_id", "kind")
    WHERE "kind" <> 'CUSTOM';

ALTER TABLE "restaurant_roles"
    ADD CONSTRAINT "restaurant_roles_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the five starter Roles for every existing Restaurant.
INSERT INTO "restaurant_roles" ("restaurant_id", "name", "name_normalized", "kind", "permissions")
SELECT r."id", t."name", lower(t."name"), t."kind"::"restaurant_membership_role", t."permissions"
FROM "restaurants" r
CROSS JOIN (
    VALUES
    ('Owner', 'OWNER', ARRAY['restaurant.view','restaurant.manage','branches.view','branches.manage','users.view','users.manage','roles.manage','tables.view','tables.manage','menu.view','menu.manage','promotions.view','promotions.manage','orders.view','orders.accept','orders.reject','orders.cancel','orders.markServed','kitchen.view','kitchen.update','sessions.view','sessions.resume','sessions.settle','sessions.close','serviceRequests.view','serviceRequests.handle','analytics.view','integrations.view','integrations.manage']::TEXT[]),
    ('Manager', 'MANAGER', ARRAY['restaurant.view','branches.view','branches.manage','users.view','users.manage','tables.view','tables.manage','menu.view','menu.manage','promotions.view','promotions.manage','orders.view','orders.accept','orders.reject','orders.cancel','orders.markServed','kitchen.view','kitchen.update','sessions.view','sessions.resume','sessions.settle','sessions.close','serviceRequests.view','serviceRequests.handle','analytics.view','integrations.view']::TEXT[]),
    ('Cashier', 'CASHIER', ARRAY['restaurant.view','branches.view','tables.view','menu.view','promotions.view','orders.view','orders.accept','orders.reject','orders.cancel','orders.markServed','sessions.view','sessions.resume','sessions.settle','sessions.close','serviceRequests.view','serviceRequests.handle']::TEXT[]),
    ('Kitchen', 'KITCHEN', ARRAY['restaurant.view','branches.view','menu.view','orders.view','kitchen.view','kitchen.update']::TEXT[]),
    ('Waiter', 'WAITER', ARRAY['restaurant.view','branches.view','tables.view','menu.view','orders.view','orders.markServed','sessions.view','serviceRequests.view','serviceRequests.handle']::TEXT[])
) AS t("name", "kind", "permissions");

-- Link every existing Membership to its Restaurant's Role of the same kind.
ALTER TABLE "restaurant_memberships" ADD COLUMN "role_id" UUID;

UPDATE "restaurant_memberships" m
SET "role_id" = rr."id"
FROM "restaurant_roles" rr
WHERE rr."restaurant_id" = m."restaurant_id"
  AND rr."kind" = m."role";

ALTER TABLE "restaurant_memberships" ALTER COLUMN "role_id" SET NOT NULL;

CREATE INDEX "restaurant_memberships_role_id_idx" ON "restaurant_memberships"("role_id");

ALTER TABLE "restaurant_memberships"
    ADD CONSTRAINT "restaurant_memberships_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "restaurant_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
