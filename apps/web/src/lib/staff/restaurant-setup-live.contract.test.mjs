import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const base = '../../app/staff/restaurants/[restaurantId]';
const entry = read(base + '/page.tsx');
const ops = read(base + '/dashboard/OperationsDashboard.tsx');
const settings = read(base + '/settings/overview/page.tsx');
const setupPage = read(base + '/setup/page.tsx');
const panel = read('../../components/staff/RestaurantSetupPanel.tsx');
const api = read('./restaurant-setup-api.ts');
const service = read('../../../../api/src/restaurants/restaurant-setup.service.ts');
const controller = read('../../../../api/src/restaurants/restaurant-setup.controller.ts');
const provision = read('../../../../api/src/provisioning/provision-restaurant.ts');
const migration = read('../../../../api/prisma/migrations/20261113090000_restaurant_setup_checklist/migration.sql');

test('setup is reachable without typing /setup-preview and operational warnings retain priority', () => {
  assert.match(ops, /<AttentionPanel/);
  assert.match(ops, /<RestaurantSetupPanel/);
  assert.ok(ops.indexOf('<AttentionPanel') < ops.indexOf('<RestaurantSetupPanel'));
  assert.match(entry, /setupEligible/);
  assert.match(entry, /membership\.allBranches/);
  assert.match(settings, /mode="settings"/);
  assert.match(settings, /RestaurantSetupPanel/);
  assert.match(setupPage, /mode="page"/);
  assert.match(setupPage, /canViewRestaurantSettings\(member\)/);
});

test('real guide uses actual API state only; preview fixtures remain separate', () => {
  assert.match(panel, /getSetupStatus\(restaurantId\)/);
  assert.match(panel, /status\.enrolled/);
  assert.match(panel, /!status\.enrolled \|\| status\.completed \|\| status\.hidden/);
  assert.match(panel, /summarizeSetupSteps\(status\.steps\)/);
  assert.doesNotMatch(panel, /buildSetupPreviewSteps|PREVIEW_STATES/);
  assert.doesNotMatch(setupPage, /setup-preview|buildSetupPreviewSteps/);
  assert.match(api, /apiFetch/);
  assert.match(api, /method: 'POST'/);
});

test('hide is per-user, final confirmation is owner-only, and review is explicit', () => {
  assert.match(panel, /setSetupVisibility\(restaurantId, true\)/);
  assert.match(panel, /setSetupVisibility\(restaurantId, false\)/);
  assert.match(panel, /reviewSetupStep\(restaurantId, step/);
  assert.match(panel, /summary\.readyForOwnerReview && status\.owner/);
  assert.match(panel, /completeSetup\(restaurantId\)/);
  assert.match(controller, /request\.auth\.userId/);
  assert.match(controller, /this\.assertOwner\(request\)/);
  assert.match(controller, /AllBranchesRequiredGuard/);
});

test('backend only persists review signatures and canonical verified values', () => {
  assert.match(service, /deriveSetupStatuses/);
  assert.match(service, /category:\\s*\\{\\s*status:\\s*'ACTIVE',\\s*menu:\\s*\\{\\s*status:\\s*'ACTIVE',\\s*restaurantId\\s*\\}/);
  assert.match(service, /resolveFeatures\(/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /previewConfirmedAt: new Date/);
  assert.match(service, /restaurantSetupVisibility\.upsert/);
  assert.doesNotMatch(service, /updateOrderingOptions|setRestaurantLocaleState|createOrder/);
});

test('migration preserves old tenants and prevents public Supabase Data API access', () => {
  assert.match(migration, /CREATE TABLE "restaurant_setups"/);
  assert.match(migration, /CREATE TABLE "restaurant_setup_visibility"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL/);
  assert.doesNotMatch(migration, /INSERT INTO "restaurant_setups"/);
  assert.match(provision, /tx\.restaurantSetup\.create/);
  assert.match(provision, /\$transaction/);
});
