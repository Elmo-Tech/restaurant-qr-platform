import { parseOptions } from '@node-rs/argon2';
import { PasswordHasherService } from './password-hasher.service';

const VALID_PASSWORD = 'correct horse battery staple';
// @node-rs/argon2 Algorithm.Argon2id. Referenced by literal value rather
// than the ambient `const enum` member (see password-hasher.service.ts for
// why: TS2748 under isolatedModules).
const ARGON2ID = 2;

describe('PasswordHasherService', () => {
  let service: PasswordHasherService;

  beforeEach(() => {
    service = new PasswordHasherService();
  });

  describe('hashPassword', () => {
    it('hashes a valid password successfully', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('never includes the plaintext password in the resulting hash', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);

      expect(hash).not.toContain(VALID_PASSWORD);
    });

    it('produces an Argon2id-encoded hash using the library defaults', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);
      const parsed = parseOptions(hash);

      expect(parsed.algorithm).toBe(ARGON2ID);
      // These are @node-rs/argon2's own production-safe defaults, left
      // unchanged (matches an OWASP Argon2id baseline: m=19456, t=2, p=1).
      expect(parsed.memoryCost).toBe(19456);
      expect(parsed.timeCost).toBe(2);
      expect(parsed.parallelism).toBe(1);
    });

    it('produces different hashes for the same password (random salt)', async () => {
      const first = await service.hashPassword(VALID_PASSWORD);
      const second = await service.hashPassword(VALID_PASSWORD);

      expect(first).not.toBe(second);
    });

    it('completes within a sane time budget for the default cost parameters', async () => {
      const start = Date.now();
      await service.hashPassword(VALID_PASSWORD);
      const elapsedMs = Date.now() - start;

      // Generous ceiling: a sanity check against gross misconfiguration,
      // not a strict performance benchmark. The library's own benchmarks
      // report single-digit milliseconds for these default parameters.
      expect(elapsedMs).toBeLessThan(2000);
    });

    it.each([
      ['exactly the minimum length (10)', 'a'.repeat(10), true],
      ['one below the minimum (9)', 'a'.repeat(9), false],
      ['exactly the maximum length (128)', 'a'.repeat(128), true],
      ['one above the maximum (129)', 'a'.repeat(129), false],
    ])('%s is %s', async (_label, password, shouldSucceed) => {
      if (shouldSucceed) {
        await expect(service.hashPassword(password)).resolves.toEqual(
          expect.any(String),
        );
      } else {
        await expect(service.hashPassword(password)).rejects.toThrow();
      }
    });

    it('rejects an out-of-policy password without including it in the error message', async () => {
      const tooShort = 'short';
      let caught: Error | undefined;

      try {
        await service.hashPassword(tooShort);
      } catch (error) {
        caught = error as Error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(caught?.message).not.toContain(tooShort);
    });

    it('does not trim, lowercase, or otherwise normalize the password', async () => {
      const withSurroundingSpace = `  ${VALID_PASSWORD}  `;

      const hash = await service.hashPassword(withSurroundingSpace);

      // A password differing only by surrounding whitespace must not
      // verify against a hash of the untouched original.
      const matchesUntouched = await service.verifyPassword(
        VALID_PASSWORD,
        hash,
      );
      const matchesAsHashed = await service.verifyPassword(
        withSurroundingSpace,
        hash,
      );

      expect(matchesUntouched).toBe(false);
      expect(matchesAsHashed).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('succeeds for the correct password', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);

      await expect(service.verifyPassword(VALID_PASSWORD, hash)).resolves.toBe(
        true,
      );
    });

    it('fails for an incorrect password', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);

      await expect(
        service.verifyPassword('a-completely-different-password', hash),
      ).resolves.toBe(false);
    });

    it('fails safely for a malformed stored hash instead of throwing', async () => {
      await expect(
        service.verifyPassword(VALID_PASSWORD, 'not-a-real-argon2-hash'),
      ).resolves.toBe(false);
    });

    it('fails safely for an empty stored hash', async () => {
      await expect(service.verifyPassword(VALID_PASSWORD, '')).resolves.toBe(
        false,
      );
    });

    it('fails safely for an empty plaintext password', async () => {
      const hash = await service.hashPassword(VALID_PASSWORD);

      await expect(service.verifyPassword('', hash)).resolves.toBe(false);
    });
  });
});
