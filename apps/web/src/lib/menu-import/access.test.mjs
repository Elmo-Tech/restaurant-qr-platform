import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/errors.ts';
import { menuImportBlock, menuImportErrorKey } from './access.ts';

const membership = (overrides = {}) => ({
  permissions: ['menu.manage', 'menu.view'], allBranches: true,
  restaurant: { demoExpiresAt: null, features: { MENU_IMPORT: true } },
  ...overrides,
});

test('staff import explains permission, branch scope, entitlement and demo restrictions', () => {
  assert.equal(menuImportBlock(membership()), null);
  assert.equal(menuImportBlock(membership({ permissions: ['menu.view'] })), 'PERMISSION_DENIED');
  assert.equal(menuImportBlock(membership({ allBranches: false })), 'BRANCH_SCOPE');
  assert.equal(menuImportBlock(membership({ restaurant: { features: { MENU_IMPORT: false } } })), 'FEATURE_NOT_AVAILABLE');
  assert.equal(menuImportBlock(membership({ restaurant: { demoExpiresAt: '2030-01-01', features: { MENU_IMPORT: true } } })), 'DEMO_RESTRICTED');
});

test('staff import maps changed server state without guessing the cause of a permission denial', () => {
  const error = (code) => new ApiError(403, { error: { code, message: 'refused' } });
  assert.equal(menuImportErrorKey(error('PERMISSION_DENIED')), 'import.error.permission');
  assert.equal(menuImportErrorKey(error('FEATURE_NOT_AVAILABLE')), 'import.error.featureOff');
  assert.equal(menuImportErrorKey(error('DEMO_RESTRICTED')), 'import.blocked.demo');
  assert.equal(menuImportErrorKey(error('CSRF_VALIDATION_FAILED')), null);
});
