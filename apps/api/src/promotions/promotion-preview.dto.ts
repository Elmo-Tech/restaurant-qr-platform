import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Matches,
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

/** The opt-in contract (DEC-077 B3). A request without `contract` keeps the pre-B3 request, response and validation. */
export const CONTEXTUAL_PREVIEW_CONTRACT = 'CONTEXTUAL_V1';

/** Same token shape the API accepts for `X-Request-Id`: it is echoed back and ends up in logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function contextual(object: unknown, value: unknown): boolean {
  return (
    (object as PromotionPreviewDto).contract === CONTEXTUAL_PREVIEW_CONTRACT &&
    value !== undefined
  );
}

export class PromotionPreviewDto {
  @ValidateIf((_: unknown, value: unknown) => value !== undefined)
  @IsIn([CONTEXTUAL_PREVIEW_CONTRACT])
  contract?: typeof CONTEXTUAL_PREVIEW_CONTRACT;

  /** CONTEXTUAL_V1 only: echoed back so a client can tell which answer belongs to which draft. */
  @ValidateIf(contextual)
  @IsString()
  @Matches(SAFE_REQUEST_ID)
  requestId?: string;

  /** CONTEXTUAL_V1 only: the applicable product the examples are built from. */
  @ValidateIf(contextual)
  @Transform(lowercaseUuid)
  @IsUUID()
  sampleProductId?: string;

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

  // Required by the pre-B3 contract; optional with CONTEXTUAL_V1 (the Backend builds the examples when omitted).
  @ValidateIf(
    (object: PromotionPreviewDto, value: unknown) =>
      object.contract === undefined || value !== undefined,
  )
  @IsArray()
  @ArrayMaxSize(20)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => PromotionPreviewItemDto)
  items?: PromotionPreviewItemDto[];
}
