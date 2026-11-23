import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSheet } from 'read-excel-file/node';
import * as platformPrompt from '../../apps/platform/src/lib/menu-import-ai-prompt';
import * as webPrompt from '../../apps/web/src/lib/menu-import/ai-prompt';
import { MESSAGES } from '../../apps/platform/src/lib/i18n/messages';

/**
 * One canonical Menu Import AI prompt and template (PO request 2026-11-23): the Platform onboarding Menu step mirrors
 * the Staff Import page's instructions and Excel template. Any divergence fails here, so the two never drift.
 */
const root = join(__dirname, '..', '..');
const file = (...parts: string[]) => readFileSync(join(root, ...parts));
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const header = async (buffer: Buffer) => ((await readSheet(buffer))[0] ?? []).map(String);

describe('onboarding AI prompt and Excel template (contract)', () => {
  it('shows exactly the canonical instructions and columns of the Staff importer', () => {
    expect(platformPrompt.MENU_AI_PROMPT).toBe(webPrompt.MENU_AI_PROMPT);
    expect([...platformPrompt.TEMPLATE_COLUMNS]).toEqual([...webPrompt.TEMPLATE_COLUMNS]);
    expect(platformPrompt.MENU_AI_PROMPT).toContain(webPrompt.TEMPLATE_COLUMNS.join(', '));
  });

  it('offers a byte-identical copy of the template, whose header row is the prompt column list', async () => {
    const web = file('apps', 'web', 'public', 'templates', 'menu-import-template.xlsx');
    const platform = file('apps', 'platform', 'public', 'templates', 'menu-import-template.xlsx');
    expect(sha(platform)).toBe(sha(web));
    const columns = (await header(platform)).map((cell) => cell.trim().toLowerCase());
    for (const column of webPrompt.TEMPLATE_COLUMNS) expect(columns).toContain(column);
  });

  it('the AI-prepared fixture the API importer test accepts has exactly the header the prompt asks for', async () => {
    const fixture = file('apps', 'api', 'test', 'fixtures', 'menu-import', 'menu-ai-generated-openpyxl.xlsx');
    expect(await header(fixture)).toEqual([...webPrompt.TEMPLATE_COLUMNS]);
  });

  it('the helper links the template the Platform actually serves', () => {
    const helper = file('apps', 'platform', 'src', 'app', '(console)', 'onboarding', '[caseId]', 'AiPromptHelp.tsx').toString();
    expect(helper).toContain('"/templates/menu-import-template.xlsx"');
    expect(helper).toContain('MENU_AI_PROMPT');
    // Client-only: no API client import, so opening, copying or downloading can never call the backend.
    expect(helper).not.toMatch(/lib\/api\//);
  });

  it('has simple English and Arabic copy for every helper string', () => {
    const keys = Object.keys(MESSAGES.en).filter((key) => key.startsWith('onboarding.ai.'));
    expect(keys.sort()).toEqual([
      'onboarding.ai.copied', 'onboarding.ai.copy', 'onboarding.ai.copyFailed', 'onboarding.ai.intro',
      'onboarding.ai.label', 'onboarding.ai.noFile', 'onboarding.ai.private', 'onboarding.ai.step1',
      'onboarding.ai.step2', 'onboarding.ai.step3', 'onboarding.ai.step4', 'onboarding.ai.summary',
      'onboarding.ai.template', 'onboarding.ai.templateHint',
    ]);
    for (const key of keys) {
      const ar = MESSAGES.ar[key as keyof typeof MESSAGES.ar];
      expect(ar).toMatch(/[\u0600-\u06FF]/);
      expect(ar).not.toBe(MESSAGES.en[key as keyof typeof MESSAGES.en]);
    }
    expect(MESSAGES.en['onboarding.ai.summary']).toBe('Prepare your menu with ChatGPT or another AI');
  });
});
