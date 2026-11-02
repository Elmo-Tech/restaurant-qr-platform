import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertValidTemplate,
  templateImages,
  type DemoTemplate,
} from './demo-template';

const DIR = join(__dirname, '..', '..', 'demo-template');
const template = JSON.parse(
  readFileSync(join(DIR, 'template.json'), 'utf8'),
) as DemoTemplate;

/** The shipped demo content is checked like code: a broken template would break every demo. */
describe('the shipped demo template', () => {
  it('is valid', () => {
    expect(() => assertValidTemplate(template)).not.toThrow();
  });

  it('has every photo on disk, each under the upload limit', () => {
    for (const image of templateImages(template)) {
      const file = join(DIR, 'images', image);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(5 * 1024 * 1024);
    }
  });

  it('is complete in Arabic and English', () => {
    const everything = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(everything)
          : value && typeof value === 'object'
            ? Object.values(value).flatMap(everything)
            : [];
    const pairs: { ar: string; en: string }[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.ar === 'string' && typeof record.en === 'string')
          pairs.push({ ar: record.ar, en: record.en });
        Object.values(record).forEach(collect);
      }
    };
    collect(template);
    expect(pairs.length).toBeGreaterThan(100);
    for (const pair of pairs) {
      expect(pair.ar.trim()).not.toBe('');
      expect(pair.en.trim()).not.toBe('');
      expect(/[؀-ۿ]/.test(pair.ar)).toBe(true); // the Arabic text is Arabic
    }
    expect(everything(template).length).toBeGreaterThan(200);
  });

  it('shows what the dashboard sells: sizes, extras, discounts, suggestions and photos on every product', () => {
    const products = template.menu.categories.flatMap((c) => c.products);
    expect(template.menu.categories.length).toBeGreaterThanOrEqual(6);
    expect(products.length).toBeGreaterThanOrEqual(20);
    expect(products.every((p) => p.image)).toBe(true);
    expect(products.some((p) => (p.variants?.length ?? 0) > 1)).toBe(true);
    expect(products.some((p) => (p.modifierGroups?.length ?? 0) > 0)).toBe(
      true,
    );
    expect(products.some((p) => p.discount)).toBe(true);
    expect(template.suggestions.length).toBeGreaterThan(0);
    expect(template.branches.length).toBeGreaterThanOrEqual(2);
    expect(
      template.branches.every((b) => b.tables > 0 && b.zones.length > 0),
    ).toBe(true);
  });

  it('leaves the WhatsApp number to the visitor and keeps the WhatsApp channel off', () => {
    expect(template.restaurant.whatsappOrderingEnabled).toBe(false);
    expect(JSON.stringify(template)).not.toMatch(/whatsappNumber|wa\.me/);
  });
});
