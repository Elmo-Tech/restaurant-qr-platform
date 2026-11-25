import {
  assertSandboxUrl,
  sandboxDatabaseName,
  SANDBOX_MARKER,
  SANDBOX_ROLE,
  SANDBOX_URL,
} from './support/sandbox-guard';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * Unified Promotions B1 (DEC-075; Product Owner correction B-1, 2026-11-22): REAL-PostgreSQL adversarial tests of the
 * historical tenant isolation of `order_promotions` / `order_promotion_allocations`. Every rule here is enforced by
 * the DATABASE (composite foreign keys of migration `20261128100000_unified_promotions`), not by application code, so
 * the tests write with raw SQL and assert SQLSTATE + the exact constraint name.
 *
 * Isolation: see `support/sandbox-guard.ts` (sandbox-only, identity-checked, skipped without
 * TABLE_SESSION_IT_DATABASE_URL). Everything runs inside ONE transaction that is rolled back in `afterAll`, so the
 * suite leaves no row behind; each refused statement is isolated by a SAVEPOINT.
 */

const describeSandbox = SANDBOX_URL ? describe : describe.skip;

interface PgError {
  code?: string;
  constraint?: string;
}

interface Tenant {
  restaurantId: string;
  branchId: string;
  qrCodeId: string;
  productId: string;
}

