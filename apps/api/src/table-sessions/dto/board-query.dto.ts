import { IsOptional, IsUUID } from 'class-validator';

/** Board filter: `branchId` can only narrow within the Membership's authorized Branch scope. */
export class BoardQueryDto {
  @IsOptional()
  @IsUUID('all', { message: 'branchId must be a well-formed UUID' })
  branchId?: string;
}
