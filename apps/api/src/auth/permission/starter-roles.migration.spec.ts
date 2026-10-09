import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_PERMISSIONS } from './permission';
import { STARTER_ROLE_KINDS } from './role-permissions';
import { starterRoleData } from './starter-roles';

const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261008090100_restaurant_roles/migration.sql',
);

/**
 * Permissions added AFTER the FT-12C backfill. Existing Restaurants receive them
 * through their own, later data migrations (see
 * `sessions-open-permission.migration.spec.ts`), so the original seed SQL is
 * compared against the template WITHOUT them.
 */
const ADDED_AFTER_BACKFILL: readonly string[] = ['sessions.open'];
const withoutLaterAdditions = (keys: readonly string[]): string[] =>
  keys.filter((key) => !ADDED_AFTER_BACKFILL.includes(key));

interface SeedRow {
  name: string;
  kind: string;
  permissions: string[];
}

function parseSeedRows(sql: string): SeedRow[] {
  const rows: SeedRow[] = [];
  const pattern = /\('([^']+)',\s*'([A-Z]+)',\s*ARRAY\[([^\]]*)\]::TEXT\[\]\)/g;
  for (const match of sql.matchAll(pattern)) {
    rows.push({
      name: match[1],
      kind: match[2],
      permissions: [...match[3].matchAll(/'([^']+)'/g)].map((key) => key[1]),
    });
  }
  return rows;
}

/**
 * The FT-12C backfill migration seeds every EXISTING Restaurant's starter
 * Roles in plain SQL (it cannot import the TypeScript templates), while new
 * Restaurants are seeded from `starterRoleData`. This spec keeps the two
 * identical, so an existing Restaurant and a newly provisioned one can never
 * start with different Roles.
 */
describe('FT-12C starter Role backfill migration', () => {
  const rows = parseSeedRows(readFileSync(MIGRATION, 'utf8'));

  it('seeds exactly the five starter Roles, in the same order as provisioning', () => {
    expect(rows.map((row) => row.kind)).toEqual([...STARTER_ROLE_KINDS]);
  });

  it.each(STARTER_ROLE_KINDS)('%s: name and permissions equal the code template', (kind) => {
    const sqlRow = rows.find((row) => row.kind === kind);
    const template = starterRoleData(kind);

    expect(sqlRow?.name).toBe(template.name);
    expect(sqlRow?.permissions).toEqual(withoutLaterAdditions(template.permissions));
  });

  it('the Owner seed holds every canonical Permission', () => {
    expect(rows.find((row) => row.kind === 'OWNER')?.permissions).toEqual(
      withoutLaterAdditions(ALL_PERMISSIONS),
    );
  });

  it('only the Owner seed holds roles.manage', () => {
    const holders = rows.filter((row) => row.permissions.includes('roles.manage')).map((row) => row.kind);
    expect(holders).toEqual(['OWNER']);
  });

  it('never seeds a key outside the canonical registry', () => {
    const unknown = rows.flatMap((row) => row.permissions).filter((key) => !(ALL_PERMISSIONS as readonly string[]).includes(key));
    expect(unknown).toEqual([]);
  });

  it('links Memberships by (restaurant, kind) and aborts the whole migration if any stays unlinked', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('rr."kind" = m."role"');
    expect(sql).toContain('ALTER COLUMN "role_id" SET NOT NULL');
  });
});
