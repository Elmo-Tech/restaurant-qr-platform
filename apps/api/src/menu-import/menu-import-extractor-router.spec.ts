import type { AiSettingsService } from '../ai-settings/ai-settings.service';
import type { GeminiMenuExtractor } from './direct/gemini-menu-extractor';
import type {
  ExtractionInput,
  N8nMenuImportExtractor,
} from './menu-import-extractor';
import { MenuImportExtractorRouter } from './menu-import-extractor-router';

const input: ExtractionInput = { files: [], languageHint: 'auto' };

function setup(options: {
  engine?: 'N8N' | 'DIRECT';
  settingsFail?: boolean;
  n8nConfigured?: boolean;
  encryption?: boolean;
  activeKeys?: number;
}) {
  const n8n = {
    isConfigured: jest.fn(() => options.n8nConfigured ?? true),
    extract: jest.fn(() => Promise.resolve('from n8n')),
  };
  const direct = { extract: jest.fn(() => Promise.resolve('from direct')) };
  const ai = {
    getSettings: jest.fn(() =>
      options.settingsFail
        ? Promise.reject(new Error('database down'))
        : Promise.resolve({
            engine: options.engine ?? 'N8N',
            activeKeyCount: options.activeKeys ?? 0,
          }),
    ),
    isEncryptionConfigured: jest.fn(() => options.encryption ?? true),
  };
  const router = new MenuImportExtractorRouter(
    n8n as unknown as N8nMenuImportExtractor,
    direct as unknown as GeminiMenuExtractor,
    ai as unknown as AiSettingsService,
  );
  return { router, n8n, direct, ai };
}

describe('MenuImportExtractorRouter', () => {
  it('uses n8n while the engine is N8N', async () => {
    const t = setup({ engine: 'N8N' });
    expect(await t.router.extract(input)).toBe('from n8n');
    expect(t.direct.extract).not.toHaveBeenCalled();
  });

  it('uses the Backend engine while the engine is DIRECT', async () => {
    const t = setup({ engine: 'DIRECT', activeKeys: 2 });
    expect(await t.router.extract(input)).toBe('from direct');
    expect(t.n8n.extract).not.toHaveBeenCalled();
  });

  it('keeps using n8n when the setting cannot be read', async () => {
    const t = setup({ settingsFail: true });
    expect(await t.router.extract(input)).toBe('from n8n');
    expect(await t.router.isConfigured()).toBe(true);
  });

  it('asks n8n whether it is configured while the engine is N8N', async () => {
    expect(
      await setup({
        engine: 'N8N',
        n8nConfigured: false,
      }).router.isConfigured(),
    ).toBe(false);
    expect(
      await setup({ engine: 'N8N', n8nConfigured: true }).router.isConfigured(),
    ).toBe(true);
  });

  it('is ready on DIRECT only with encryption set and at least one active key, whatever n8n has', async () => {
    expect(
      await setup({
        engine: 'DIRECT',
        activeKeys: 1,
        n8nConfigured: false,
      }).router.isConfigured(),
    ).toBe(true);
    expect(
      await setup({ engine: 'DIRECT', activeKeys: 0 }).router.isConfigured(),
    ).toBe(false);
    expect(
      await setup({
        engine: 'DIRECT',
        activeKeys: 3,
        encryption: false,
      }).router.isConfigured(),
    ).toBe(false);
  });
});
