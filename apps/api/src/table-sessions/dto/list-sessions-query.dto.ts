import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
export const SESSION_LIST_MAX_LIMIT = 200;
export const SESSION_LIST_DEFAULT_LIMIT = 50;

/**
 * Staff Table Session list filters. `branchId` can only NARROW within the
 * Membership's own authorized Branch scope; a foreign/unauthorized value is
 * dropped (never widens access, never a distinct error), exactly like the
 * Orders list.
 */
export class ListSessionsQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'tableId must be a well-formed UUID' })
  tableId?: string;

  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'], { message: 'status must be one of: OPEN, CLOSED' })
  status?: 'OPEN' | 'CLOSED';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
  )
  @IsInt({ message: 'limit must be an integer' })
  @Min(1)
  @Max(SESSION_LIST_MAX_LIMIT)
  limit?: number;
}
