import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/database/prisma.service';

/**
 * Proves the real runtime wiring: ConfigService -> PrismaPg -> PrismaClient
 * -> PostgreSQL. Requires the local PostgreSQL container to be running,
 * which is already the expectation for this project's e2e suite (see
 * app.e2e-spec.ts). Kept separate from unit tests (src/**\/*.spec.ts) so
 * `npm run test` stays fast and does not require a database.
 *
 * Non-mutating only: no rows are inserted, updated, or deleted.
 */
describe('Database connectivity (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves PrismaService through Nest dependency injection', () => {
    // Not a strict `toBeInstanceOf(PrismaService)` check: Jest's
    // --experimental-vm-modules mode (required for Prisma's WASM query
    // compiler dynamic import, see report) can load the same class through
    // two separate module registrations, so the resolved instance's
    // constructor is a distinct-but-equivalent class object. Verifying the
    // constructor name plus real Prisma method presence is a reliable proxy
    // without depending on that Jest-specific identity quirk.
    expect(prisma).toBeDefined();
    expect(prisma.constructor.name).toBe('PrismaService');
    expect(typeof prisma.$queryRaw).toBe('function');
  });

  it('connects to PostgreSQL through the configured driver adapter', async () => {
    const result = await prisma.$queryRaw<
      { result: number }[]
    >`SELECT 1 AS result`;

    expect(result).toEqual([{ result: 1 }]);
  });

  it('reads the migrated Tenant/Identity schema without mutating it', async () => {
    const count = await prisma.restaurant.count();

    expect(count).toBe(0);
  });
});
