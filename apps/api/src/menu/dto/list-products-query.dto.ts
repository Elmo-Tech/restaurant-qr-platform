import { IsOptional, IsUUID } from 'class-validator';

/**
 * Day 1 Menu Vertical Slice, Batch D: the only supported Product List query
 * parameter, kept because the Staff Menu screen needs it (mirrors
 * `ListCategoriesQueryDto`). A malformed value fails the existing global
 * `VALIDATION_ERROR` contract before the service ever runs -- the service
 * itself always additionally scopes by `restaurantId = authorizedRestaurantId`
 * even when this filter is present, so a well-formed but foreign-Restaurant
 * `categoryId` can never leak cross-Tenant existence.
 */
export class ListProductsQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'categoryId must be a well-formed UUID' })
  categoryId?: string;
}
