import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeExtraction } from '../../menu-import/menu-import-extraction';
import { readMenuTemplate } from '../../menu-import/menu-import-sheet';
import {
  sanitizeOnboardingMenuDraft,
  validateOnboardingMenuDraft,
} from './onboarding-menu';
import { extractionToMenu } from './onboarding-menu-import.service';

/**
 * The optional "Prepare your menu with ChatGPT or another AI" helper of the onboarding Menu step tells the chat to
 * produce the Menu Import template. This proves the onboarding importer accepts such a file without any model: an
 * `.xlsx` written by openpyxl (the library AI chats typically use), not by us, with the prompt's exact header row
 * (checked against `MENU_AI_PROMPT` in `tests/contract/onboarding-ai-prompt.spec.ts`), Arabic + English names,
 * blank continuation categories, decimal prices and up to three sizes.
 */
const fixture = (name: string): Buffer =>
  readFileSync(
    join(__dirname, '..', '..', '..', 'test', 'fixtures', 'menu-import', name),
  );

describe('onboarding menu import of an AI-prepared Excel template', () => {
  it('reads it as the template and stages a valid onboarding draft', async () => {
    const sheet = await readMenuTemplate(
      fixture('menu-ai-generated-openpyxl.xlsx'),
    );
    expect(sheet.kind).toBe('template');
    if (sheet.kind !== 'template') return;

    const normalized = normalizeExtraction(sheet.extraction);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const draft = sanitizeOnboardingMenuDraft(
      extractionToMenu(normalized.data, 'Fake Cafe', 'ar'),
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(
      validateOnboardingMenuDraft(draft.value, {
        defaultLocale: 'ar',
        activeLocales: ['ar', 'en'],
      }),
    ).toEqual([]);

    const [menu] = draft.value.menus;
    const name = (
      translations: { locale: string; name: string }[],
      locale: string,
    ) => translations.find((entry) => entry.locale === locale)?.name;
    expect(menu.categories.map((c) => name(c.translations, 'ar'))).toEqual([
      'مشروبات ساخنة',
      'حلويات',
      'إضافات',
    ]);
    expect(menu.categories.map((c) => name(c.translations, 'en'))).toEqual([
      'Hot Drinks',
      'Desserts',
      'Extras',
    ]);
    const [tea, coffee, latte] = menu.categories[0].products;
    expect(tea.price).toBe('15.00');
    // A sized item starts from its lowest real size price; nothing is invented.
    expect(coffee.price).toBe('30.00');
    expect(coffee.variants.map((variant) => variant.price)).toEqual([
      '30.00',
      '45.00',
    ]);
    expect(latte.variants).toHaveLength(3);
    // Arabic-only row: no English name is invented.
    expect(menu.categories[1].products[0]).toMatchObject({
      price: '35.50',
      translations: [{ locale: 'ar', name: 'بسبوسة' }],
    });
  });
});
