-- CreateEnum
CREATE TYPE "restaurant_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "branch_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "user_state" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "restaurant_membership_role" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER');

-- CreateEnum
CREATE TYPE "restaurant_membership_status" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "restaurant_status" NOT NULL,
    "default_locale" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "logo_asset_path" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_locales" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "branch_status" NOT NULL,
    "timezone" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "user_state" NOT NULL,
    "preferred_locale" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revoke_reason" TEXT,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_memberships" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "restaurant_membership_role" NOT NULL,
    "status" "restaurant_membership_status" NOT NULL,
    "all_branches" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "restaurant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_membership_branches" (
    "restaurant_membership_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "restaurant_membership_branches_pkey" PRIMARY KEY ("restaurant_membership_id","branch_id")
);

-- CreateTable
CREATE TABLE "restaurant_invitations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "role" "restaurant_membership_role" NOT NULL,
    "all_branches" BOOLEAN NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "invited_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_invitation_branches" (
    "restaurant_invitation_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,

    CONSTRAINT "restaurant_invitation_branches_pkey" PRIMARY KEY ("restaurant_invitation_id","branch_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_public_id_key" ON "restaurants"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_locales_restaurant_id_locale_key" ON "restaurant_locales"("restaurant_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "branches_public_id_key" ON "branches"("public_id");

-- CreateIndex
CREATE INDEX "branches_restaurant_id_idx" ON "branches"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "restaurant_memberships_restaurant_id_idx" ON "restaurant_memberships"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_memberships_user_id_idx" ON "restaurant_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_memberships_restaurant_id_user_id_key" ON "restaurant_memberships"("restaurant_id", "user_id");

-- CreateIndex
CREATE INDEX "restaurant_membership_branches_branch_id_idx" ON "restaurant_membership_branches"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_invitations_token_hash_key" ON "restaurant_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "restaurant_invitations_restaurant_id_idx" ON "restaurant_invitations"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_invitations_email_normalized_idx" ON "restaurant_invitations"("email_normalized");

-- CreateIndex
CREATE INDEX "restaurant_invitations_expires_at_idx" ON "restaurant_invitations"("expires_at");

-- CreateIndex
CREATE INDEX "restaurant_invitation_branches_branch_id_idx" ON "restaurant_invitation_branches"("branch_id");

-- AddForeignKey
ALTER TABLE "restaurant_locales" ADD CONSTRAINT "restaurant_locales_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_memberships" ADD CONSTRAINT "restaurant_memberships_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_memberships" ADD CONSTRAINT "restaurant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_membership_branches" ADD CONSTRAINT "restaurant_membership_branches_restaurant_membership_id_fkey" FOREIGN KEY ("restaurant_membership_id") REFERENCES "restaurant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_membership_branches" ADD CONSTRAINT "restaurant_membership_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_invitations" ADD CONSTRAINT "restaurant_invitations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_invitations" ADD CONSTRAINT "restaurant_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_invitation_branches" ADD CONSTRAINT "restaurant_invitation_branches_restaurant_invitation_id_fkey" FOREIGN KEY ("restaurant_invitation_id") REFERENCES "restaurant_invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_invitation_branches" ADD CONSTRAINT "restaurant_invitation_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
