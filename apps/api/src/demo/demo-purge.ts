import type { Prisma } from '../generated/prisma/client';
import { DEMO_EMAIL_DOMAIN } from './demo-constants';

/**
 * Removes ONE expired demo restaurant and everything it owns (DEC-060). This is the most dangerous code of the demo
 * feature, so it is built to refuse anything that is not a demo and to be checked by a test that looks at EVERY table:
 *
 * - the plan is computed from the database's own foreign keys (`pg_constraint`), not from a hand-kept list of tables,
 *   so a table added later is covered by itself (a RESTRICT foreign key would otherwise stop the purge loudly);
 * - rows are chosen by `restaurant_id` where the table has it, otherwise through the foreign key to a table that is
 *   already part of the demo, never through a "referenced by" link from another restaurant;
 * - a foreign key that is SET NULL (the platform audit log) is left alone: those rows stay, detached;
 * - the restaurant must be `is_demo` (checked with a row lock) or the purge throws before deleting anything.
 *
 * Uploaded files are not touched: a demo cannot upload, and the template photos are shared.
 */

export interface ForeignKeyEdge {
  childTable: string;
  childColumns: string[];
  parentTable: string;
  parentColumns: string[];
  /** Postgres `confdeltype`: a no action, r restrict, c cascade, n set null, d set default. */
  deleteRule: string;
}

export interface PurgeStep {
  table: string;
  where: string;
}

const q = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/**
 * Plans the deletion of everything that belongs to `root` rows chosen by `rootWhere` (children before parents).
 * `useRestaurantId`: tables that have a `restaurant_id` column are chosen by it (the restaurant root only).
 * Pure: takes the foreign keys and the column lists, returns SQL fragments with `$1` as the only parameter.
 */
export function buildPurgePlan(input: {
  edges: ForeignKeyEdge[];
  columnsByTable: Map<string, Set<string>>;
  root: string;
  rootWhere: string;
  useRestaurantId: boolean;
}): PurgeStep[] {
  const { edges, columnsByTable, root, rootWhere, useRestaurantId } = input;
  const live = edges.filter((edge) => edge.deleteRule !== 'n');

  // Which tables belong to the root: those that (transitively) reference it.
  const tenant = new Set<string>([root]);
  const queue = [root];
  while (queue.length > 0) {
    const parent = queue.shift() as string;
    for (const edge of live) {
      if (edge.parentTable === parent && !tenant.has(edge.childTable)) {
        tenant.add(edge.childTable);
        queue.push(edge.childTable);
      }
    }
  }

  const memo = new Map<string, string | null>();
  const visiting = new Set<string>();
  const predicate = (table: string): string | null => {
    if (table === root) return rootWhere;
    if (memo.has(table)) return memo.get(table) as string | null;
    if (visiting.has(table)) return null; // a cycle: this path adds no condition
    visiting.add(table);
    let result: string | null;
    if (useRestaurantId && columnsByTable.get(table)?.has('restaurant_id')) {
      result = `${q('restaurant_id')} = $1`;
    } else {
      const conditions: string[] = [];
      for (const edge of live) {
        if (edge.childTable !== table || edge.parentTable === table) continue;
        if (!tenant.has(edge.parentTable)) continue;
        const parentWhere = predicate(edge.parentTable);
        if (parentWhere === null) continue;
        // A composite key (restaurant_id + branch_id + ...) is matched as a whole row.
        const childColumns = edge.childColumns.map(q).join(', ');
        const parentColumns = edge.parentColumns.map(q).join(', ');
        const child =
          edge.childColumns.length > 1 ? `(${childColumns})` : childColumns;
        conditions.push(
          `${child} IN (SELECT ${parentColumns} FROM ${q(edge.parentTable)} WHERE ${parentWhere})`,
        );
      }
      result =
        conditions.length > 0
          ? conditions.map((c) => `(${c})`).join(' OR ')
          : null;
    }
    visiting.delete(table);
    memo.set(table, result);
    return result;
  };

  // Children before parents: a depth-first walk that emits a table after every table that references it.
  const order: string[] = [];
  const done = new Set<string>();
  const visit = (table: string): void => {
    if (done.has(table)) return;
    done.add(table);
    for (const edge of live) {
      if (
        edge.parentTable === table &&
        edge.childTable !== table &&
        tenant.has(edge.childTable)
      ) {
        visit(edge.childTable);
      }
    }
    order.push(table);
  };
  visit(root);

  const steps: PurgeStep[] = [];
  for (const table of order) {
    const where = predicate(table);
    if (where === null) {
      // A table that references the root but could not be tied to it (only a set-null link): nothing to delete.
      continue;
    }
    steps.push({ table, where });
  }
  return steps;
}

