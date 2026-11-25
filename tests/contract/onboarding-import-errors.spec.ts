import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ApiError } from '../../apps/platform/src/lib/api/errors';
import { MESSAGES } from '../../apps/platform/src/lib/i18n/messages';
import {
  hasStagedImport,
  onboardingErrorKey,
  onboardingActionFailure,
  onboardingLoadFailure,
} from '../../apps/platform/src/lib/onboarding-menu';

/**
 * A1 regression (2026-11-25): Platform Onboarding has no per-case authorization, so a refused Menu import
 * (403 FEATURE_NOT_AVAILABLE: the case's package lacks MENU_IMPORT) must never be shown as "You are not authorized to
 * open this onboarding case", and must never replace the wizard (and with it the operator's unsaved edits).
 */
const apiError = (status: number, code?: string) =>
  new ApiError(status, code ? { error: { code, message: 'x' } } : { message: 'x' });

describe('onboarding import: error classification (A1)', () => {
  it('shows a package without Menu import inline as a package setting, never as case access', () => {
    const failure = onboardingActionFailure(apiError(403, 'FEATURE_NOT_AVAILABLE'));
    expect(failure).toEqual({ scope: 'inline', key: 'onboarding.menu.error.feature' });
    expect(failure.key).not.toBe('onboarding.handoff.accessDenied');
  });

  it('keeps the wizard for every action failure except a case that no longer exists', () => {
    const cases: [unknown, string][] = [
      [apiError(401, 'UNAUTHENTICATED'), 'onboarding.error.sessionExpired'],
      [apiError(403, 'CSRF_VALIDATION_FAILED'), 'onboarding.error.requestRejected'],
      [apiError(403, 'PERMISSION_DENIED'), 'onboarding.error.permissionDenied'],
      [apiError(403), 'onboarding.error.actionRefused'],
      [apiError(403, 'SOMETHING_NEW'), 'onboarding.error.actionRefused'],
      [apiError(422, 'PACKAGE_NOT_AVAILABLE'), 'onboarding.problem.PACKAGE_NOT_AVAILABLE'],
      [apiError(403, 'ONBOARDING_IMPORT_GRANT_REQUIRED'), 'onboarding.grant.required'],
      [apiError(429, 'ONBOARDING_IMPORT_QUOTA'), 'onboarding.menu.error.quota'],
      [apiError(429, 'ONBOARDING_IMPORT_LIMIT'), 'onboarding.menu.error.quota'],
      [apiError(409, 'IMPORT_ALREADY_RUNNING'), 'onboarding.menu.error.running'],
      [apiError(404), 'common.error'],
      [apiError(500), 'common.error'],
      [new TypeError('Failed to fetch'), 'common.unreachable'],
    ];
    for (const [caught, key] of cases) {
      expect(onboardingActionFailure(caught)).toEqual({ scope: 'inline', key });
    }
    expect(onboardingActionFailure(apiError(404, 'ONBOARDING_CASE_NOT_FOUND'))).toEqual({
      scope: 'case',
      key: 'onboarding.notFound',
    });
  });

  it('classifies case reads without turning a refused origin into an access denial', () => {
    expect(onboardingLoadFailure(apiError(401))).toEqual({ scope: 'case', key: 'common.sessionExpired' });
    expect(onboardingLoadFailure(apiError(404, 'ONBOARDING_CASE_NOT_FOUND')).key).toBe('onboarding.notFound');
    expect(onboardingLoadFailure(apiError(403, 'CSRF_VALIDATION_FAILED')).key).toBe('onboarding.error.requestRejected');
    expect(onboardingLoadFailure(new TypeError('Failed to fetch')).key).toBe('common.unreachable');
  });

  it('explains a changed import authorization and directs an explicit provisioning retry', () => {
    expect(onboardingErrorKey('ONBOARDING_IMPORT_GRANT_CHANGED')).toBe('onboarding.grant.changed');
    expect(onboardingActionFailure(apiError(409, 'ONBOARDING_IMPORT_GRANT_CHANGED'))).toEqual({
      scope: 'inline', key: 'onboarding.grant.changed',
    });
    expect(MESSAGES.en['onboarding.grant.changed']).toMatch(/authorization changed.*retry provisioning/i);
    expect(MESSAGES.ar['onboarding.grant.changed']).toContain('أعد محاولة التجهيز');
  });

  it('recognizes imported or legacy drafts even when the retention marker is missing', () => {
    expect(hasStagedImport({ menuProvenance: 'MANUAL', importExpiresAt: null })).toBe(false);
    expect(hasStagedImport({ menuProvenance: 'LEGACY', importExpiresAt: null })).toBe(true);
    expect(hasStagedImport({ menuProvenance: 'IMPORTED', importExpiresAt: null })).toBe(true);
    expect(hasStagedImport({ menuProvenance: 'IMPORTED', importExpiresAt: '2026-12-01T00:00:00Z' })).toBe(true);
    expect(hasStagedImport({ menuProvenance: 'MANUAL', importExpiresAt: '2026-12-01T00:00:00Z' })).toBe(true);
  });

  it('has every new message in English and Arabic, and says it is not a permission problem', () => {
    const keys = [
      'onboarding.menu.error.feature',
      'onboarding.grant.required',
      'onboarding.grant.title',
      'onboarding.menu.legacyRetention',
      'onboarding.menu.unavailable.notInPackage',
      'onboarding.menu.unavailable.noPackage',
      'onboarding.menu.unavailable.hint',
      'onboarding.menu.unavailable.stagedHint',
      'onboarding.menu.unavailable.openMode',
      'onboarding.error.sessionExpired',
      'onboarding.error.requestRejected',
      'onboarding.error.actionRefused',
      'onboarding.error.permissionDenied',
    ] as const;
    for (const key of keys) {
      expect(MESSAGES.en[key]).toBeTruthy();
      expect(MESSAGES.ar[key]).toBeTruthy();
      expect(MESSAGES.ar[key]).not.toBe(MESSAGES.en[key]);
    }
    expect(MESSAGES.en['onboarding.menu.error.feature']).toMatch(/not a missing permission/);
    expect(MESSAGES.en['onboarding.menu.unavailable.notInPackage']).toContain('{package}');
    expect(MESSAGES.ar['onboarding.menu.unavailable.notInPackage']).toContain('{package}');
  });
});

