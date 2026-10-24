import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DEFAULT_EMBER_SETTINGS,
  normalizeEmberSettings,
  type EmberTemplateSettings,
} from './ember-template-config';

export interface EmberConfigView {
  draft: EmberTemplateSettings;
  published: EmberTemplateSettings;
}

/** All lookups use the authorized restaurant ID, never a client-supplied tenant identity. */
@Injectable()
export class EmberTemplateConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string): Promise<EmberConfigView> {
    const row = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeEmberSettings(row?.draftSettings),
      published: normalizeEmberSettings(row?.publishedSettings),
    };
  }

  async saveDraft(restaurantId: string, input: unknown): Promise<EmberConfigView> {
    const draft = normalizeEmberSettings(input);
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      create: {
        restaurantId,
        template: 'EMBER',
        schemaVersion: 1,
        draftSettings: { ...draft },
        publishedSettings: { ...DEFAULT_EMBER_SETTINGS },
      },
      update: { draftSettings: { ...draft } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeEmberSettings(row.draftSettings),
      published: normalizeEmberSettings(row.publishedSettings),
    };
  }

  async publish(restaurantId: string): Promise<EmberConfigView> {
    // Only the last SAVED draft is published; the request itself contains no styles.
    const existing = await this.prisma.restaurantTemplateConfig.findUnique({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      select: { draftSettings: true },
    });
    const published = normalizeEmberSettings(existing?.draftSettings);
    const row = await this.prisma.restaurantTemplateConfig.upsert({
      where: { restaurantId_template: { restaurantId, template: 'EMBER' } },
      create: {
        restaurantId,
        template: 'EMBER',
        schemaVersion: 1,
        draftSettings: { ...published },
        publishedSettings: { ...published },
      },
      update: { publishedSettings: { ...published } },
      select: { draftSettings: true, publishedSettings: true },
    });
    return {
      draft: normalizeEmberSettings(row.draftSettings),
      published: normalizeEmberSettings(row.publishedSettings),
    };
  }
}
