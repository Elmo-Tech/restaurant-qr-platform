import { MESSAGES } from '../../apps/platform/src/lib/i18n/messages';
import { provisionAction } from '../../apps/platform/src/lib/onboarding-menu';
import {
  ONBOARDING_STEPS,
  canSubmitForReview,
  firstOpenStep,
  nextStep,
  previousStep,
  stepProgress,
  stepsForMode,
  stepsRequiredForReview,
  visibleStep,
} from '../../apps/platform/src/lib/onboarding-steps';
import * as api from '../../apps/api/src/platform/onboarding/onboarding-details';

/**
 * Wizard contract for "choose mode first" (PO request 2026-11-23): step order, back / next, progress, first open
 * step and submit gating follow the mode's own path, and agree with the server's path definitions.
 */
describe('onboarding mode-first step path (UI contract)', () => {
  it('puts the mode first and mirrors the server path for every mode', () => {
    expect([...ONBOARDING_STEPS]).toEqual([...api.ONBOARDING_STEPS]);
    for (const mode of ['REAL', 'TRIAL', 'DEMO', null] as const) {
      expect(stepsForMode(mode)).toEqual(api.stepsForMode(mode));
      expect(stepsRequiredForReview(mode)).toEqual(api.stepsRequiredForReview(mode));
    }
    expect(stepsForMode('DEMO')).toEqual(['mode', 'review', 'handoff']);
  });

  it('navigates REAL / TRIAL through customer and menu, and DEMO straight to review', () => {
    expect(nextStep('REAL', 'mode')).toBe('customer');
    expect(nextStep('TRIAL', 'customer')).toBe('menu');
    expect(nextStep('REAL', 'menu')).toBe('review');
    expect(nextStep('REAL', 'handoff')).toBeNull();
    expect(nextStep('DEMO', 'mode')).toBe('review');
    expect(previousStep('DEMO', 'review')).toBe('mode');
    expect(previousStep('REAL', 'review')).toBe('menu');
    expect(previousStep('REAL', 'mode')).toBeNull();
    // Switching to DEMO while on a step it does not have falls back to the mode step.
    expect(visibleStep('DEMO', 'customer')).toBe('mode');
    expect(visibleStep('DEMO', 'menu')).toBe('mode');
    expect(visibleStep('REAL', 'menu')).toBe('menu');
  });

  it('counts progress over the mode path only (a stale "customer" never counts for a DEMO)', () => {
    expect(stepProgress('DEMO', ['customer', 'mode'])).toEqual({ done: 1, total: 3 });
    expect(stepProgress('REAL', ['customer', 'mode', 'menu'])).toEqual({ done: 3, total: 5 });
    expect(stepProgress(null, [])).toEqual({ done: 0, total: 5 });
  });

  it('opens a resumed case on its first incomplete step', () => {
    const open = (patch: Partial<Parameters<typeof firstOpenStep>[0]>) =>
      firstOpenStep({ status: 'DRAFT', mode: null, completedSteps: [], handoffOpen: false, ...patch });
    expect(open({})).toBe('mode');
    expect(open({ completedSteps: ['customer'] })).toBe('mode');
    expect(open({ mode: 'REAL', completedSteps: [] })).toBe('mode');
    expect(open({ mode: 'REAL', completedSteps: ['mode'] })).toBe('customer');
    expect(open({ mode: 'TRIAL', completedSteps: ['mode', 'customer'] })).toBe('menu');
    expect(open({ mode: 'TRIAL', completedSteps: ['mode', 'customer', 'menu'] })).toBe('review');
    expect(open({ mode: 'DEMO', completedSteps: ['mode'] })).toBe('review');
    expect(open({ mode: 'DEMO', completedSteps: [] })).toBe('mode');
    expect(open({ status: 'READY_FOR_REVIEW', mode: 'DEMO' })).toBe('review');
    expect(open({ status: 'READY', mode: 'DEMO', handoffOpen: true })).toBe('handoff');
  });

  it('gates submit and the first provisioning call on the mode path', () => {
    expect(canSubmitForReview({ status: 'DRAFT', mode: 'DEMO', completedSteps: ['mode'] })).toBe(true);
    expect(canSubmitForReview({ status: 'DRAFT', mode: 'REAL', completedSteps: ['mode'] })).toBe(false);
    expect(canSubmitForReview({ status: 'DRAFT', mode: null, completedSteps: ['customer', 'mode'] })).toBe(false);
    const demo: Parameters<typeof provisionAction>[0] = {
      mode: 'DEMO', status: 'READY_FOR_REVIEW', completedSteps: ['mode'],
      problems: { customer: [], mode: [], menu: [] }, menuDraft: null, importExpiresAt: null, importReviewed: false,
    };
    // A DEMO without any customer details provisions from its template.
    expect(provisionAction(demo)).toBe('provision');
    expect(provisionAction({ ...demo, completedSteps: [] })).toBeNull();
    expect(provisionAction({ ...demo, mode: 'REAL' })).toBeNull();
  });

  it('explains the demo label problem and the cleared package in both languages', () => {
    for (const key of ['onboarding.problem.DEMO_LABEL_INVALID', 'onboarding.demo.label', 'onboarding.s2.packageCleared'] as const) {
      expect(MESSAGES.en[key]).toBeTruthy();
      expect(MESSAGES.ar[key]).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
