import { IsUUID } from 'class-validator';

/**
 * Manual session opening. Only the Table identity is accepted: restaurant and
 * branch come from the authenticated context and the Table's own row, never
 * from the request body.
 */
export class OpenSessionDto {
  @IsUUID('all', { message: 'tableId must be a well-formed UUID' })
  tableId!: string;
}