describe('onboarding import: wizard and menu step wiring (A1)', () => {
  const root = path.resolve(__dirname, '../../apps/platform/src/app/(console)/onboarding/[caseId]');
  const wizard = readFileSync(path.join(root, 'OnboardingWizard.tsx'), 'utf8');
  const menuStep = readFileSync(path.join(root, 'MenuStep.tsx'), 'utf8');

  it('never maps a status code straight to the case-access message', () => {
    expect(wizard).not.toMatch(/status === 403\)\s*return "onboarding\.handoff\.accessDenied"/);
    expect(wizard).not.toContain('caseAccessError');
    expect(wizard).toContain('onboardingActionFailure(caught)');
    expect(wizard).toContain('onboardingLoadFailure(caught)');
  });

  it('offers grant controls and keeps legacy discard and the manual editor available', () => {
    expect(menuStep).toContain('hasStagedImport(data)');
    expect(menuStep).toContain('onboarding.menu.legacyRetention');
    expect(menuStep).toContain('onboarding.grant.grant');
    expect(menuStep).toContain('onboarding.grant.revoke');
    expect(menuStep).not.toContain('menuImportAvailability');
    expect(menuStep).toMatch(/disabled=\{actionsDisabled \|\| !canReview \|\| grantStatus !== "ACTIVE"\}/);
    // Discard never depends on the package or grant: a staged draft can always be dropped for a manual menu.
    expect(menuStep).toContain('<Button type="button" disabled={actionsDisabled} onClick={() => setConfirm("discard")}>');
    expect(menuStep).toContain('onOpenModeStep');
    expect(menuStep).toMatch(/<MenuEditor [^>]*disabled=\{disabled \|\| busy \|\| expired\}/);
    expect(wizard).toContain('onOpenModeStep={() => goTo("mode")}');
  });
});
