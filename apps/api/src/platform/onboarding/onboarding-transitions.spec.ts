import {
  IMPLEMENTED_TRANSITIONS,
  ONBOARDING_STATUSES,
  canTransition,
  decideSubmit,
  isEditable,
  statusAfterEdit,
} from './onboarding-transitions';

describe('onboarding case transitions', () => {
  it('reaches the provisioning, recovery and delivery states', () => {
    const reachable = new Set<string>(['DRAFT']);
    for (const targets of Object.values(IMPLEMENTED_TRANSITIONS)) {
      for (const target of targets) reachable.add(target);
    }
    expect([...reachable].sort()).toEqual([
      'CANCELLED',
      'DELIVERED',
      'DRAFT',
      'FAILED',
      'MENU_SETUP',
      'PROVISIONING',
      'READY',
      'READY_FOR_REVIEW',
    ]);
  });

  it('allows submit, return-to-draft and cancel; nothing leaves CANCELLED', () => {
    expect(canTransition('DRAFT', 'READY_FOR_REVIEW')).toBe(true);
    expect(canTransition('READY_FOR_REVIEW', 'DRAFT')).toBe(true);
    expect(canTransition('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransition('READY_FOR_REVIEW', 'CANCELLED')).toBe(true);
    for (const to of ONBOARDING_STATUSES) {
      expect(canTransition('CANCELLED', to)).toBe(false);
    }
    expect(canTransition('DRAFT', 'PROVISIONING')).toBe(false);
    expect(canTransition('READY_FOR_REVIEW', 'PROVISIONING')).toBe(true);
    expect(canTransition('PROVISIONING', 'MENU_SETUP')).toBe(true);
    expect(canTransition('PROVISIONING', 'READY')).toBe(false);
    expect(canTransition('MENU_SETUP', 'READY')).toBe(true);
    expect(canTransition('FAILED', 'MENU_SETUP')).toBe(true);
    expect(canTransition('FAILED', 'CANCELLED')).toBe(true);
    expect(canTransition('READY', 'DELIVERED')).toBe(true);
    for (const status of ONBOARDING_STATUSES) {
      if (status !== 'READY')
        expect(canTransition(status, 'DELIVERED')).toBe(false);
      expect(canTransition('DELIVERED', status)).toBe(false);
    }
  });

  it('an edit sends a case under review back to DRAFT', () => {
    expect(statusAfterEdit('READY_FOR_REVIEW')).toBe('DRAFT');
    expect(statusAfterEdit('DRAFT')).toBe('DRAFT');
    expect(isEditable('CANCELLED')).toBe(false);
    expect(isEditable('PROVISIONING')).toBe(false);
  });

  it('submit needs a DRAFT with steps 1 and 2 complete', () => {
    expect(decideSubmit('DRAFT', ['customer', 'mode'])).toEqual({ ok: true });
    expect(decideSubmit('DRAFT', ['customer'])).toEqual({
      ok: false,
      refusal: 'INCOMPLETE',
    });
    expect(decideSubmit('READY_FOR_REVIEW', ['customer', 'mode'])).toEqual({
      ok: false,
      refusal: 'INVALID_TRANSITION',
    });
    expect(decideSubmit('CANCELLED', ['customer', 'mode'])).toEqual({
      ok: false,
      refusal: 'INVALID_TRANSITION',
    });
  });
});
