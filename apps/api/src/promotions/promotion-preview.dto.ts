import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { EngineOrderType } from './promotion-engine';
import { PromotionDraftDto } from './promotion.dto';

function lowercaseUuid({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

class PromotionPreviewItemDto {
  @Transform(lowercaseUuid)
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class PromotionPreviewDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PromotionDraftDto)
  draft!: PromotionDraftDto;

  @ValidateIf((_: unknown, value: unknown) => value !== undefined)
  @Transform(lowercaseUuid)
  @IsUUID()
  promotionId?: string;

  @Transform(lowercaseUuid)
  @IsUUID()
  branchId!: string;

  @IsIn(['DINE_IN', 'PICKUP', 'DELIVERY'])
  orderType!: EngineOrderType;

  @ValidateIf((_: unknown, value: unknown) => value !== undefined)
  @Transform(lowercaseUuid)
  @IsUUID()
  deliveryZoneId?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => PromotionPreviewItemDto)
  items!: PromotionPreviewItemDto[];
}
