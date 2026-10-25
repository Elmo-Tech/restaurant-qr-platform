import { EditorialTemplateConfigService } from './editorial-template-config.service';
import { normalizeEditorialSettings } from './editorial-template-config';
import type { PrismaService } from '../database/prisma.service';

describe('Editorial price display preference', () => {
  it('defaults all existing restaurants to the previous FROM layout', () => {
    expect(normalizeEditorialSettings(null)).toEqual({ priceDisplay: 'FROM' });
    expect(normalizeEditorialSettings({})).toEqual({ priceDisplay: 'FROM' });
    expect(normalizeEditorialSettings({ priceDisplay: 'OTHER', injected: 'test' }))
      .toEqual({ priceDisplay: 'FROM' });
    expect(normalizeEditorialSettings({ priceDisplay: 'ALL_VARIANTS' }))
      .toEqual({ priceDisplay: 'ALL_VARIANTS' });
  });

  it('gets only the published option for the authorized restaurant and Editorial template', async () => {
    const findUnique = jest.fn().mockResolvedValue({ publishedSettings: { priceDisplay: 'ALL_VARIANTS' } });
    const service = new EditorialTemplateConfigService({
      restaurantTemplateConfig: { findUnique },
    } as unknown as PrismaService);
    await expect(service.get('restaurant-a')).resolves.toEqual({ priceDisplay: 'ALL_VARIANTS' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { restaurantId_template: { restaurantId: 'restaurant-a', template: 'EDITORIAL' } },
      select: { publishedSettings: true },
    });
  });

  it('saves only the display preference, atomically, without altering any other template', async () => {
    const upsert = jest.fn().mockResolvedValue({ publishedSettings: { priceDisplay: 'ALL_VARIANTS' } });
    const service = new EditorialTemplateConfigService({
      restaurantTemplateConfig: { upsert },
    } as unknown as PrismaService);
    await expect(service.save('restaurant-a', 'ALL_VARIANTS')).resolves.toEqual({
      priceDisplay: 'ALL_VARIANTS',
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { restaurantId_template: { restaurantId: 'restaurant-a', template: 'EDITORIAL' } },
      create: {
        restaurantId: 'restaurant-a',
        template: 'EDITORIAL',
        schemaVersion: 1,
        draftSettings: { priceDisplay: 'ALL_VARIANTS' },
        publishedSettings: { priceDisplay: 'ALL_VARIANTS' },
      },
      update: {
        draftSettings: { priceDisplay: 'ALL_VARIANTS' },
        publishedSettings: { priceDisplay: 'ALL_VARIANTS' },
      },
      select: { publishedSettings: true },
    });
  });
});
