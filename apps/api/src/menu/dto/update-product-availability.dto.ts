import { IsIn } from 'class-validator';
import {
  PRODUCT_AVAILABILITIES,
  type ProductAvailabilityInput,
} from './create-product.dto';

/**
 * Day 1 Menu Vertical Slice, Batch D, settled contract: the focused
 * availability endpoint accepts exactly one field. No other writable
 * Product field is accepted here -- `status`/`basePrice`/`categoryId`/etc.
 * belong to the generic Update endpoint only.
 */
export class UpdateProductAvailabilityDto {
  @IsIn(PRODUCT_AVAILABILITIES, {
    message: `availability must be one of: ${PRODUCT_AVAILABILITIES.join(', ')}`,
  })
  availability!: ProductAvailabilityInput;
}
