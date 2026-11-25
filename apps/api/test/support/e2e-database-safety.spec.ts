import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Static regression checks (no database needed) that keep two safety rules from
 * silently regressing when a new spec or script is added:
 *
 *  1. Every API e2e spec that can write to PostgreSQL uses the STRICT sandbox
 *     guard: it imports `./support/sandbox-guard` BEFORE any application module
 *     (Nest's ConfigModule reads DATABASE_URL at import time), every top-level
 *     suite is gated on the sandbox URL, and it verifies the live identity with
 *     `assertSandboxIdentity` before seeding. The e2e config's `globalSetup`
 *     verifies the live target before any suite can boot the application. No
 *     weaker, URL-only guard (the retired Offers guard) may come back. The
 *     only exceptions are listed in NOT_DESTRUCTIVE with a reason and must not
 *     contain write calls.
 *  2. Every Prisma PostgreSQL adapter is built with the UTC session settings of
 *     `src/database/postgres-connection.ts`.
 *
 * Run by `npm run test:db-safety --workspace=apps/api` and in CI.
 */
const API_ROOT = path.resolve(__dirname, '..', '..');
const TEST_DIR = path.join(API_ROOT, 'test');

/** Specs allowed to run without the sandbox guard, and why. */
const NOT_DESTRUCTIVE: Record<string, string> = {
  'app.e2e-spec.ts': 'boots the app and reads GET /api/v1 only',
  'database.e2e-spec.ts': 'read-only connectivity check (SELECT 1, count)',
  'restaurant-subdomains-http.e2e-spec.ts':
    'PrismaService and services are mocked; no live database',
};

const WRITE_CALL =
  /\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b|\.(post|put|patch|delete)\(['"`]/;
const GUARD_IMPORT = /from '\.\/support\/sandbox-guard'/;
/** Markers of the retired URL-only guard (built from parts so this file does not match itself). */
const WEAK_GUARD = new RegExp(
  [
    'scratch' + '-guard',
    'OFFERS_E2E_' + 'DATABASE_URL',
    'SCRATCH' + '_URL',
  ].join('|'),
);
const REPO_ROOT = path.resolve(API_ROOT, '..', '..');
const APP_IMPORT = /from '(\.\.?\/)+(\.\.\/)?src\/|from '@nestjs\/config'/;

function e2eSpecs(): string[] {
  return readdirSync(TEST_DIR)
    .filter((name) => name.endsWith('.e2e-spec.ts'))
    .sort();
}

/** Line index of the first match, or -1. */
function firstLine(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('API e2e database safety', () => {
  const specs = e2eSpecs();

  it('finds the e2e specs (the scan is not vacuous)', () => {
    expect(specs.length).toBeGreaterThan(40);
    expect(specs).toContain('kitchen-http.e2e-spec.ts');
  });

  it('only the strict sandbox guard exists in test/support', () => {
    const guards = readdirSync(path.join(TEST_DIR, 'support')).filter((name) =>
      /guard\.ts$/.test(name),
    );
    expect(guards).toEqual(['sandbox-guard.ts']);
  });

  it('no test file or workflow uses the retired URL-only guard', () => {
    const workflows = path.join(REPO_ROOT, '.github', 'workflows');
    const files = [
      ...walk(TEST_DIR),
      ...readdirSync(workflows)
        .filter((name) => /\.ya?ml$/.test(name))
        .map((name) => path.join(workflows, name)),
    ];
    const offenders = files
      .filter((file) => WEAK_GUARD.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(REPO_ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('identity-checks the live sandbox before any suite boots the application', () => {
    const config = JSON.parse(
      readFileSync(path.join(TEST_DIR, 'jest-e2e.json'), 'utf8'),
    ) as { globalSetup?: string };
    expect(config.globalSetup).toBe(
      '<rootDir>/support/sandbox-global-setup.ts',
    );
    const setup = readFileSync(
      path.join(TEST_DIR, 'support', 'sandbox-global-setup.ts'),
      'utf8',
    );
    expect(setup).toMatch(/await assertSandboxDatabase\(SANDBOX_URL\)/);
  });

  it('keeps the non-destructive allowlist honest', () => {
    for (const [name, reason] of Object.entries(NOT_DESTRUCTIVE)) {
      expect(reason).toBeTruthy();
      const source = readFileSync(path.join(TEST_DIR, name), 'utf8');
      expect({ name, writes: WRITE_CALL.test(source) }).toEqual({
        name,
        writes: false,
      });
    }
  });

  describe.each(e2eSpecs().filter((name) => !(name in NOT_DESTRUCTIVE)))(
    '%s',
    (name) => {
      const source = readFileSync(path.join(TEST_DIR, name), 'utf8');
      const lines = source.split('\n');
      it('imports the sandbox guard before any application module', () => {
        const guard = firstLine(lines, GUARD_IMPORT);
        expect(guard).toBeGreaterThanOrEqual(0);
        const app = firstLine(lines, APP_IMPORT);
        if (app >= 0) {
          // A multi-line guard import ends before the first application import.
          expect(guard).toBeLessThan(app);
        }
      });

      it('gates every top-level suite on the sandbox URL', () => {
        const topLevel = lines.filter((line) =>
          /^(describe|it|test)(\.\w+)?\(/.test(line),
        );
        expect(topLevel).toEqual([]);
        expect(source).toMatch(
          /^const \w+ =[^;]*\bSANDBOX_URL\b[^;]*\? describe : describe\.skip;/m,
        );
      });

      it('verifies the live sandbox identity before writing', () => {
        expect(source).toMatch(/assertSandboxIdentity\(|SANDBOX_MARKER/);
      });

      it('verifies the identity before creating the application when it does so itself', () => {
        const preBoot = source.indexOf('await assertSandboxDatabase(');
        if (preBoot >= 0) {
          const boot = source.search(
            /Test\.createTestingModule\(|new PrismaService\(/,
          );
          expect(boot === -1 || preBoot < boot).toBe(true);
        }
      });
    },
  );
});

describe('Prisma PostgreSQL adapters use the UTC session settings', () => {
  const files = [
    ...walk(path.join(API_ROOT, 'src')),
    ...walk(path.join(API_ROOT, 'scripts')),
    ...walk(TEST_DIR),
  ].filter(
    (file) => !file.endsWith(path.join('database', 'postgres-connection.ts')),
  );

  it('never builds PrismaPg from a bare connection string', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/new PrismaPg\(/g)) {
        const call = source.slice(match.index, match.index + 200);
        if (!/postgresPoolConfig\(/.test(call)) {
          offenders.push(path.relative(API_ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
