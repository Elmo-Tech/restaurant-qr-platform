import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const FOOD_SECTORS = [
  'RESTAURANT',
  'CAFE',
  'SWEETS',
  'BUTCHER',
  'HOME_FOOD',
] as const;
export const FOOD_PRESENTATIONS = [
  'UNSPECIFIED',
  'RAW',
  'COOKED',
  'READY_TO_SERVE',
] as const;
export const FOOD_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export class FoodImageListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(FOOD_STATUSES) status?: (typeof FOOD_STATUSES)[number];
  @IsOptional()
  @IsIn(FOOD_PRESENTATIONS)
  presentation?: (typeof FOOD_PRESENTATIONS)[number];
  @IsOptional() @IsIn(FOOD_SECTORS) sector?: (typeof FOOD_SECTORS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class FoodTagListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class FoodTagSuggestQueryDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
}

export class ReviewFoodImageDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsIn(['RAW', 'COOKED', 'READY_TO_SERVE']) presentation!:
    'RAW' | 'COOKED' | 'READY_TO_SERVE';
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsIn(FOOD_SECTORS, { each: true })
  sectors!: (typeof FOOD_SECTORS)[number][];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  tagIds!: string[];
}

export class BulkFoodImageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
  @IsOptional()
  @IsIn(FOOD_PRESENTATIONS)
  presentation?: (typeof FOOD_PRESENTATIONS)[number];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsIn(FOOD_SECTORS, { each: true })
  sectors?: (typeof FOOD_SECTORS)[number][];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  addTagIds?: string[];
}

export class FoodImageIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
}
