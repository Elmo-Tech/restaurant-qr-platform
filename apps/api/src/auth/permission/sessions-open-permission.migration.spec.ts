import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS } from './permission';
import { ROLE_PERMISSIONS } from './role-permissions';

const MIGRATION = join(
  __dirname,
  '../../../prisma/migrations/20261010090000_add_sessions_open_permission/migration.sql',
);

/**
 * Static guards on the `sessions.open` data migration (decision D3 / P8). The
 * behavior on real rows is proven against PostgreSQL in
 * `test/table-sessions-lifecycle.e2e-spec.ts`.
 */
describe('sessions.open permission migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const statement = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  it('uses the canonical registry key', () => {
    expect(PERMISSIONS.SESSIONS_OPEN).toBe('sessions.open');
    expect(statement).toContain("'sessions.open'");
  });

  it('only targets starter kinds, never CUSTOM, WAITER or KITCHEN', () => {
    expect(statement).toContain(`"kind" IN ('OWNER', 'MANAGER', 'CASHIER')`);
    expect(statement).not.toMatch(/CUSTOM|WAITER|KITCHEN/);
  });

  it('requires BOTH sessions.close and sessions.settle (respects deliberate removals)', () => {
    expect(statement).toContain(`'sessions.close' = ANY("permissions")`);
    expect(statement).toContain(`'sessions.settle' = ANY("permissions")`);
  });

  it('is idempotent and matches by kind, never by name', () => {
    expect(statement).toContain(`NOT ('sessions.open' = ANY("permissions"))`);
    expect(statement).not.toMatch(/"name"/);
  });

  it('is a single UPDATE (no DDL, no deletes)', () => {
    expect(statement.match(/\bUPDATE\b/g)).toHaveLength(1);
    expect(statement).not.toMatch(/\b(DROP|DELETE|ALTER|CREATE|TRUNCATE)\b/i);
  });

  it('the code templates grant it only to MANAGER and CASHIER (OWNER always has every key)', () => {
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISSIONS.SESSIONS_OPEN);
    expect(ROLE_PERMISSIONS.CASHIER).toContain(PERMISSIONS.SESSIONS_OPEN);
    expect(ROLE_PERMISSIONS.WAITER).not.toContain(PERMISSIONS.SESSIONS_OPEN);
    expect(ROLE_PERMISSIONS.KITCHEN).not.toContain(PERMISSIONS.SESSIONS_OPEN);
  });
});
