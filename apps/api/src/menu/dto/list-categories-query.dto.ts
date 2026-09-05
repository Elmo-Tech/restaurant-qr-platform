import { IsOptional, IsUUID } from 'class-validator';

/**
 * Day 1 Menu Vertical Slice, Batch C: the only supported Category List query
 * parameter, kept because the actual Staff Menu screen needs it (settled
 * contract #14). A malformed value fails the existing global
 * `VALIDATION_ERROR` contract before the service ever runs -- the service
 * itself always additionally scopes by `restaurantId = authorizedRestaurantId`
 * even when this filter is present, so a well-formed but foreign-Restaurant
 * `menuId` can never leak cross-Tenant existence (it simply yields the same
 * empty/filtered result as any other non-matching value, never a distinct
 * not-found).
 */
export class ListCategoriesQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'menuId must be a well-formed UUID' })
  menuId?: string;
}
