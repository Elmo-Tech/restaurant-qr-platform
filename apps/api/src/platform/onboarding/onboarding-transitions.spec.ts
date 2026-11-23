import {
  IMPLEMENTED_TRANSITIONS,
  ONBOARDING_STATUSES,
  canTransition,
  decideRemoval,
  decideSubmit,
  impactsAcknowledged,
  isEditable,
  type RemovalFacts,
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

describe('mode-aware submit for review', () => {
  it('lets a DEMO submit with only the mode step; REAL / TRIAL / no mode still need the customer step', () => {
    expect(decideSubmit('DRAFT', ['mode'], 'DEMO')).toEqual({ ok: true });
    expect(decideSubmit('DRAFT', [], 'DEMO')).toEqual({
      ok: false,
      refusal: 'INCOMPLETE',
    });
    for (const mode of ['REAL', 'TRIAL', null] as const) {
      expect(decideSubmit('DRAFT', ['mode'], mode)).toEqual({
        ok: false,
        refusal: 'INCOMPLETE',
      });
      expect(decideSubmit('DRAFT', ['mode', 'customer'], mode)).toEqual({
        ok: true,
      });
    }
    expect(decideSubmit('READY_FOR_REVIEW', ['mode'], 'DEMO')).toEqual({
      ok: false,
      refusal: 'INVALID_TRANSITION',
    });
  });
});

describe('removal from the active list (PO request 2026-11-23)', () => {
  const facts = (patch: Partial<RemovalFacts> = {}): RemovalFacts => ({
    status: 'DRAFT',
    mode: null,
    leadId: null,
    restaurantId: null,
    restaurantProvisionedAt: null,
    demoId: null,
    demoHistory: null,
    demoRemovedAt: null,
    deliveredAt: null,
    hasMenuDraft: false,
    archivedAt: null,
    ...patch,
  });
  const purged = {
    status: 'READY' as const,
    mode: 'DEMO' as const,
    demoHistory: { kind: 'cafe' },
    demoRemovedAt: new Date(),
  };

  it('a routine draft is cancelled and archived with no impact to confirm', () => {
    expect(decideRemoval(facts())).toEqual({
      allowed: true,
      action: 'CANCEL_AND_ARCHIVE',
      impacts: [],
      confirmNotDelivered: false,
    });
  });

  it('lists every impact of an open case: lead, submitted review, menu draft', () => {
    expect(
      decideRemoval(
        facts({ status: 'READY_FOR_REVIEW', leadId: 'l', hasMenuDraft: true }),
      ),
    ).toEqual({
      allowed: true,
      action: 'CANCEL_AND_ARCHIVE',
      impacts: ['LINKED_LEAD', 'SUBMITTED', 'MENU_DRAFT'],
      confirmNotDelivered: false,
    });
  });

  it('a FAILED case is cancelled but its restaurant / demo is kept and said so', () => {
    expect(
      decideRemoval(
        facts({
          status: 'FAILED',
          mode: 'TRIAL',
          restaurantId: 'r',
          restaurantProvisionedAt: new Date(),
        }),
      ),
    ).toMatchObject({
      allowed: true,
      action: 'CANCEL_AND_ARCHIVE',
      impacts: ['SETUP_FAILED', 'RESTAURANT_KEPT'],
    });
    expect(
      decideRemoval(facts({ status: 'FAILED', mode: 'DEMO', demoId: 'd' })),
    ).toMatchObject({ impacts: ['SETUP_FAILED', 'DEMO_KEPT'] });
  });

  it('refuses active provisioning and a READY case awaiting handoff (live demo included)', () => {
    for (const status of ['PROVISIONING', 'MENU_SETUP'] as const)
      expect(decideRemoval(facts({ status }))).toEqual({
        allowed: false,
        refusal: 'PROVISIONING_ACTIVE',
      });
    expect(
      decideRemoval(
        facts({ status: 'READY', mode: 'REAL', restaurantId: 'r' }),
      ),
    ).toEqual({ allowed: false, refusal: 'HANDOFF_PENDING' });
    expect(decideRemoval(facts({ ...purged, demoId: 'still-active' }))).toEqual(
      { allowed: false, refusal: 'HANDOFF_PENDING' },
    );
  });

  it('reuses the purge-ready DEMO rule: needs the explicit no-handoff assertion', () => {
    expect(decideRemoval(facts({ ...purged, leadId: 'l' }))).toEqual({
      allowed: true,
      action: 'CANCEL_AND_ARCHIVE',
      impacts: ['LINKED_LEAD', 'DEMO_PURGED'],
      confirmNotDelivered: true,
    });
    expect(
      decideRemoval(facts({ ...purged, deliveredAt: new Date() })),
    ).toEqual({ allowed: false, refusal: 'HANDOFF_PENDING' });
  });

  it('only archives terminal cases, keeping the delivered restaurant and never touching the lead', () => {
    expect(
      decideRemoval(
        facts({
          status: 'DELIVERED',
          mode: 'REAL',
          leadId: 'l',
          restaurantId: 'r',
          deliveredAt: new Date(),
        }),
      ),
    ).toEqual({
      allowed: true,
      action: 'ARCHIVE',
      impacts: ['DELIVERED', 'RESTAURANT_KEPT'],
      confirmNotDelivered: false,
    });
    expect(decideRemoval(facts({ status: 'CANCELLED', leadId: 'l' }))).toEqual({
      allowed: true,
      action: 'ARCHIVE',
      impacts: [],
      confirmNotDelivered: false,
    });
    expect(decideRemoval(facts({ archivedAt: new Date() }))).toEqual({
      allowed: false,
      refusal: 'ALREADY_ARCHIVED',
    });
  });

  it('requires every current impact to have been acknowledged', () => {
    expect(impactsAcknowledged([], [])).toBe(true);
    expect(impactsAcknowledged(['LINKED_LEAD'], [])).toBe(false);
    expect(
      impactsAcknowledged(['LINKED_LEAD', 'SUBMITTED'], ['LINKED_LEAD']),
    ).toBe(false);
    expect(
      impactsAcknowledged(['LINKED_LEAD'], ['LINKED_LEAD', 'SUBMITTED']),
    ).toBe(true);
  });
});
