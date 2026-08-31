import { SessionTokenService } from './session-token.service';

describe('SessionTokenService', () => {
  let service: SessionTokenService;

  beforeEach(() => {
    service = new SessionTokenService();
  });

  describe('generateRawToken', () => {
    it('generates a non-empty token', () => {
      const token = service.generateRawToken();

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('generates different tokens on each call', () => {
      const first = service.generateRawToken();
      const second = service.generateRawToken();

      expect(first).not.toBe(second);
    });

    it('uses a base64url-safe representation (no +, /, or = padding)', () => {
      const token = service.generateRawToken();

      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('encodes 256 bits (32 raw bytes) of entropy', () => {
      const token = service.generateRawToken();
      const decoded = Buffer.from(token, 'base64url');

      expect(decoded.length).toBe(32);
    });

    it('is exactly 43 characters (32 bytes, base64url, no padding)', () => {
      const token = service.generateRawToken();

      expect(token).toHaveLength(43);
    });

    it('produces tokens that pass isWellFormedRawToken', () => {
      const token = service.generateRawToken();

      expect(service.isWellFormedRawToken(token)).toBe(true);
    });
  });

  describe('hashToken', () => {
    it('produces a lowercase 64-character hex SHA-256 digest', () => {
      const hash = service.hashToken('any-raw-token-value');

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('hashes the same token identically every time', () => {
      const token = service.generateRawToken();

      expect(service.hashToken(token)).toBe(service.hashToken(token));
    });

    it('hashes different tokens differently', () => {
      const first = service.generateRawToken();
      const second = service.generateRawToken();

      expect(service.hashToken(first)).not.toBe(service.hashToken(second));
    });

    it('never returns the raw token as its own hash', () => {
      const token = service.generateRawToken();

      expect(service.hashToken(token)).not.toBe(token);
    });
  });

  describe('isWellFormedRawToken', () => {
    const VALID_TOKEN = 'A'.repeat(43);

    it('accepts a canonical 43-character base64url token', () => {
      expect(service.isWellFormedRawToken(VALID_TOKEN)).toBe(true);
    });

    it('rejects an empty string', () => {
      expect(service.isWellFormedRawToken('')).toBe(false);
    });

    it('rejects a whitespace-only string', () => {
      expect(service.isWellFormedRawToken('   ')).toBe(false);
    });

    it('rejects a token that is too short', () => {
      expect(service.isWellFormedRawToken('A'.repeat(42))).toBe(false);
    });

    it('rejects a token that is too long', () => {
      expect(service.isWellFormedRawToken('A'.repeat(44))).toBe(false);
    });

    it('rejects characters outside the base64url alphabet', () => {
      expect(service.isWellFormedRawToken('!'.repeat(43))).toBe(false);
      expect(service.isWellFormedRawToken('A'.repeat(42) + '+')).toBe(false);
      expect(service.isWellFormedRawToken('A'.repeat(42) + '/')).toBe(false);
    });

    it('rejects a token with "=" padding', () => {
      expect(service.isWellFormedRawToken('A'.repeat(42) + '=')).toBe(false);
    });
  });
});
