import { deliverOnboardingCase, finishOnboardingCase } from '../../apps/platform/src/lib/api/onboarding';
import { demoAccessStatus, handoffMessage, handoffUrl, restaurantHandoff } from '../../apps/platform/src/lib/onboarding-handoff';
import { provisionAction } from '../../apps/platform/src/lib/onboarding-menu';

jest.mock('../../apps/platform/src/lib/api/config', () => ({ PLATFORM_API: 'https://example.test/api/v1/platform' }));

const links = { guestMenuUrl: 'https://demo.example.test/?source=qr&code=%2Bab', staffLoginUrl: 'https://staff.example.test/staff/login' };

describe('A4 Platform handoff', () => {
  it('never constructs links or offers pre-provisioning or DEMO Guest/Staff artifacts', () => {
    for (const status of ['DRAFT', 'READY_FOR_REVIEW', 'PROVISIONING', 'MENU_SETUP', 'FAILED', 'CANCELLED'] as const) {
      expect(restaurantHandoff({ status, mode: 'REAL', handoff: links })).toBeNull();
    }
    expect(restaurantHandoff({ status: 'READY', mode: 'DEMO', handoff: links })).toBeNull();
    expect(restaurantHandoff({ status: 'READY', mode: 'REAL', handoff: null })).toBeNull();
    expect(restaurantHandoff({ status: 'READY', mode: 'REAL', handoff: { ...links, staffLoginUrl: '/staff/login' } })).toBeNull();
    expect(restaurantHandoff({ status: 'READY', mode: 'REAL', handoff: links })).toEqual(links);
    expect(restaurantHandoff({ status: 'DELIVERED', mode: 'TRIAL', handoff: links })).toEqual(links);
    expect(handoffUrl('javascript:alert(1)')).toBeNull();
    expect(handoffUrl('https://user:password@example.test')).toBeNull();
  });

  it('provides both message languages using the exact issued links', () => {
    const demo = { demoLink: 'https://example.test/demo/fixture', expiresAt: '2030-01-01T09:00:00Z' };
    for (const locale of ['en', 'ar'] as const) {
      const message = handoffMessage(locale, links);
      expect(message).toContain(links.guestMenuUrl);
      expect(message).toContain(links.staffLoginUrl);
      expect(message).not.toContain(demo.demoLink);
      const demoMessage = handoffMessage(locale, demo);
      expect(demoMessage).toContain(demo.demoLink);
      expect(demoMessage).toContain('UTC');
      expect(demoMessage).not.toContain(links.staffLoginUrl);
    }
    expect(handoffMessage('ar', links)).toContain('منيو الضيوف');
  });

  it('provisions a reviewed demo from its template without customer menu data', () => {
    const state: Parameters<typeof provisionAction>[0] = {
      mode: 'DEMO', status: 'READY_FOR_REVIEW', completedSteps: ['customer', 'mode'],
      problems: { customer: [], mode: [], menu: [] }, menuDraft: null, importExpiresAt: null, importReviewed: false,
    };
    expect(provisionAction(state)).toBe('provision');
    expect(provisionAction({ ...state, completedSteps: ['customer'] })).toBeNull();
    expect(provisionAction({ ...state, status: 'PROVISIONING' })).toBe('provision');
    expect(provisionAction({ ...state, status: 'FAILED' })).toBe('retry');
    expect(provisionAction({ ...state, status: 'READY' })).toBeNull();
  });

  it('honors live expiration and never re-enables a removed/expired demo', () => {
    const demo = { demoState: 'ACTIVE', demoExpiresAt: '2030-01-01T00:00:00Z' } as const;
    const expires = Date.parse(demo.demoExpiresAt);
    expect(demoAccessStatus(demo, expires - 1)).toBe('active');
    expect(demoAccessStatus(demo, expires)).toBe('expired');
    expect(demoAccessStatus({ ...demo, demoState: 'EXPIRED' }, expires - 1)).toBe('expired');
    expect(demoAccessStatus({ ...demo, demoState: 'PURGED' }, expires - 1)).toBe('removed');
    expect(demoAccessStatus({ ...demo, demoExpiresAt: null }, expires - 1)).toBe('missing');
  });

  it('uses authenticated Platform endpoints and sends only its case revision for delivery', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: {} }));
    try {
      await finishOnboardingCase('case-id', 'provision', { revision: 3, provisioningKey: 'fixture-key' });
      await deliverOnboardingCase('case-id', 4);
      const api = 'https://example.test/api/v1/platform/onboarding-cases/case-id';
      expect(fetchMock.mock.calls).toEqual([
        [`${api}/provision`, expect.objectContaining({ method: 'POST', credentials: 'include', body: '{"revision":3,"provisioningKey":"fixture-key"}' })],
        [`${api}/deliver`, expect.objectContaining({ method: 'POST', credentials: 'include', body: '{"revision":4}' })],
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
