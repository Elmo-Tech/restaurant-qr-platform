import { Equals, IsUUID } from 'class-validator';

/**
 * A deliberate, non-destructive reset of the CURRENT primary menu.
 * Caller must confirm the exact primary menu they saw, so a stale tab
 * cannot silently archive a menu that became primary meanwhile.
 */
export class StartFreshMenuDto {
  @IsUUID()
  expectedPrimaryMenuId!: string;

  @Equals('ARCHIVE_AND_START_FRESH')
  confirmation!: 'ARCHIVE_AND_START_FRESH';
}
