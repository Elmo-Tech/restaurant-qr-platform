import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  PromotionDiscountType,
  PromotionQuantityBasis,
  PromotionScope,
  PromotionStatus,
} from '../generated/prisma/client';

// NUMERIC(14,2); only exact decimal strings are accepted on the wire.
const DECIMAL = /^\d{1,12}(?:\.\d{1,2})?$/;
const DATE_ONLY = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
// PostgreSQL text does not accept NULs.
// eslint-disable-next-line no-control-regex
const NO_NUL = /^[^\u0000]*$/u;
const LOCALE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/;
const MAX_TARGETS = 500;
const whenProvided = () =>
  ValidateIf((_, value: unknown) => value !== undefined);

function TargetIds() {
  return (target: object, key: string) => {
    whenProvided()(target, key);
    IsArray()(target, key);
    ArrayMaxSize(MAX_TARGETS)(target, key);
    IsUUID('all', { each: true })(target, key);
  };
}

class PromotionTranslationDto {
  @IsString()
  @MaxLength(35)
  @Matches(LOCALE)
  locale!: string;

  @IsString()
  @MaxLength(120)
  @Matches(NO_NUL)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NO_NUL)
  description?: string | null;
}

function Translations() {
  return (target: object, key: string) => {
    IsArray()(target, key);
    ArrayMaxSize(32)(target, key);
    IsObject({ each: true })(target, key);
    ValidateNested({ each: true })(target, key);
    Type(() => PromotionTranslationDto)(target, key);
  };
}

class OptionalPromotionFieldsDto {
  @whenProvided()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Matches(DATE_ONLY)
  startsOn?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY)
  endsOn?: string | null;

  @IsOptional()
  @Matches(DECIMAL)
  minimumSubtotal?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  minimumQuantity?: number | null;

  @IsOptional()
  @IsEnum(PromotionQuantityBasis)
  quantityBasis?: PromotionQuantityBasis | null;

  @TargetIds()
  branchIds?: string[];

  @TargetIds()
  menuIds?: string[];

  @TargetIds()
  categoryIds?: string[];

  @TargetIds()
  productIds?: string[];

  @TargetIds()
  deliveryZoneIds?: string[];
}

/** Complete draft for creation and simulation; lifecycle changes use action routes. */
export class PromotionDraftDto extends OptionalPromotionFieldsDto {
  @IsString()
  @MaxLength(120)
  @Matches(NO_NUL)
  internalName!: string;

  @IsEnum(PromotionScope)
  scope!: PromotionScope;

  @IsEnum(PromotionDiscountType)
  discountType!: PromotionDiscountType;

  @Matches(DECIMAL)
  value!: string;

  @Translations()
  translations!: PromotionTranslationDto[];
}

export class UpdatePromotionDto extends OptionalPromotionFieldsDto {
  @whenProvided()
  @IsString()
  @MaxLength(120)
  @Matches(NO_NUL)
  internalName?: string;

  @whenProvided()
  @IsEnum(PromotionScope)
  scope?: PromotionScope;

  @whenProvided()
  @IsEnum(PromotionDiscountType)
  discountType?: PromotionDiscountType;

  @whenProvided()
  @Matches(DECIMAL)
  value?: string;

  @whenProvided()
  @Translations()
  translations?: PromotionTranslationDto[];

  @whenProvided()
  @IsBoolean()
  confirmTargetWidening?: boolean;

  /** DEC-077: required to change the stored discount type of an existing promotion (any scope). */
  @whenProvided()
  @IsBoolean()
  confirmDiscountTypeChange?: boolean;

  @whenProvided()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  expectedUpdatedAt?: string;
}

export class PromotionActionDto {
  @whenProvided()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  expectedUpdatedAt?: string;
}

function queryInteger(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value)
    ? Number(value)
    : value;
}

export class ListPromotionsQueryDto {
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;

  @IsOptional()
  @IsEnum(PromotionScope)
  scope?: PromotionScope;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_NUL)
  search?: string;

  @IsOptional()
  @IsUUID('all')
  zoneId?: string;

  @IsOptional()
  @Transform(({ value }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => queryInteger(value))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
