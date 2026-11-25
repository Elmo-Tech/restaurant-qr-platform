import {
  assertSandboxIdentity,
  assertSandboxUrl,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { resolveDashboardDateRange } from '../src/dashboard/dashboard-date-range';
import { PrismaService } from '../src/database/prisma.service';
import { localDateIn } from '../src/menu/product-discount';

/**
 * Timestamp safety of the real PrismaService wiring (ConfigService -> PrismaPg ->
 * PostgreSQL) whatever the database server's default TimeZone is. CI runs this
 * suite twice: against a server configured with UTC and with Africa/Cairo
 * (`TZ_IT_EXPECTED_DATABASE_TIMEZONE` names the configured default so the run
 * proves which server it actually hit).
 *
 * Every expected value is derived from absolute epochs or IANA zone names, never
 * from a hard-coded UTC offset.
 *
 * Isolation: see `support/sandbox-guard.ts`; without TABLE_SESSION_IT_DATABASE_URL
 * the whole suite is skipped.
 */
const describeSandbox = SANDBOX_URL ? describe : describe.skip;

const BUSINESS_TIMEZONE = 'Africa/Cairo';
/** Instants on both sides of Egypt's DST season, so a fixed offset could not pass both. */
const WINTER_INSTANT = new Date('2026-01-15T10:20:30.456Z');
const SUMMER_INSTANT = new Date('2026-07-15T10:20:30.456Z');
/** Late evening UTC: already the next calendar day in the Branch timezone. */
const LATE_EVENING_UTC = new Date('2026-11-24T22:30:00.000Z');
/** Generous bound for Node/PostgreSQL clock skew on one host; a zone offset is >= 1 hour. */
const CLOCK_TOLERANCE_MS = 5_000;

/** PostgreSQL computes epoch milliseconds exactly (numeric); microseconds are truncated like JS Date parsing does. */
function epochMs(value: string): number {
  return Number(value);
}

/** Wall-clock text of an instant in an IANA zone, formatted like PostgreSQL's `timestamp` output. */
function wallClockIn(timeZone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

describeSandbox(
  'Database timestamps are UTC on every connection (real PostgreSQL)',
  () => {
    let prisma: PrismaService;
    let raw: Client;
    let databaseDefaultTimeZone: string;
    const restaurantIds: string[] = [];

    beforeAll(async () => {
      prisma = new PrismaService(
        new ConfigService({ DATABASE_URL: SANDBOX_URL }),
      );
      await assertSandboxIdentity(prisma);
      await prisma.onModuleInit();

      // A plain connection WITHOUT the application's session options shows the
      // server/database default the application must be immune to.
      assertSandboxUrl(SANDBOX_URL as string);
      raw = new Client({ connectionString: SANDBOX_URL as string });
      await raw.connect();
      const shown = await raw.query<{ tz: string }>(
        "SELECT current_setting('TimeZone') AS tz",
      );
      databaseDefaultTimeZone = shown.rows[0].tz;
    });

    afterAll(async () => {
      if (prisma) {
        for (const restaurantId of restaurantIds.splice(0)) {
          await prisma.restaurantAnnouncement.deleteMany({
            where: { restaurantId },
          });
          await prisma.branch.deleteMany({ where: { restaurantId } });
          await prisma.restaurant.delete({ where: { id: restaurantId } });
        }
        await prisma.onModuleDestroy();
      }
      await raw?.end();
    });

    async function seedRestaurant(subscriptionOverrideAt: Date | null = null) {
      const restaurant = await prisma.restaurant.create({
        data: {
          publicId: `rest-tz-${randomUUID()}`,
          name: 'Timezone Test',
          status: 'ACTIVE',
          defaultLocale: 'en',
          currencyCode: 'EGP',
          subscriptionOverrideAt,
        },
      });
      restaurantIds.push(restaurant.id);
      return restaurant;
    }

    it('runs against the database default TimeZone the environment says it configured', () => {
      const expected = process.env.TZ_IT_EXPECTED_DATABASE_TIMEZONE;
      if (expected) {
        expect(databaseDefaultTimeZone).toBe(expected);
      }
      expect(databaseDefaultTimeZone).toBeTruthy();
    });

    it('pins every pooled application connection to UTC', async () => {
      const sessions = await Promise.all(
        Array.from({ length: 4 }, () =>
          prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<{ tz: string; pid: number }[]>`
            SELECT current_setting('TimeZone') AS tz, pg_backend_pid() AS pid, pg_sleep(0.1)::text AS slept`;
            return rows[0];
          }),
        ),
      );
      expect(
        new Set(sessions.map((session) => session.pid)).size,
      ).toBeGreaterThan(1);
      for (const session of sessions) {
        expect(session.tz).toBe('UTC');
      }
    });

    it('keeps the UTC pin after RESET ALL', async () => {
      const tz = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`RESET ALL`;
        const rows = await tx.$queryRaw<
          { tz: string }[]
        >`SELECT current_setting('TimeZone') AS tz`;
        return rows[0].tz;
      });
      expect(tz).toBe('UTC');
    });

    it.each([
      ['winter', WINTER_INSTANT],
      ['summer (DST season)', SUMMER_INSTANT],
    ])(
      'stores an application-generated %s timestamp as the exact instant and reads it back unchanged',
      async (_label, instant) => {
        const restaurant = await seedRestaurant(instant);

        const stored = await raw.query<{ epoch: string }>(
          'SELECT floor(extract(epoch FROM subscription_override_at) * 1000)::text AS epoch FROM restaurants WHERE id = $1',
          [restaurant.id],
        );
        expect(epochMs(stored.rows[0].epoch)).toBe(instant.getTime());

        const reread = await prisma.restaurant.findUniqueOrThrow({
          where: { id: restaurant.id },
          select: { subscriptionOverrideAt: true },
        });
        expect(reread.subscriptionOverrideAt?.toISOString()).toBe(
          instant.toISOString(),
        );
      },
    );

    it('reads database-generated now() values as the real instant', async () => {
      const restaurant = await seedRestaurant();
      const before = Date.now();
      const updated = await prisma.$queryRaw<{ epoch: string }[]>`
      UPDATE restaurants SET updated_at = now() WHERE id = ${restaurant.id}::uuid
      RETURNING floor(extract(epoch FROM updated_at) * 1000)::text AS epoch`;
      const after = Date.now();

      const reread = await prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurant.id },
        select: { updatedAt: true },
      });
      expect(reread.updatedAt.getTime()).toBe(epochMs(updated[0].epoch));
      expect(reread.updatedAt.getTime()).toBeGreaterThanOrEqual(
        before - CLOCK_TOLERANCE_MS,
      );
      expect(reread.updatedAt.getTime()).toBeLessThanOrEqual(
        after + CLOCK_TOLERANCE_MS,
      );
    });

    it('reads a column DEFAULT now() filled by PostgreSQL as the real instant', async () => {
      const restaurant = await seedRestaurant();
      const before = Date.now();
      // created_at is omitted: the migration's DEFAULT CURRENT_TIMESTAMP fills it.
      const inserted = await prisma.$queryRaw<{ id: string; epoch: string }[]>`
      INSERT INTO branches (id, public_id, restaurant_id, name, status, timezone, updated_at)
      VALUES (gen_random_uuid(), ${`branch-tz-${randomUUID()}`}, ${restaurant.id}::uuid,
              'Default clock', 'ACTIVE', ${BUSINESS_TIMEZONE}, now())
      RETURNING id::text AS id, floor(extract(epoch FROM created_at) * 1000)::text AS epoch`;
      const after = Date.now();

      const branch = await prisma.branch.findUniqueOrThrow({
        where: { id: inserted[0].id },
        select: { createdAt: true },
      });
      expect(branch.createdAt.getTime()).toBe(epochMs(inserted[0].epoch));
      expect(branch.createdAt.getTime()).toBeGreaterThanOrEqual(
        before - CLOCK_TOLERANCE_MS,
      );
      expect(branch.createdAt.getTime()).toBeLessThanOrEqual(
        after + CLOCK_TOLERANCE_MS,
      );
    });

    it('stores Prisma @default(now()) and @updatedAt values as the real instant', async () => {
      const before = Date.now();
      const restaurant = await seedRestaurant();
      const after = Date.now();

      const stored = await raw.query<{ created: string; updated: string }>(
        `SELECT floor(extract(epoch FROM created_at) * 1000)::text AS created,
              floor(extract(epoch FROM updated_at) * 1000)::text AS updated
         FROM restaurants WHERE id = $1`,
        [restaurant.id],
      );
      for (const value of [stored.rows[0].created, stored.rows[0].updated]) {
        expect(epochMs(value)).toBeGreaterThanOrEqual(
          before - CLOCK_TOLERANCE_MS,
        );
        expect(epochMs(value)).toBeLessThanOrEqual(after + CLOCK_TOLERANCE_MS);
      }
      expect(restaurant.createdAt.getTime()).toBe(
        epochMs(stored.rows[0].created),
      );
    });

    it('compares application-written instants with database now() consistently', async () => {
      const soon = new Date(Date.now() + 30 * 60 * 1000);
      const restaurant = await seedRestaurant(soon);

      const rows = await prisma.$queryRaw<
        { future: boolean; within_hour: boolean }[]
      >`
      SELECT subscription_override_at > now() AS future,
             subscription_override_at < now() + interval '1 hour' AS within_hour
        FROM restaurants WHERE id = ${restaurant.id}::uuid`;
      expect(rows[0]).toEqual({ future: true, within_hour: true });

      const live = await prisma.restaurant.count({
        where: {
          id: restaurant.id,
          subscriptionOverrideAt: { gt: new Date() },
        },
      });
      expect(live).toBe(1);
    });

    it('keeps the Branch business timezone and local calendar dates intact', async () => {
      const restaurant = await seedRestaurant();
      const branch = await prisma.branch.create({
        data: {
          publicId: `branch-tz-${randomUUID()}`,
          restaurantId: restaurant.id,
          name: 'Business clock',
          status: 'ACTIVE',
          timezone: BUSINESS_TIMEZONE,
        },
      });
      expect(branch.timezone).toBe(BUSINESS_TIMEZONE);

      // Local midnight of the Branch "today" (the existing dashboard rule) is an
      // absolute instant; it must land on local midnight in the Branch zone.
      const { from, to } = resolveDashboardDateRange(
        'today',
        branch.timezone,
        {},
        LATE_EVENING_UTC,
      );
      const localToday = localDateIn(branch.timezone, LATE_EVENING_UTC);
      expect(localToday).not.toBe(LATE_EVENING_UTC.toISOString().slice(0, 10));
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { subscriptionOverrideAt: from },
      });
      const local = await prisma.$queryRaw<{ wall: string }[]>`
      SELECT to_char(subscription_override_at AT TIME ZONE ${branch.timezone}, 'YYYY-MM-DD HH24:MI:SS') AS wall
        FROM restaurants WHERE id = ${restaurant.id}::uuid`;
      expect(local[0].wall).toBe(`${localToday} 00:00:00`);
      expect(local[0].wall).toBe(wallClockIn(branch.timezone, from));
      const inWindow = await prisma.restaurant.count({
        where: {
          id: restaurant.id,
          subscriptionOverrideAt: { gte: from, lt: to },
        },
      });
      expect(inWindow).toBe(1);

      // A DATE column holds the Branch-local calendar date, unshifted.
      const announcement = await prisma.restaurantAnnouncement.create({
        data: {
          restaurantId: restaurant.id,
          status: 'ACTIVE',
          style: 'INFO',
          startsOn: new Date(`${localToday}T00:00:00.000Z`),
        },
      });
      const reread = await prisma.restaurantAnnouncement.findUniqueOrThrow({
        where: { id: announcement.id },
        select: { startsOn: true },
      });
      expect(reread.startsOn?.toISOString().slice(0, 10)).toBe(localToday);
      const matches = await prisma.$queryRaw<{ same: boolean }[]>`
      SELECT starts_on = ${localToday}::date AS same
        FROM restaurant_announcements WHERE id = ${announcement.id}::uuid`;
      expect(matches[0].same).toBe(true);
    });
  },
);
