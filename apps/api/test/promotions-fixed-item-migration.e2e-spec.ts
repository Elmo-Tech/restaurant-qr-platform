import {
  assertSandboxUrl,
  sandboxDatabaseName,
  SANDBOX_MARKER,
  SANDBOX_ROLE,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

/**
 * DEC-077 B1 migration `20261201090000_promotions_fixed_item_scope` on REAL PostgreSQL: exactly the two obsolete
 * "item scope is percentage only" CHECKs are gone, every other CHECK stays, and fixed CATEGORY / MENU rows are
 * accepted in `promotions` and in the historical `order_promotions`. Sandbox-only (see `support/sandbox-guard.ts`);
 * everything runs in ONE transaction that is rolled back, so no row is left behind.
 */
const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const MIGRATION = '20261201090000_promotions_fixed_item_scope';

interface PgError {
  code?: string;
  constraint?: string;
}

describeSandbox('DEC-077 B1 migration (real PostgreSQL)', () => {
  let db: Client;
  let restaurantId: string;

  beforeAll(async () => {
    assertSandboxUrl(SANDBOX_URL as string);
    db = new Client({ connectionString: SANDBOX_URL as string });
    await db.connect();
    const identity = await db.query<{
      db: string;
      usr: string;
      marker: string | null;
    }>(
      `SELECT current_database()::text AS db, current_user::text AS usr, shobj_description(d.oid, 'pg_database') AS marker
       FROM pg_database d WHERE d.datname = current_database()`,
    );
    if (
      identity.rows[0]?.db !== sandboxDatabaseName() ||
      identity.rows[0]?.marker !== SANDBOX_MARKER ||
      identity.rows[0]?.usr !== SANDBOX_ROLE
    ) {
      await db.end();
      throw new Error(
        'Refusing to run: connected database is not the marked integration sandbox',
      );
    }
    await db.query('BEGIN');
    restaurantId = randomUUID();
    await db.query(
      `INSERT INTO restaurants (id, public_id, name, status, default_locale, currency_code, updated_at)
       VALUES ($1, $2, 'IT fixed item', 'ACTIVE', 'en', 'EGP', now())`,
      [restaurantId, `it-b1-mig-${randomUUID()}`],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.query('ROLLBACK');
      await db.end();
    }
  });

  async function refused(sql: string, params: unknown[]): Promise<PgError> {
    await db.query('SAVEPOINT probe');
    try {
      await db.query(sql, params);
    } catch (error) {
      await db.query('ROLLBACK TO SAVEPOINT probe');
      return error as PgError;
    }
    await db.query('RELEASE SAVEPOINT probe');
    throw new Error('expected a refusal, but the statement succeeded');
  }

  const INSERT_PROMOTION = `INSERT INTO promotions (id, restaurant_id, internal_name, scope, discount_type, value, status, updated_at)
    VALUES ($1, $2, 'IT', $3, $4, $5, 'INACTIVE', now())`;

  it('is exactly two DROP CONSTRAINT statements (no data, CHECK, trigger, column or enum change)', () => {
    const migrations = path.resolve(__dirname, '..', 'prisma', 'migrations');
    expect(readdirSync(migrations)).toContain(MIGRATION);
    const sql = readFileSync(
      path.join(migrations, MIGRATION, 'migration.sql'),
      'utf8',
    )
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    const statements = sql
      .split(';')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    expect(statements).toEqual([
      'ALTER TABLE "promotions" DROP CONSTRAINT "promotions_item_scope_percentage_only"',
      'ALTER TABLE "order_promotions" DROP CONSTRAINT "order_promotions_item_scope_percentage_only"',
    ]);
  });

  it('the two obsolete CHECKs are gone and every other CHECK remains', async () => {
    const result = await db.query<{ table: string; name: string }>(
      `SELECT conrelid::regclass::text AS "table", conname AS name FROM pg_constraint
       WHERE contype = 'c' AND conrelid IN ('promotions'::regclass, 'order_promotions'::regclass)`,
    );
    const names = result.rows.map((row) => `${row.table}.${row.name}`);
    expect(
      names.filter((name) => name.includes('item_scope_percentage_only')),
    ).toEqual([]);
    expect(names).toEqual(
      expect.arrayContaining([
        'promotions.promotions_value_positive',
        'promotions.promotions_percentage_max_100',
        'promotions.promotions_quantity_shape',
        'promotions.promotions_minimum_subtotal_shape',
        'promotions.promotions_dates_ordered',
        'promotions.promotions_priority_range',
        'order_promotions.order_promotions_value_positive',
        'order_promotions.order_promotions_percentage_max_100',
        'order_promotions.order_promotions_amount_positive',
      ]),
    );
  });

  it('accepts FIXED_AMOUNT and PERCENTAGE for CATEGORY and MENU promotions', async () => {
    for (const scope of ['CATEGORY', 'MENU']) {
      for (const type of ['FIXED_AMOUNT', 'PERCENTAGE']) {
        await db.query(INSERT_PROMOTION, [
          randomUUID(),
          restaurantId,
          scope,
          type,
          '15',
        ]);
      }
    }
    // a fixed amount may exceed 100: the percentage cap applies to PERCENTAGE only
    await db.query(INSERT_PROMOTION, [
      randomUUID(),
      restaurantId,
      'CATEGORY',
      'FIXED_AMOUNT',
      '500',
    ]);
  });

  it('still refuses a zero / negative value, a percentage above 100 and a minimum on item scope', async () => {
    const zero = await refused(INSERT_PROMOTION, [
      randomUUID(),
      restaurantId,
      'CATEGORY',
      'FIXED_AMOUNT',
      '0',
    ]);
    expect({ code: zero.code, constraint: zero.constraint }).toEqual({
      code: '23514',
      constraint: 'promotions_value_positive',
    });
    const pct = await refused(INSERT_PROMOTION, [
      randomUUID(),
      restaurantId,
      'MENU',
      'PERCENTAGE',
      '100.01',
    ]);
    expect({ code: pct.code, constraint: pct.constraint }).toEqual({
      code: '23514',
      constraint: 'promotions_percentage_max_100',
    });
    const minimum = await refused(
      `INSERT INTO promotions (id, restaurant_id, internal_name, scope, discount_type, value, status, minimum_subtotal, updated_at)
       VALUES ($1, $2, 'IT', 'CATEGORY', 'FIXED_AMOUNT', 10, 'INACTIVE', 100, now())`,
      [randomUUID(), restaurantId],
    );
    expect({ code: minimum.code, constraint: minimum.constraint }).toEqual({
      code: '23514',
      constraint: 'promotions_minimum_subtotal_shape',
    });
  });

  it('the historical order_promotions table accepts a FIXED_AMOUNT CATEGORY / MENU row', async () => {
    const branchId = randomUUID();
    const qrId = randomUUID();
    const orderId = randomUUID();
    const promotionId = randomUUID();
    await db.query(
      `INSERT INTO branches (id, public_id, restaurant_id, name, status, timezone, updated_at)
       VALUES ($1, $2, $3, 'Main', 'ACTIVE', 'Africa/Cairo', now())`,
      [branchId, `it-b1-br-${randomUUID()}`, restaurantId],
    );
    await db.query(
      `INSERT INTO qr_codes (id, public_code, restaurant_id, type, status, updated_at)
       VALUES ($1, $2, $3, 'GENERIC', 'ACTIVE', now())`,
      [qrId, `it-b1-qr-${randomUUID()}`, restaurantId],
    );
    await db.query(
      `INSERT INTO orders (id, restaurant_id, branch_id, qr_code_id, client_request_id, status, type, currency_code,
                           total_amount, subtotal_amount, delivery_fee_amount, discount_total_amount,
                           promotion_discount_amount, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 'PICKUP', 'EGP', 100, 100, 0, 200, 200, now())`,
      [orderId, restaurantId, branchId, qrId, randomUUID()],
    );
    await db.query(INSERT_PROMOTION, [
      promotionId,
      restaurantId,
      'CATEGORY',
      'FIXED_AMOUNT',
      '70',
    ]);
    for (const scope of ['CATEGORY', 'MENU']) {
      await db.query(
        `INSERT INTO order_promotions (id, order_id, restaurant_id, promotion_id, scope, discount_type, value, amount,
                                       internal_name_snapshot, title_snapshot, config_snapshot)
         VALUES ($1, $2, $3, $4, $5, 'FIXED_AMOUNT', 70, 200, 'IT', 'Pizza 70 off', '{"value":"70.00"}')`,
        [randomUUID(), orderId, restaurantId, promotionId, scope],
      );
    }
    // the amount saved is its own column (capped per unit, so it can exceed neither value x units nor be <= 0)
    const bad = await refused(
      `INSERT INTO order_promotions (id, order_id, restaurant_id, promotion_id, scope, discount_type, value, amount,
                                     internal_name_snapshot, title_snapshot, config_snapshot)
       VALUES ($1, $2, $3, $4, 'CATEGORY', 'FIXED_AMOUNT', 70, 0, 'IT', 'x', '{}')`,
      [randomUUID(), orderId, restaurantId, promotionId],
    );
    expect(bad.constraint).toBe('order_promotions_amount_positive');
  });
});
