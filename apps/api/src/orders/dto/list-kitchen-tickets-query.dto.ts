import { IsOptional, IsUUID } from 'class-validator';

/**
 * Kitchen View V1: the Kitchen Board works in one Branch at a time (UX spec
 * #102). `branchId` only narrows within the Membership's own authorized Branch
 * scope -- a foreign value yields an empty board, never a distinct error.
 */
export class ListKitchenTicketsQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;
}
