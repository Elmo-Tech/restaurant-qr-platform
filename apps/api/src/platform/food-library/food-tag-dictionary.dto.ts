import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const FOOD_TAG_GROUPS = [
  'PROTEIN',
  'CUT',
  'DISH',
  'HOME',
  'DESSERT',
  'DRINK',
  'INGREDIENT',
  'PREPARATION',
  'SAUCE',
  'BAKERY',
  'PORTION',
] as const;

export class FoodTagCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(FOOD_TAG_GROUPS)
  group?: (typeof FOOD_TAG_GROUPS)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class FoodTagWriteDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  code?: string;

  @IsIn(FOOD_TAG_GROUPS)
  group!: (typeof FOOD_TAG_GROUPS)[number];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameAr!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameIt!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  aliasesAr!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  aliasesEn!: string[];

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  aliasesIt!: string[];
}
