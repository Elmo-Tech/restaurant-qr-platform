import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoneyDecimalString } from '../../menu/money-decimal';
import { OFFER_LIMITS } from '../offer-rules';

/** One selectable (or included) item of a slot. `names` is `{ <locale>: name }`; the service validates the locales. */
export class OfferOptionDto {
  /** The id of an existing option of this Offer (kept on update); omitted for a new one. */
  @IsOptional()
  @IsUUID('all')
  id?: string;

  /** Required for a typed item; ignored when `productId` is set (the name then follows the menu). */
  @IsOptional()
  @IsObject()
  names?: Record<string, string | null>;

  /** The menu item this option IS (then `names` is not needed); with sizes, `variantId` says which size. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  productId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID('all')
  variantId?: string | null;

  /** INCLUDED items only: how many units the item brings (1 to 99, default 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  /** Added to the Offer price when chosen ("0.00" = free). Always 0 for an included (FIXED) item. */
  @IsOptional()
  @IsMoneyDecimalString()
  priceAdjustment?: string;
}

export class OfferSlotDto {
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @IsIn(['FIXED', 'SINGLE', 'MULTI'])
  kind!: 'FIXED' | 'SINGLE' | 'MULTI';

  /** MULTI only: how many to pick in total (1 to 20). Ignored for the other kinds. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(OFFER_LIMITS.maxPickCount)
  requiredCount?: number;

  @IsObject()
  titles!: Record<string, string | null>;

  @IsArray()
  @ArrayMaxSize(OFFER_LIMITS.maxOptions)
  @ValidateNested({ each: true })
  @Type(() => OfferOptionDto)
  options!: OfferOptionDto[];
}

/**
 * Create / update body for an Offer (DEC-069). On update every field is optional and an omitted one is unchanged;
 * `names` / `descriptions` are merged per language (a null or blank value removes that language); `slots`, when present,
 * REPLACES the slot list (an existing slot or option keeps its id when it is sent with it).
 */
export class OfferDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @IsOptional()
  @IsIn(['OFFER', 'GIFT', 'MOST_ORDERED'])
  badge?: 'OFFER' | 'GIFT' | 'MOST_ORDERED';

  /** The fixed offer price, a decimal string such as "35.00". */
  @IsOptional()
  @IsMoneyDecimalString()
  price?: string;

  /** 0 (Sunday) to 6 (Saturday). `[]` or all seven = every day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn?: string | null;

  @IsOptional()
  @IsObject()
  names?: Record<string, string | null>;

  @IsOptional()
  @IsObject()
  descriptions?: Record<string, string | null>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(OFFER_LIMITS.maxSlots)
  @ValidateNested({ each: true })
  @Type(() => OfferSlotDto)
  slots?: OfferSlotDto[];
}

/** The full non-archived list of Offer ids in their new display order. */
export class ReorderOffersDto {
  @IsArray()
  @ArrayMaxSize(OFFER_LIMITS.maxOffers)
  @IsUUID('all', { each: true })
  offerIds!: string[];
}
