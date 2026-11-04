import { IsString, MaxLength } from 'class-validator';

/** DEC-066: the readable menu link a Platform Administrator types. The format itself is checked by `slugProblem` (clear error codes). */
export class MenuSlugDto {
  @IsString()
  @MaxLength(100)
  slug!: string;
}
