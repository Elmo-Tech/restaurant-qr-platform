import { assertSandboxIdentity, SANDBOX_URL } from './support/sandbox-guard';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';

const describeSandbox = SANDBOX_URL ? describe : describe.skip;
const migrationRoot = join(__dirname, '../prisma/migrations');
const grantMigration = '20261130090000_onboarding_import_grants';

describeSandbox('populated pre-grant upgrade (PostgreSQL)', () => {
  it('preserves real pre-grant cases and published menu data through the grant migration', async () => {
    const guard = new PrismaService(
      new ConfigService({ DATABASE_URL: SANDBOX_URL }),
    );
    const admin = new Client({ connectionString: SANDBOX_URL });
    const database = `restaurant_qr_upgrade_${randomUUID().replace(/-/g, '')}_test`;
    const url = new URL(SANDBOX_URL!);
    url.pathname = `/${database}`;
    const upgraded = new Client({ connectionString: url.toString() });
    let created = false;
    let connected = false;
    try {
      await assertSandboxIdentity(guard);
      await admin.connect();
      // A fresh, randomly named database avoids running historical SQL against
      // even the already-migrated sandbox schema. No existing DB is modified.
      await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
      created = true;
      await upgraded.connect();
      connected = true;
      const identity = await upgraded.query(
        'SELECT current_database() AS db, current_user AS usr',
      );
      expect(identity.rows[0]).toEqual({
        db: database,
        usr: 'restaurant_qr_it',
      });
      const migrations = readdirSync(migrationRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
      const index = migrations.indexOf(grantMigration);
      expect(index).toBeGreaterThan(0);
      for (const migration of migrations.slice(0, index)) {
        await upgraded.query(
          readFileSync(join(migrationRoot, migration, 'migration.sql'), 'utf8'),
        );
      }

      const restaurantId = randomUUID();
      const menuId = randomUUID();
      await upgraded.query(
        `INSERT INTO restaurants (id, public_id, name, status, default_locale, currency_code, updated_at)
         VALUES ($1, $2, 'Published restaurant', 'ACTIVE', 'en', 'EGP', now())`,
        [restaurantId, randomUUID()],
      );
      await upgraded.query(
        `INSERT INTO menus (id, restaurant_id, name_internal, status, display_order, is_primary, updated_at)
         VALUES ($1, $2, 'Published menu', 'ACTIVE', 0, true, now())`,
        [menuId, restaurantId],
      );
      await upgraded.query(
        `INSERT INTO menu_translations (id, menu_id, locale, name) VALUES ($1, $2, 'en', 'Retained menu')`,
        [randomUUID(), menuId],
      );
      const rows = [
        ['manual', { origin: 'manual', text: 'retained' }, null, false, null],
        [
          'markerless-import',
          { origin: 'import', text: 'markerless' },
          null,
          true,
          null,
        ],
        [
          'intact-import',
          { origin: 'import', text: 'intact' },
          '2099-01-01T00:00:00Z',
          false,
          null,
        ],
        [
          'expired-import',
          { origin: 'import', text: 'expired' },
          '2000-01-01T00:00:00Z',
          false,
          null,
        ],
        [
          'published',
          { origin: 'import', text: 'published' },
          null,
          true,
          '2026-01-01T00:00:00Z',
        ],
        ['deleted', null, null, false, null],
      ] as const;
      for (const [label, draft, expiry, reviewed, publishedAt] of rows) {
        await upgraded.query(
          `INSERT INTO onboarding_cases
             (id, mode, details, menu_draft, import_expires_at, import_reviewed, menu_published_at, restaurant_id, updated_at)
           VALUES ($1, 'REAL', $2, $3, $4, $5, $6, $7, now())`,
          [
            randomUUID(),
            { label },
            draft,
            expiry,
            reviewed,
            publishedAt,
            label === 'published' ? restaurantId : null,
          ],
        );
      }
      const before = await upgraded.query(
        'SELECT * FROM onboarding_cases ORDER BY id',
      );
      const beforeMenus = await upgraded.query(
        'SELECT * FROM menus ORDER BY id',
      );
      const beforeTranslations = await upgraded.query(
        'SELECT * FROM menu_translations ORDER BY id',
      );
      await upgraded.query(
        readFileSync(
          join(migrationRoot, grantMigration, 'migration.sql'),
          'utf8',
        ),
      );
      const after = await upgraded.query(
        'SELECT * FROM onboarding_cases ORDER BY id',
      );
      expect(after.rows).toHaveLength(rows.length);
      for (let i = 0; i < before.rows.length; i++) {
        expect(after.rows[i]).toMatchObject({
          ...before.rows[i],
          menu_provenance:
            before.rows[i].menu_draft === null ? 'MANUAL' : 'LEGACY',
          import_grant_id: null,
          import_draft_grant_id: null,
        });
      }
      expect(
        (await upgraded.query('SELECT * FROM menus ORDER BY id')).rows,
      ).toEqual(beforeMenus.rows);
      expect(
        (await upgraded.query('SELECT * FROM menu_translations ORDER BY id'))
          .rows,
      ).toEqual(beforeTranslations.rows);
    } finally {
      if (connected) await upgraded.end();
      if (created) await admin.query(`DROP DATABASE "${database}"`);
      await admin.end();
      await guard.$disconnect();
    }
  }, 120000);
});
