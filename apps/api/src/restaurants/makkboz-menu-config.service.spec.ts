import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_MAKKBOZ_SETTINGS, normalizeMakkbozSettings } from './makkboz-menu-config';
import { MakkbozMenuConfigService } from './makkboz-menu-config.service';

const restaurantId = '0e2c28f2-73d7-4755-b130-61b5e4cc3e31';
const ownCategory = '41b84aaa-7abf-4f06-a494-2c8dca0a3cea';
const foreignCategory = '9d5b7f10-5c60-4a0e-9a1b-0f9a4a0b1c11';
const oldHero = '/media/1a63c31c-830c-4e40-a501-a82f427cc419.jpg';
const newHero = '/media/4bf93c5c-799c-4a7f-96f6-aa06f720e0c1.webp';

function setup(row: unknown) {
  const findUnique = jest.fn().mockResolvedValue(row);
  const update = jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
    Promise.resolve({
      draftSettings: args.data.draftSettings ?? (row as { draftSettings: unknown }).draftSettings,
      publishedSettings: args.data.publishedSettings ?? (row as { publishedSettings: unknown }).publishedSettings,
    }),
  );
  const findMany = jest.fn().mockResolvedValue([{ id: ownCategory }]);
  const saveImage = jest.fn().mockResolvedValue({ assetPath: newHero });
  const deleteImageBestEffort = jest.fn();
  const prisma = {
    restaurantExclusiveDesign: { findUnique, update },
    category: { findMany },
  } as unknown as PrismaService;
  const images = { saveImage, deleteImageBestEffort } as unknown as ImageStorageService;
  return { service: new MakkbozMenuConfigService(prisma, images), findUnique, update, findMany, saveImage, deleteImageBestEffort };
}

const makkbozRow = (draft: object = {}, published: object = {}) => ({
  rendererKey: 'MAKKBOZ_HERITAGE_V1',
  draftSettings: draft,
  publishedSettings: published,
});

