-- FT-12C: `CUSTOM` marks a Restaurant-defined Role (RestaurantRole.kind). Kept in its own migration because a newly added enum value cannot be used in the same transaction that adds it.
ALTER TYPE "restaurant_membership_role" ADD VALUE IF NOT EXISTS 'CUSTOM';
