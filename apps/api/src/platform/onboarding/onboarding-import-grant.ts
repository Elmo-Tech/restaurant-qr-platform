import { HttpException, HttpStatus } from '@nestjs/common';

export interface ImportGrantState {
  importGrantId: string | null;
  importGrantExpiresAt: Date | null;
  importGrantRevokedAt: Date | null;
}

export function importGrantStatus(row: ImportGrantState, now = new Date()) {
  if (!row.importGrantId) return 'NONE' as const;
  if (row.importGrantRevokedAt) return 'REVOKED' as const;
  if (!row.importGrantExpiresAt || row.importGrantExpiresAt <= now)
    return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}

export function requireImportGrant(row: ImportGrantState, now = new Date()) {
  if (importGrantStatus(row, now) !== 'ACTIVE')
    throw new HttpException(
      {
        error: {
          code: 'ONBOARDING_IMPORT_GRANT_REQUIRED',
          message: 'An active onboarding import grant is required.',
        },
      },
      HttpStatus.FORBIDDEN,
    );
}