describe('MakkbozMenuConfigService tenant isolation', () => {
  it.each([null, { rendererKey: null, draftSettings: {}, publishedSettings: {} }, { rendererKey: 'OTHER', draftSettings: {}, publishedSettings: {} }])(
    'refuses every operation for a Restaurant without its own MAKKBOZ assignment (%j)',
    async (row) => {
      const h = setup(row);
      await expect(h.service.get(restaurantId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.service.saveDraft(restaurantId, {})).rejects.toBeInstanceOf(NotFoundException);
      await expect(h.service.publish(restaurantId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        h.service.setDraftImage(restaurantId, 'hero', Buffer.from('x'), 'image/png'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(h.update).not.toHaveBeenCalled();
      expect(h.saveImage).not.toHaveBeenCalled();
    },
  );

  it('always keys reads and writes by the authorized Restaurant ID', async () => {
    const h = setup(makkbozRow());
    await h.service.saveDraft(restaurantId, { motion: 'OFF' });
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.findMany).toHaveBeenCalledWith({ where: { restaurantId }, select: { id: true } });
  });

  it('drops category IDs the Restaurant does not own (foreign tenant data cannot be referenced)', async () => {
    const h = setup(makkbozRow());
    const result = await h.service.saveDraft(restaurantId, {
      categoryExtras: {
        [foreignCategory]: { introEn: 'steal' },
        [ownCategory]: { introEn: 'mine' },
      },
    });
    expect(Object.keys(result.draft.categoryExtras)).toEqual([ownCategory]);
    expect(result.draft.categoryExtras[ownCategory].introEn).toBe('mine');
  });

  it('rejects category photo operations for a foreign category without writing anything', async () => {
    const h = setup(makkbozRow());
    await expect(
      h.service.setCategoryImage(restaurantId, foreignCategory, Buffer.from('x'), 'image/png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.resetCategoryImage(restaurantId, foreignCategory)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.saveImage).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe('MakkbozMenuConfigService draft / publish', () => {
  it('saves the display preference as a draft and keeps it when an older client omits it', async () => {
    const edited = setup(makkbozRow({}, { priceDisplay: 'STARTING_PRICE' }));
    const result = await edited.service.saveDraft(restaurantId, {
      priceDisplay: 'ALL_VARIANTS',
    });
    expect(result.draft.priceDisplay).toBe('ALL_VARIANTS');
    expect(result.published.priceDisplay).toBe('STARTING_PRICE');
    const olderClient = setup(makkbozRow({ priceDisplay: 'ALL_VARIANTS' }));
    expect(
      (await olderClient.service.saveDraft(restaurantId, { motion: 'OFF' }))
        .draft.priceDisplay,
    ).toBe('ALL_VARIANTS');
    const published = setup(
      makkbozRow(
        { priceDisplay: 'ALL_VARIANTS' },
        { priceDisplay: 'STARTING_PRICE' },
      ),
    );
    expect(
      (await published.service.publish(restaurantId)).published.priceDisplay,
    ).toBe('ALL_VARIANTS');
  });

  it('saving a draft never changes the published settings', async () => {
    const h = setup(makkbozRow({}, { heroTitleEn: 'Live copy' }));
    const result = await h.service.saveDraft(restaurantId, { heroTitleEn: 'Next copy' });
    expect(result.draft.heroTitleEn).toBe('Next copy');
    expect(result.published.heroTitleEn).toBe('Live copy');
    const written = (h.update.mock.calls as [{ data: Record<string, unknown> }][])[0][0].data;
    expect(written).not.toHaveProperty('publishedSettings');
  });

  it('ignores raw image paths in the payload and keeps the stored server uploads', async () => {
    const h = setup(makkbozRow({ heroImageAssetPath: oldHero, categoryExtras: { [ownCategory]: { imageAssetPath: oldHero } } }));
    const result = await h.service.saveDraft(restaurantId, {
      motion: 'SUBTLE',
      heroImageAssetPath: 'https://attacker.example/x.png',
      categoryExtras: { [ownCategory]: { introEn: 'Hi', imageAssetPath: 'https://attacker.example/y.png' } },
    });
    expect(result.draft.heroImageAssetPath).toBe(oldHero);
    expect(result.draft.categoryExtras[ownCategory].imageAssetPath).toBe(oldHero);
  });

  it('publish copies the saved draft; a replaced upload is deleted only after nothing references it', async () => {
    const h = setup(makkbozRow({ heroImageAssetPath: newHero }, { heroImageAssetPath: oldHero }));
    const result = await h.service.publish(restaurantId);
    expect(result.published.heroImageAssetPath).toBe(newHero);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(oldHero);
  });

  it('an upload changes only the draft and keeps the published photo until publish', async () => {
    const h = setup(makkbozRow({}, { heroImageAssetPath: oldHero }));
    const result = await h.service.setDraftImage(restaurantId, 'hero', Buffer.from('image'), 'image/webp');
    expect(result.draft.heroImageAssetPath).toBe(newHero);
    expect(result.published.heroImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('resetting restores the default art in the draft without deleting a still-published photo', async () => {
    const h = setup(makkbozRow({ heroSmallImageAssetPath: oldHero }, { heroSmallImageAssetPath: oldHero }));
    const result = await h.service.resetDraftImage(restaurantId, 'heroSmall');
    expect(result.draft.heroSmallImageAssetPath).toBeNull();
    expect(result.published.heroSmallImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('removes an unpublished upload when it is reset', async () => {
    const h = setup(makkbozRow({ heroSmallImageAssetPath: newHero }));
    await h.service.resetDraftImage(restaurantId, 'heroSmall');
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('stores a category photo inside that category override only', async () => {
    const h = setup(makkbozRow({ categoryExtras: { [ownCategory]: { introEn: 'Keep me' } } }));
    const result = await h.service.setCategoryImage(restaurantId, ownCategory.toUpperCase(), Buffer.from('i'), 'image/webp');
    expect(result.draft.categoryExtras[ownCategory]).toMatchObject({ introEn: 'Keep me', imageAssetPath: newHero });
  });

  it('cleans up the stored file when the draft write fails', async () => {
    const h = setup(makkbozRow());
    h.update.mockRejectedValueOnce(new Error('db down'));
    await expect(h.service.setDraftImage(restaurantId, 'hero', Buffer.from('i'), 'image/webp')).rejects.toBeDefined();
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('exposes normalized defaults for an assignment that was never edited', async () => {
    const h = setup(makkbozRow());
    const view = await h.service.get(restaurantId);
    expect(view.draft).toEqual(DEFAULT_MAKKBOZ_SETTINGS);
    expect(view.published).toEqual(normalizeMakkbozSettings({}));
  });
});