interface EdgeRow {
  child_table: string;
  parent_table: string;
  delete_rule: string;
  child_cols: string[];
  parent_cols: string[];
}

export async function readForeignKeys(
  tx: Prisma.TransactionClient,
): Promise<{
  edges: ForeignKeyEdge[];
  columnsByTable: Map<string, Set<string>>;
}> {
  const rows = await tx.$queryRawUnsafe<EdgeRow[]>(`
    SELECT cl.relname AS child_table,
           pl.relname AS parent_table,
           c.confdeltype::text AS delete_rule,
           ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS child_cols,
           ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS parent_cols
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class pl ON pl.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`);
  const columns = await tx.$queryRawUnsafe<
    { table_name: string; column_name: string }[]
  >(
    `SELECT table_name::text, column_name::text FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const { table_name, column_name } of columns) {
    if (!columnsByTable.has(table_name))
      columnsByTable.set(table_name, new Set());
    columnsByTable.get(table_name)?.add(column_name);
  }
  return {
    edges: rows.map((row) => ({
      childTable: row.child_table,
      parentTable: row.parent_table,
      deleteRule: row.delete_rule,
      childColumns: row.child_cols,
      parentColumns: row.parent_cols,
    })),
    columnsByTable,
  };
}

export class NotADemoError extends Error {
  constructor() {
    super('The purge only ever removes a demo restaurant');
    this.name = 'NotADemoError';
  }
}

export interface PurgeResult {
  restaurantId: string;
  tablesTouched: number;
  rowsDeleted: number;
}

/** Runs inside the caller's transaction. Throws `NotADemoError` (before any delete) for a normal restaurant. */
export async function purgeDemoRestaurant(
  tx: Prisma.TransactionClient,
  restaurantId: string,
): Promise<PurgeResult> {
  const locked = await tx.$queryRawUnsafe<{ is_demo: boolean }[]>(
    `SELECT is_demo FROM restaurants WHERE id = $1::uuid FOR UPDATE`,
    restaurantId,
  );
  if (locked.length === 0) {
    return { restaurantId, tablesTouched: 0, rowsDeleted: 0 }; // already gone
  }
  if (locked[0].is_demo !== true) throw new NotADemoError();

  // The demo's own users (synthetic addresses only), found before the memberships go.
  const users = await tx.$queryRawUnsafe<{ user_id: string }[]>(
    `SELECT DISTINCT m.user_id::text AS user_id
       FROM restaurant_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.restaurant_id = $1::uuid AND u.email_normalized LIKE $2`,
    restaurantId,
    `%@${DEMO_EMAIL_DOMAIN}`,
  );

  const { edges, columnsByTable } = await readForeignKeys(tx);
  let tablesTouched = 0;
  let rowsDeleted = 0;

  const run = async (steps: PurgeStep[], params: unknown[]): Promise<void> => {
    for (const step of steps) {
      const count = await tx.$executeRawUnsafe(
        `DELETE FROM ${q(step.table)} WHERE ${step.where}`,
        ...params,
      );
      tablesTouched += 1;
      rowsDeleted += count;
    }
  };

  await run(
    buildPurgePlan({
      edges,
      columnsByTable,
      root: 'restaurants',
      rootWhere: `${q('id')} = $1::uuid`,
      useRestaurantId: true,
    }),
    [restaurantId],
  );

  if (users.length > 0) {
    const ids = users.map((u) => u.user_id);
    await run(
      buildPurgePlan({
        edges,
        columnsByTable,
        root: 'users',
        rootWhere: `${q('id')} = ANY($1::uuid[])`,
        useRestaurantId: false,
      }),
      [ids],
    );
  }
  return { restaurantId, tablesTouched, rowsDeleted };
}
