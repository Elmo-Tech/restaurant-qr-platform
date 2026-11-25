import { HttpException } from '@nestjs/common';
import {
  importGrantStatus,
  requireImportGrant,
} from './onboarding-import-grant';

const now = new Date('2026-11-25T12:00:00.000Z');
const active = {
  importGrantId: 'generation-one',
  importGrantExpiresAt: new Date('2026-11-25T12:00:01.000Z'),
  importGrantRevokedAt: null,
};

describe('onboarding import grants', () => {
  it('requires a present, unrevoked, unexpired grant', () => {
    expect(importGrantStatus(active, now)).toBe('ACTIVE');
    expect(() => requireImportGrant(active, now)).not.toThrow();
    for (const row of [
      { ...active, importGrantId: null },
      { ...active, importGrantExpiresAt: now },
      { ...active, importGrantExpiresAt: null },
      { ...active, importGrantRevokedAt: now },
    ])
      expect(() => requireImportGrant(row, now)).toThrow(HttpException);
  });
  it('reports revocation before expiry', () => {
    expect(
      importGrantStatus(
        { ...active, importGrantExpiresAt: now, importGrantRevokedAt: now },
        now,
      ),
    ).toBe('REVOKED');
  });
});
