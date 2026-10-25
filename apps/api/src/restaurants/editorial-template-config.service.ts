import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  normalizeEditorialSettings,
  type EditorialPriceDisplay,
  type EditorialTemplateSettings,
} from './editorial-template-config';

/**
 * Single published setting (no second draft/publish workflow for a two-state toggle).
 * Uses the existing RestaurantTemplateConfig table; no schema migration is needed.
 */
@Injectable()
export class EditorialTemplateConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string): Promise<EditorialTemplateSettings> {
    const row = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EDITORIAL' } },
      select: { publishedSettings: true },
    });
    return normalizeEditorialSettings(row?.publishedSettings);
  }

  async save(restaurantId: string, priceDisplay: EditorialPriceDisplay): Promise<EditorialTemplateSettings> {
    const settings = normalizeEditorialSettings({ priceDisplay });
    const serialized = { priceDisplay: settings.priceDisplay };
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EDITORIAL' } },
      create: {
        restaurantId,
        template: 'EDITORIAL',
        schemaVersion: 1,
        draftSettings: serialized,
        publishedSettings: serialized,
      },
      update: {
        draftSettings: serialized,
        publishedSettings: serialized,
      },
      select: { publishedSettings: true },
    });
    return normalizeEditorialSettings(row.publishedSettings);
  }
}
