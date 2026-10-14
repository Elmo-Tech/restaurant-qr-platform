import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Menu management ordering: the complete, desired order of ONE Menu's
 * Categories (the Staff drag-and-drop result). The service requires the list
 * to be exactly the Menu's current Categories, so a stale client can never
 * silently drop or invent one.
 */
export class ReorderCategoriesDto {
  @IsUUID('all', { message: 'menuId must be a well-formed UUID' })
  menuId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'categoryIds must be well-formed UUIDs' })
  categoryIds!: string[];
}