describeSandbox(
  'Unified Promotions historical integrity (real PostgreSQL)',
  () => {
    let db: Client;

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
    });

    afterAll(async () => {
      if (db) {
        await db.query('ROLLBACK');
        await db.end();
      }
    });

    async function run(sql: string, params: unknown[] = []): Promise<number> {
      const result = await db.query(sql, params);
      return result.rowCount ?? 0;
    }

    /** Runs `sql` expecting a refusal; returns the PostgreSQL error (the transaction stays usable). */
    async function refused(
      sql: string,
      params: unknown[] = [],
    ): Promise<PgError> {
      await db.query('SAVEPOINT probe');
      try {
        await db.query(sql, params);
      } catch (error) {
        await db.query('ROLLBACK TO SAVEPOINT probe');
        return error as PgError;
      }
      await db.query('RELEASE SAVEPOINT probe');
      throw new Error(`expected a refusal, but it succeeded: ${sql}`);
    }

    /** A row that would reference a missing / foreign key: SQLSTATE 23503 foreign_key_violation. */
    async function expectForeignKey(
      sql: string,
      params: unknown[],
      constraint: string,
    ): Promise<void> {
      const error = await refused(sql, params);
      expect({ code: error.code, constraint: error.constraint }).toEqual({
        code: '23503',
        constraint,
      });
    }

    /**
     * Deleting a row still referenced through an ON DELETE RESTRICT key: PostgreSQL reports SQLSTATE 23001
     * restrict_violation (23503 is only used for NO ACTION); Prisma maps both to P2003.
     */
    async function expectRestrict(
      sql: string,
      params: unknown[],
      constraint: string,
    ): Promise<void> {
      const error = await refused(sql, params);
      expect({ code: error.code, constraint: error.constraint }).toEqual({
        code: '23001',
        constraint,
      });
    }

    // ---------------------------------------------------------------- fixtures

    async function seedTenant(label: string): Promise<Tenant> {
      const t: Tenant = {
        restaurantId: randomUUID(),
        branchId: randomUUID(),
        qrCodeId: randomUUID(),
        productId: randomUUID(),
      };
      const menuId = randomUUID();
      const categoryId = randomUUID();
      await run(
        `INSERT INTO restaurants (id, public_id, name, status, default_locale, currency_code, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 'en', 'EGP', now())`,
        [t.restaurantId, `it-promo-${randomUUID()}`, `IT promo ${label}`],
      );
      await run(
        `INSERT INTO branches (id, public_id, restaurant_id, name, status, timezone, updated_at)
       VALUES ($1, $2, $3, 'Main', 'ACTIVE', 'Africa/Cairo', now())`,
        [t.branchId, `it-promo-br-${randomUUID()}`, t.restaurantId],
      );
      await run(
        `INSERT INTO qr_codes (id, public_code, restaurant_id, type, status, updated_at)
       VALUES ($1, $2, $3, 'GENERIC', 'ACTIVE', now())`,
        [t.qrCodeId, `it-promo-qr-${randomUUID()}`, t.restaurantId],
      );
      await run(
        `INSERT INTO menus (id, restaurant_id, name_internal, status, display_order, is_primary, updated_at)
       VALUES ($1, $2, 'm', 'ACTIVE', 0, true, now())`,
        [menuId, t.restaurantId],
      );
      await run(
        `INSERT INTO categories (id, restaurant_id, menu_id, status, display_order, updated_at)
       VALUES ($1, $2, $3, 'ACTIVE', 0, now())`,
        [categoryId, t.restaurantId, menuId],
      );
      await run(
        `INSERT INTO products (id, public_id, restaurant_id, category_id, status, availability, base_price,
                             display_order, allow_customer_notes, featured, updated_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'AVAILABLE', 100, 0, false, false, now())`,
        [t.productId, `it-promo-p-${randomUUID()}`, t.restaurantId, categoryId],
      );
      return t;
    }

    /** A PICKUP order of 200.00 gross with two 100.00 lines; returns the order and line ids. */
    async function seedOrder(
      t: Tenant,
    ): Promise<{ orderId: string; itemIds: [string, string] }> {
      const orderId = randomUUID();
      const itemIds: [string, string] = [randomUUID(), randomUUID()];
      await run(
        `INSERT INTO orders (id, restaurant_id, branch_id, qr_code_id, client_request_id, status, type, currency_code,
                           total_amount, subtotal_amount, delivery_fee_amount, discount_total_amount,
                           promotion_discount_amount, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 'PICKUP', 'EGP', 150, 150, 0, 50, 50, now())`,
        [orderId, t.restaurantId, t.branchId, t.qrCodeId, randomUUID()],
      );
      for (const itemId of itemIds) {
        await run(
          `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, 'IT product', 100, 1, 100)`,
          [itemId, orderId, t.productId],
        );
      }
      return { orderId, itemIds };
    }

    async function seedPromotion(
      t: Tenant,
      scope: 'CART' | 'DELIVERY' = 'CART',
    ): Promise<string> {
      const id = randomUUID();
      await run(
        `INSERT INTO promotions (id, restaurant_id, internal_name, scope, discount_type, value, status, updated_at)
       VALUES ($1, $2, 'IT cart 50', $3, 'FIXED_AMOUNT', 50, 'ACTIVE', now())`,
        [id, t.restaurantId, scope],
      );
      return id;
    }

    const INSERT_ORDER_PROMOTION = `INSERT INTO order_promotions
      (id, order_id, restaurant_id, promotion_id, scope, discount_type, value, amount, internal_name_snapshot,
       title_snapshot, config_snapshot)
    VALUES ($1, $2, $3, $4, $5, 'FIXED_AMOUNT', 50, 50, 'IT cart 50', 'Cart 50', '{"value":"50.00"}')`;

    async function seedOrderPromotion(
      t: Tenant,
      orderId: string,
      promotionId: string,
      scope: 'CART' | 'DELIVERY' = 'CART',
    ): Promise<string> {
      const id = randomUUID();
      await run(INSERT_ORDER_PROMOTION, [
        id,
        orderId,
        t.restaurantId,
        promotionId,
        scope,
      ]);
      return id;
    }

    const INSERT_ALLOCATION = `INSERT INTO order_promotion_allocations (order_promotion_id, order_item_id, order_id, amount)
    VALUES ($1, $2, $3, 25)`;

    let a: Tenant;
    let b: Tenant;

    beforeAll(async () => {
      a = await seedTenant('A');
      b = await seedTenant('B');
    });

    // ------------------------------------------------------- tenant isolation

    it('an order_promotions row cannot reference an Order of another Restaurant', async () => {
      const orderB = await seedOrder(b);
      const promotionA = await seedPromotion(a);

      await expectForeignKey(
        INSERT_ORDER_PROMOTION,
        [randomUUID(), orderB.orderId, a.restaurantId, promotionA, 'CART'],
        'order_promotions_order_scope_fkey',
      );
    });

    it("an order_promotions row cannot use another Restaurant's Promotion", async () => {
      const orderA = await seedOrder(a);
      const promotionB = await seedPromotion(b);

      await expectForeignKey(
        INSERT_ORDER_PROMOTION,
        [randomUUID(), orderA.orderId, a.restaurantId, promotionB, 'CART'],
        'order_promotions_promotion_scope_fkey',
      );
      // Claiming the other Restaurant instead only moves the refusal to the Order side.
      await expectForeignKey(
        INSERT_ORDER_PROMOTION,
        [randomUUID(), orderA.orderId, b.restaurantId, promotionB, 'CART'],
        'order_promotions_order_scope_fkey',
      );
    });

    it('an order_promotions row always names its Promotion (promotion_id NOT NULL)', async () => {
      const orderA = await seedOrder(a);

      const error = await refused(INSERT_ORDER_PROMOTION, [
        randomUUID(),
        orderA.orderId,
        a.restaurantId,
        null,
        'CART',
      ]);

      expect(error.code).toBe('23502');
    });

    it('an allocation must reference an existing parent order_promotions row', async () => {
      const orderA = await seedOrder(a);

      await expectForeignKey(
        INSERT_ALLOCATION,
        [randomUUID(), orderA.itemIds[0], orderA.orderId],
        'order_promotion_allocations_order_promotion_scope_fkey',
      );
    });

    it('an allocation cannot point at a line of a different Order of the same Restaurant', async () => {
      const order1 = await seedOrder(a);
      const order2 = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order1.orderId,
        promotion,
      );

      // order_id of the parent row: the line does not belong to that Order.
      await expectForeignKey(
        INSERT_ALLOCATION,
        [orderPromotion, order2.itemIds[0], order1.orderId],
        'order_promotion_allocations_order_item_scope_fkey',
      );
      // order_id of the line: the parent row does not belong to that Order.
      await expectForeignKey(
        INSERT_ALLOCATION,
        [orderPromotion, order2.itemIds[0], order2.orderId],
        'order_promotion_allocations_order_promotion_scope_fkey',
      );
    });

    it("an allocation cannot point at another Restaurant's line", async () => {
      const orderA = await seedOrder(a);
      const orderB = await seedOrder(b);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        orderA.orderId,
        promotion,
      );

      await expectForeignKey(
        INSERT_ALLOCATION,
        [orderPromotion, orderB.itemIds[0], orderA.orderId],
        'order_promotion_allocations_order_item_scope_fkey',
      );
      await expectForeignKey(
        INSERT_ALLOCATION,
        [orderPromotion, orderB.itemIds[0], orderB.orderId],
        'order_promotion_allocations_order_promotion_scope_fkey',
      );
    });

    it('a same-Order allocation is accepted and reconciles with the order totals', async () => {
      const order = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order.orderId,
        promotion,
      );

      expect(
        await run(INSERT_ALLOCATION, [
          orderPromotion,
          order.itemIds[0],
          order.orderId,
        ]),
      ).toBe(1);
      expect(
        await run(INSERT_ALLOCATION, [
          orderPromotion,
          order.itemIds[1],
          order.orderId,
        ]),
      ).toBe(1);

      const totals = await db.query<{
        gross: string;
        allocated: string;
        subtotal: string;
      }>(
        `SELECT (SELECT sum(line_total) FROM order_items WHERE order_id = o.id)::text AS gross,
              (SELECT sum(amount) FROM order_promotion_allocations WHERE order_id = o.id)::text AS allocated,
              o.subtotal_amount::text AS subtotal
         FROM orders o WHERE o.id = $1`,
        [order.orderId],
      );
      expect(totals.rows[0]).toEqual({
        gross: '200.00',
        allocated: '50.00',
        subtotal: '150.00',
      });
    });

    // --------------------------------------------- history vs configuration

    it('deleting a Promotion used by an Order is refused; archiving / editing it leaves the history untouched', async () => {
      const order = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order.orderId,
        promotion,
      );
      await run(INSERT_ALLOCATION, [
        orderPromotion,
        order.itemIds[0],
        order.orderId,
      ]);
      await run(
        `INSERT INTO promotion_translations (id, promotion_id, locale, title) VALUES ($1, $2, 'en', 'Cart 50')`,
        [randomUUID(), promotion],
      );
      const before = await db.query(
        `SELECT p.*, (SELECT json_agg(x ORDER BY x.order_item_id) FROM order_promotion_allocations x
                     WHERE x.order_promotion_id = p.id) AS allocations
         FROM order_promotions p WHERE p.id = $1`,
        [orderPromotion],
      );

      await expectRestrict(
        'DELETE FROM promotions WHERE id = $1',
        [promotion],
        'order_promotions_promotion_scope_fkey',
      );

      expect(
        await run(
          `UPDATE promotions SET value = 10, discount_type = 'PERCENTAGE', internal_name = 'renamed', priority = 5
          WHERE id = $1`,
          [promotion],
        ),
      ).toBe(1);
      expect(
        await run(
          `UPDATE promotion_translations SET title = 'Renamed' WHERE promotion_id = $1`,
          [promotion],
        ),
      ).toBe(1);
      expect(
        await run(
          `UPDATE promotions SET status = 'ARCHIVED', archived_at = now() WHERE id = $1`,
          [promotion],
        ),
      ).toBe(1);
      await run('DELETE FROM promotion_translations WHERE promotion_id = $1', [
        promotion,
      ]);

      const after = await db.query<
        Record<string, unknown> & { allocations: unknown[] | null }
      >(
        `SELECT p.*, (SELECT json_agg(x ORDER BY x.order_item_id) FROM order_promotion_allocations x
                     WHERE x.order_promotion_id = p.id) AS allocations
         FROM order_promotions p WHERE p.id = $1`,
        [orderPromotion],
      );
      expect(after.rows).toEqual(before.rows);
      expect(after.rows[0]).toMatchObject({
        promotion_id: promotion,
        value: '50.00',
        amount: '50.00',
        internal_name_snapshot: 'IT cart 50',
        title_snapshot: 'Cart 50',
      });
      expect(after.rows[0].allocations).toHaveLength(1);
    });

    it("a Promotion that has history cannot be moved to another Restaurant (the history's tenant never changes)", async () => {
      const order = await seedOrder(a);
      const promotion = await seedPromotion(a);
      await seedOrderPromotion(a, order.orderId, promotion);

      // ON UPDATE CASCADE carries the new restaurant_id into order_promotions, where the Order key refuses it.
      await expectForeignKey(
        'UPDATE promotions SET restaurant_id = $2 WHERE id = $1',
        [promotion, b.restaurantId],
        'order_promotions_order_scope_fkey',
      );
    });

    it('a Promotion with no history can still be deleted (its configuration rows cascade)', async () => {
      const promotion = await seedPromotion(a);
      await run(
        `INSERT INTO promotion_translations (id, promotion_id, locale, title) VALUES ($1, $2, 'en', 'Unused')`,
        [randomUUID(), promotion],
      );

      expect(
        await run('DELETE FROM promotions WHERE id = $1', [promotion]),
      ).toBe(1);
    });

    // ------------------------------------------------- Order / line history

    it('an Order with applied promotions cannot be deleted (RESTRICT, like its lines)', async () => {
      // A DELIVERY row has no allocation and the order no line, so ONLY the new key can refuse.
      const orderId = randomUUID();
      await run(
        `INSERT INTO orders (id, restaurant_id, branch_id, qr_code_id, client_request_id, status, type, currency_code,
                           total_amount, subtotal_amount, delivery_fee_amount, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 'PICKUP', 'EGP', 0, 0, 0, now())`,
        [orderId, a.restaurantId, a.branchId, a.qrCodeId, randomUUID()],
      );
      const promotion = await seedPromotion(a, 'DELIVERY');
      await seedOrderPromotion(a, orderId, promotion, 'DELIVERY');

      await expectRestrict(
        'DELETE FROM orders WHERE id = $1',
        [orderId],
        'order_promotions_order_scope_fkey',
      );
    });

    it('existing Order history semantics are unchanged: an Order with lines still cannot be deleted', async () => {
      const order = await seedOrder(a);

      await expectRestrict(
        'DELETE FROM orders WHERE id = $1',
        [order.orderId],
        'order_items_order_id_fkey',
      );
    });

    it('a line carrying a promotion share cannot be deleted or moved to another Order', async () => {
      const order = await seedOrder(a);
      const other = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order.orderId,
        promotion,
      );
      await run(INSERT_ALLOCATION, [
        orderPromotion,
        order.itemIds[0],
        order.orderId,
      ]);

      await expectRestrict(
        'DELETE FROM order_items WHERE id = $1',
        [order.itemIds[0]],
        'order_promotion_allocations_order_item_scope_fkey',
      );
      // ON UPDATE CASCADE moves the share's order_id with the line; the parent row key then refuses it.
      await expectForeignKey(
        'UPDATE order_items SET order_id = $2 WHERE id = $1',
        [order.itemIds[0], other.orderId],
        'order_promotion_allocations_order_promotion_scope_fkey',
      );
      // A line without a share keeps today's behavior (it can be deleted; nothing references it).
      expect(
        await run('DELETE FROM order_items WHERE id = $1', [order.itemIds[1]]),
      ).toBe(1);
    });

    it('an applied-promotion row cannot be re-pointed at another Order', async () => {
      const order = await seedOrder(a);
      const other = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order.orderId,
        promotion,
      );
      await run(INSERT_ALLOCATION, [
        orderPromotion,
        order.itemIds[0],
        order.orderId,
      ]);

      await expectForeignKey(
        'UPDATE order_promotions SET order_id = $2 WHERE id = $1',
        [orderPromotion, other.orderId],
        'order_promotion_allocations_order_item_scope_fkey',
      );
    });

    it('the shares are a pure split of their row: removing the row removes only its shares', async () => {
      const order = await seedOrder(a);
      const promotion = await seedPromotion(a);
      const orderPromotion = await seedOrderPromotion(
        a,
        order.orderId,
        promotion,
      );
      await run(INSERT_ALLOCATION, [
        orderPromotion,
        order.itemIds[0],
        order.orderId,
      ]);

      expect(
        await run('DELETE FROM order_promotions WHERE id = $1', [
          orderPromotion,
        ]),
      ).toBe(1);

      const left = await db.query<{ allocations: number; items: number }>(
        `SELECT (SELECT count(*)::int FROM order_promotion_allocations WHERE order_id = $1) AS allocations,
              (SELECT count(*)::int FROM order_items WHERE order_id = $1) AS items`,
        [order.orderId],
      );
      expect(left.rows[0]).toEqual({ allocations: 0, items: 2 });
    });
  },
);
