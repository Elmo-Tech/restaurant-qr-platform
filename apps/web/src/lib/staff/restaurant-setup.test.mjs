import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SETUP_STEP_KEYS,
  buildSetupPreviewSteps,
  summarizeSetupSteps,
} from './restaurant-setup.ts';

const id = 'demo-restaurant';
const access = { canViewMenu: true, canViewBranches: true, canViewSettings: true };
const demo = (scenario, a = access) => buildSetupPreviewSteps(id, scenario, a);

test('all eight possible steps have unique identity and valid on-project routes', () => {
  assert.equal(SETUP_STEP_KEYS.length, 8);
  assert.equal(new Set(SETUP_STEP_KEYS).size, 8);
  for (const step of demo('partial')) {
    assert.ok(step.href.startsWith('/staff/restaurants/' + id + '/'));
    assert.ok(['identity', 'menu', 'orders'].includes(step.group));
  }
});

test('new restaurant cannot auto-complete default ordering and language choices', () => {
  const steps = demo('new');
  const status = Object.fromEntries(steps.map(s => [s.key, s.status]));
  assert.equal(status.ORDERING, 'NEEDS_REVIEW');
  assert.equal(status.LANGUAGES, 'NEEDS_REVIEW');
  const summary = summarizeSetupSteps(steps);
  assert.deepEqual([summary.done, summary.total, summary.percentage], [0, 8, 0]);
  assert.equal(summary.readyForOwnerReview, false);
  assert.equal(summary.nextAction.key, 'BRANDING');
});

test('partial demo is 3/8, without pretending missing menu/products are ready', () => {
  const summary = summarizeSetupSteps(demo('partial'));
  assert.equal(summary.done, 3);
  assert.equal(summary.total, 8);
  assert.equal(summary.percentage, 38);
  assert.equal(summary.nextAction.key, 'MENU');
});

test('WhatsApp-only flow excludes the branding waiver and branch operations, without marking them done', () => {
  const steps = demo('whatsapp');
  assert.equal(steps.find(s => s.key === 'BRANDING').status, 'INTENTIONALLY_SKIPPED');
  assert.equal(steps.find(s => s.key === 'OPERATIONS').status, 'NOT_APPLICABLE');
  const summary = summarizeSetupSteps(steps);
  assert.deepEqual([summary.done, summary.total, summary.percentage], [4, 6, 67]);
  assert.equal(summary.nextAction.key, 'ORDERING');
});

test('all sample steps done indicates readiness for OWNER review, NOT restaurant completion', () => {
  const summary = summarizeSetupSteps(demo('ready'));
  assert.equal(summary.done, 8);
  assert.equal(summary.percentage, 100);
  assert.equal(summary.nextAction, null);
  assert.equal(summary.readyForOwnerReview, true);
  assert.equal(Object.keys(summary).includes('ownerCompletedAt'), false);
});

test('denied destinations cannot render working actions or a trustworthy percentage', () => {
  const steps = demo('partial', { canViewMenu: false, canViewBranches: false, canViewSettings: true });
  const missing = steps.filter(s => s.status === 'UNAVAILABLE');
  assert.deepEqual(missing.map(s => s.key), ['MENU', 'PRODUCTS', 'OPERATIONS']);
  assert.ok(missing.every(s => s.href === null));
  const summary = summarizeSetupSteps(steps);
  assert.equal(summary.hasUnknown, true);
  assert.equal(summary.percentage, null);
  assert.equal(summary.readyForOwnerReview, false);
});

test('unknown and unavailable data never produces a fake completed percentage', () => {
  for (const status of ['UNKNOWN', 'UNAVAILABLE']) {
    const rows = [{ key: 'MENU', group: 'menu', status, href: null }];
    const result = summarizeSetupSteps(rows);
    assert.equal(result.percentage, null);
    assert.equal(result.readyForOwnerReview, false);
  }
  assert.equal(summarizeSetupSteps([]).percentage, null);
  assert.equal(summarizeSetupSteps([]).readyForOwnerReview, false);
});

test('voluntary skip and not-applicable are excluded from both denominator and numerator', () => {
  const rows = demo('ready');
  const pruned = rows.map(s => s.key === 'BRANDING' ? { ...s, status: 'INTENTIONALLY_SKIPPED' } :
    s.key === 'OPERATIONS' ? { ...s, status: 'NOT_APPLICABLE' } : s);
  const summary = summarizeSetupSteps(pruned);
  assert.deepEqual([summary.done, summary.total, summary.percentage], [6, 6, 100]);
});

test('guest preview route never implicitly requires table QR settings', () => {
  const rows = demo('new', { ...access, canViewBranches: false });
  const preview = rows.find(s => s.key === 'PREVIEW');
  assert.equal(preview.href, '/staff/restaurants/demo-restaurant/menu/overview');
  const branch = rows.find(s => s.key === 'OPERATIONS');
  assert.equal(branch.href, null);
});
