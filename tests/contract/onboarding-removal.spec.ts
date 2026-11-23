import { removeOnboardingCase, restoreOnboardingCase, listOnboardingCases } from '../../apps/platform/src/lib/api/onboarding';
import { MESSAGES } from '../../apps/platform/src/lib/i18n/messages';
import {
  IMPACT_MESSAGE,
  REFUSAL_MESSAGE,
  REMOVAL_IMPACTS,
  isRoutineRemoval,
  removalDialog,
  removalErrorKey,
  removalRequest,
  type RemovalSummary,
} from '../../apps/platform/src/lib/onboarding-removal';
import { REMOVAL_IMPACTS as API_IMPACTS } from '../../apps/api/src/platform/onboarding/onboarding-transitions';

jest.mock('../../apps/platform/src/lib/api/config', () => ({ PLATFORM_API: 'https://example.test/api/v1/platform' }));

/** UI contract of removing onboarding cases from the outer list (PO request 2026-11-23). */
type Allowed = Extract<RemovalSummary, { allowed: true }>;
const routine: Allowed = { allowed: true, action: 'CANCEL_AND_ARCHIVE', impacts: [], confirmNotDelivered: false };

describe('onboarding list removal (UI contract)', () => {
  it('uses the server impact vocabulary', () => {
    expect([...REMOVAL_IMPACTS]).toEqual([...API_IMPACTS]);
  });

  it('a routine draft gets a short confirmation; anything affecting history needs an explicit acknowledgement', () => {
    expect(isRoutineRemoval(routine)).toBe(true);
    expect(removalDialog(routine)).toMatchObject({
      title: 'onboarding.remove.routineTitle', needsAcknowledgement: false, needsNoHandoffConfirmation: false, impacts: [],
    });
    const linked: Allowed = { ...routine, impacts: ['LINKED_LEAD', 'SUBMITTED'] };
    expect(isRoutineRemoval(linked)).toBe(false);
    expect(removalDialog(linked)).toMatchObject({
      title: 'onboarding.remove.title', intro: 'onboarding.remove.cancelIntro', needsAcknowledgement: true,
      impacts: ['onboarding.remove.impact.LINKED_LEAD', 'onboarding.remove.impact.SUBMITTED'],
    });
    const delivered: Allowed = { allowed: true, action: 'ARCHIVE', impacts: ['DELIVERED', 'RESTAURANT_KEPT'], confirmNotDelivered: false };
    expect(removalDialog(delivered).intro).toBe('onboarding.remove.archiveIntro');
    const purged: Allowed = { allowed: true, action: 'CANCEL_AND_ARCHIVE', impacts: ['DEMO_PURGED'], confirmNotDelivered: true };
    expect(removalDialog(purged)).toMatchObject({ needsAcknowledgement: true, needsNoHandoffConfirmation: true });
  });

  it('sends exactly the shown impacts and the no-handoff assertion only when confirmed', () => {
    const purged: Allowed = { allowed: true, action: 'CANCEL_AND_ARCHIVE', impacts: ['DEMO_PURGED'], confirmNotDelivered: true };
    expect(removalRequest(4, purged, false)).toEqual({ revision: 4, acknowledgedImpacts: ['DEMO_PURGED'] });
    expect(removalRequest(4, purged, true)).toEqual({ revision: 4, acknowledgedImpacts: ['DEMO_PURGED'], confirmNotDelivered: true });
    expect(removalRequest(2, routine, true)).toEqual({ revision: 2, acknowledgedImpacts: [] });
  });

  it('maps stale, refused and missing cases to clear messages', () => {
    expect(removalErrorKey('ONBOARDING_REVISION_CONFLICT', undefined)).toBe('onboarding.remove.error.changed');
    expect(removalErrorKey('ONBOARDING_REMOVE_CONFIRMATION_REQUIRED', undefined)).toBe('onboarding.remove.error.changed');
    expect(removalErrorKey('ONBOARDING_REMOVE_REFUSED', 'PROVISIONING_ACTIVE')).toBe('onboarding.remove.refused.PROVISIONING_ACTIVE');
    expect(removalErrorKey('ONBOARDING_REMOVE_REFUSED', 'nonsense')).toBe('onboarding.remove.error.changed');
    expect(removalErrorKey('ONBOARDING_CASE_NOT_FOUND', undefined)).toBe('onboarding.remove.error.gone');
    expect(removalErrorKey('SOMETHING_ELSE', undefined)).toBeNull();
  });

  it('has an English and Arabic explanation for every impact and refusal', () => {
    for (const key of [...Object.values(IMPACT_MESSAGE), ...Object.values(REFUSAL_MESSAGE)]) {
      expect(MESSAGES.en[key]).toBeTruthy();
      expect(MESSAGES.ar[key]).toMatch(/[\u0600-\u06FF]/);
    }
    const keys = Object.keys(MESSAGES.en).filter((key) => key.startsWith('onboarding.remove.'));
    for (const key of keys) expect(MESSAGES.ar[key as keyof typeof MESSAGES.ar]).toMatch(/[\u0600-\u06FF]/);
  });

  it('calls the guarded remove / restore actions and the archived list filter', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }));
    try {
      await removeOnboardingCase('case-id', { revision: 3, acknowledgedImpacts: ['LINKED_LEAD'] });
      await restoreOnboardingCase('case-id', 4);
      await listOnboardingCases({ search: '', status: '', page: 1, archived: true });
      const api = 'https://example.test/api/v1/platform/onboarding-cases';
      expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body ? JSON.parse(String(init.body)) : undefined])).toEqual([
        [`${api}/case-id/remove`, 'POST', { revision: 3, acknowledgedImpacts: ['LINKED_LEAD'] }],
        [`${api}/case-id/restore`, 'POST', { revision: 4 }],
        [`${api}?page=1&pageSize=20&archived=true`, 'GET', undefined],
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
