import {
  discardOnboardingImport,
  finishOnboardingCase,
  importOnboardingMenu,
  reviewOnboardingMenu,
  updateOnboardingCase,
  type OnboardingMenuDraft,
} from '../../apps/platform/src/lib/api/onboarding';
import { createTranslate } from '../../apps/platform/src/lib/i18n/translate';
import {
  menuFileProblem,
  menuProblemText,
  provisionAction,
  provisioningRequest,
} from '../../apps/platform/src/lib/onboarding-menu';

jest.mock('../../apps/platform/src/lib/api/config', () => ({ PLATFORM_API: 'https://example.test/api/v1/platform' }));

const draft: OnboardingMenuDraft = {
  menus: [{ translations: [{ locale: 'en', name: 'Menu' }], categories: [{
    translations: [{ locale: 'en', name: 'Drinks' }],
    products: [{ translations: [{ locale: 'en', name: 'Tea' }], price: '10.25', variants: [], modifierGroups: [] }],
  }] }],
};
const ready: Parameters<typeof provisionAction>[0] = {
  mode: 'REAL', status: 'READY_FOR_REVIEW', completedSteps: ['customer', 'mode', 'menu'],
  problems: { customer: [], mode: [], menu: [] }, menuDraft: draft, importExpiresAt: null, importReviewed: false,
};

describe('A3 final provisioning', () => {
  it('starts only in READY_FOR_REVIEW with a valid manual or explicitly reviewed imported menu', () => {
    expect(provisionAction(ready)).toBe('provision');
    expect(provisionAction({ ...ready, status: 'DRAFT' })).toBeNull();
    expect(provisionAction({ ...ready, completedSteps: ['customer', 'mode'] })).toBeNull();
    expect(provisionAction({ ...ready, problems: { ...ready.problems, menu: ['menus[0].categories'] } })).toBeNull();
    expect(provisionAction({ ...ready, importExpiresAt: '2030-01-01T00:00:00Z' })).toBeNull();
    expect(provisionAction({ ...ready, importExpiresAt: '2030-01-01T00:00:00Z', importReviewed: true })).toBe('provision');
    expect(provisionAction({ ...ready, status: 'READY' })).toBeNull();
  });

  it('resumes in-progress cases and retries FAILED without requiring a fresh menu draft', () => {
    expect(provisionAction({ ...ready, status: 'PROVISIONING', menuDraft: null })).toBe('provision');
    expect(provisionAction({ ...ready, status: 'MENU_SETUP', menuDraft: null })).toBe('provision');
    expect(provisionAction({ ...ready, status: 'FAILED', menuDraft: null })).toBe('retry');
  });

  it('generates a key only when needed, prefers the stored server key, and omits an unnecessary password', () => {
    const createKey = jest.fn(() => 'local-key');
    const first = provisioningRequest(4, { provisioningKey: null, ownerPasswordRequired: true }, null, 'fixture-only', createKey);
    expect(first).toEqual({ revision: 4, provisioningKey: 'local-key', ownerPassword: 'fixture-only' });
    expect(provisioningRequest(4, { provisioningKey: null, ownerPasswordRequired: true }, first.provisioningKey, 're-entered', createKey))
      .toEqual({ revision: 4, provisioningKey: 'local-key', ownerPassword: 're-entered' });
    expect(provisioningRequest(6, { provisioningKey: 'server-key', ownerPasswordRequired: false }, first.provisioningKey, 'not-sent', createKey))
      .toEqual({ revision: 6, provisioningKey: 'server-key' });
    expect(createKey).toHaveBeenCalledTimes(1);
  });
});

describe('A3 staged import and review', () => {
  it('localizes the affected row and never displays an unknown raw backend path', () => {
    const path = 'menus[0].categories[1].products[2].price';
    expect(menuProblemText(path, createTranslate('en'), String)).toMatch(/Menu 1 \/ Category 2 \/ Product 3: Enter a valid price/);
    expect(menuProblemText(path, createTranslate('ar'), String)).toMatch(/قائمة 1 \/ قسم 2 \/ منتج 3: أدخل سعرًا/);
    expect(menuProblemText('menus[0].unknown', createTranslate('en'), String)).not.toContain('unknown');
  });

  it('rejects obvious file size and count issues before upload', () => {
    const mb = 1024 * 1024;
    expect(menuFileProblem([{ size: 10 * mb }])).toBeNull();
    expect(menuFileProblem([{ size: 10 * mb + 1 }])).toBe('onboarding.menu.error.fileSize');
    expect(menuFileProblem(new Array(5).fill({ size: 9 * mb }))).toBe('onboarding.menu.error.fileSize');
    expect(menuFileProblem(new Array(11).fill({ size: 1 }))).toBe('onboarding.menu.error.file');
  });

  it('sends multipart revision and repeated files, with separate JSON writes for save, review, discard and retry', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ data: {} }));
    try {
      await importOnboardingMenu('case-id', 3, [new File(['a'], 'a.png'), new File(['b'], 'b.webp')]);
      await updateOnboardingCase('case-id', { revision: 4, menuDraft: draft });
      await reviewOnboardingMenu('case-id', 5);
      await discardOnboardingImport('case-id', 6);
      await finishOnboardingCase('case-id', 'retry', { revision: 7, provisioningKey: 'existing-key' });

      const api = 'https://example.test/api/v1/platform/onboarding-cases/case-id';
      const [importCall, ...jsonCalls] = fetchMock.mock.calls;
      expect(importCall[0]).toBe(`${api}/menu-import`);
      expect(importCall[1]).toMatchObject({ method: 'POST', credentials: 'include', headers: undefined });
      expect(importCall[1]?.body).toBeInstanceOf(FormData);
      const body = importCall[1]?.body as FormData;
      expect(body.get('revision')).toBe('3');
      expect(body.getAll('file').map((file) => file instanceof File && file.name)).toEqual(['a.png', 'b.webp']);
      expect(jsonCalls.map(([url, init]) => [url, init?.method, init?.headers, JSON.parse(String(init?.body))])).toEqual([
        [api, 'PATCH', { 'Content-Type': 'application/json' }, { revision: 4, menuDraft: draft }],
        [`${api}/menu-import/review`, 'POST', { 'Content-Type': 'application/json' }, { revision: 5 }],
        [`${api}/menu-import`, 'DELETE', { 'Content-Type': 'application/json' }, { revision: 6 }],
        [`${api}/retry`, 'POST', { 'Content-Type': 'application/json' }, { revision: 7, provisioningKey: 'existing-key' }],
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});