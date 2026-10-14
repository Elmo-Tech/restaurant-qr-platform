import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Menu management ordering: the complete, desired order of ONE Category's
 * Products (the Staff drag-and-drop result). The service requires the list
 * to be exactly the Category's current Products.
 */
export class ReorderProductsDto {
  @IsUUID('all', { message: 'categoryId must be a well-formed UUID' })
  categoryId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID('all', { each: true, message: 'productIds must be well-formed UUIDs' })
  productIds!: string[];
}
