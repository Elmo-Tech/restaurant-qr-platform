import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * The complete, desired order of ONE Product's Variants (the Staff reorder
 * result). The service requires the list to be exactly the Product's current
 * Variants (any status).
 */
export class ReorderProductVariantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', {
    each: true,
    message: 'variantIds must be well-formed UUIDs',
  })
  variantIds!: string[];
}
