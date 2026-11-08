import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../database/prisma.service';
import type { ImageStorageService } from '../storage/image-storage.service';
import { DEFAULT_MEAT_LOVERS_SETTINGS, normalizeMeatLoversSettings } from './meat-lovers-menu-config';
import { MeatLoversMenuConfigService } from './meat-lovers-menu-config.service';

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
  return { service: new MeatLoversMenuConfigService(prisma, images), findUnique, update, findMany, saveImage, deleteImageBestEffort };
}

const meatLoversRow = (draft: object = {}, published: object = {}) => ({
  rendererKey: 'MEAT_LOVERS_BUTCHER_V1',
  draftSettings: draft,
  publishedSettings: published,
});

describe('MeatLoversMenuConfigService tenant isolation', () => {
  it.each([null, { rendererKey: null, draftSettings: {}, publishedSettings: {} }, { rendererKey: 'OTHER', draftSettings: {}, publishedSettings: {} }])(
    'refuses every operation for a Restaurant without its own MEAT_LOVERS assignment (%j)',
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
    const h = setup(meatLoversRow());
    await h.service.saveDraft(restaurantId, { motion: 'OFF' });
    expect(h.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { restaurantId } }));
    expect(h.findMany).toHaveBeenCalledWith({ where: { restaurantId }, select: { id: true } });
  });

  it('drops category IDs the Restaurant does not own (foreign tenant data cannot be referenced)', async () => {
    const h = setup(meatLoversRow());
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
    const h = setup(meatLoversRow());
    await expect(
      h.service.setCategoryImage(restaurantId, foreignCategory, Buffer.from('x'), 'image/png'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.resetCategoryImage(restaurantId, foreignCategory)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.saveImage).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe('MeatLoversMenuConfigService draft / publish', () => {
  it('saving a draft never changes the published settings', async () => {
    const h = setup(meatLoversRow({}, { heroTitleEn: 'Live copy' }));
    const result = await h.service.saveDraft(restaurantId, { heroTitleEn: 'Next copy' });
    expect(result.draft.heroTitleEn).toBe('Next copy');
    expect(result.published.heroTitleEn).toBe('Live copy');
    const written = (h.update.mock.calls as [{ data: Record<string, unknown> }][])[0][0].data;
    expect(written).not.toHaveProperty('publishedSettings');
  });

  it('ignores raw image paths in the payload and keeps the stored server uploads', async () => {
    const h = setup(meatLoversRow({ heroImageAssetPath: oldHero, categoryExtras: { [ownCategory]: { imageAssetPath: oldHero } } }));
    const result = await h.service.saveDraft(restaurantId, {
      motion: 'SUBTLE',
      heroImageAssetPath: 'https://attacker.example/x.png',
      categoryExtras: { [ownCategory]: { introEn: 'Hi', imageAssetPath: 'https://attacker.example/y.png' } },
    });
    expect(result.draft.heroImageAssetPath).toBe(oldHero);
    expect(result.draft.categoryExtras[ownCategory].imageAssetPath).toBe(oldHero);
  });

  it('publish copies the saved draft; a replaced upload is deleted only after nothing references it', async () => {
    const h = setup(meatLoversRow({ heroImageAssetPath: newHero }, { heroImageAssetPath: oldHero }));
    const result = await h.service.publish(restaurantId);
    expect(result.published.heroImageAssetPath).toBe(newHero);
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(oldHero);
  });

  it('an upload changes only the draft and keeps the published photo until publish', async () => {
    const h = setup(meatLoversRow({}, { heroImageAssetPath: oldHero }));
    const result = await h.service.setDraftImage(restaurantId, 'hero', Buffer.from('image'), 'image/webp');
    expect(result.draft.heroImageAssetPath).toBe(newHero);
    expect(result.published.heroImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('resetting restores the default art in the draft without deleting a still-published photo', async () => {
    const h = setup(meatLoversRow({ storyImageAssetPath: oldHero }, { storyImageAssetPath: oldHero }));
    const result = await h.service.resetDraftImage(restaurantId, 'story');
    expect(result.draft.storyImageAssetPath).toBeNull();
    expect(result.published.storyImageAssetPath).toBe(oldHero);
    expect(h.deleteImageBestEffort).not.toHaveBeenCalled();
  });

  it('removes an unpublished upload when it is reset', async () => {
    const h = setup(meatLoversRow({ storyImageAssetPath: newHero }));
    await h.service.resetDraftImage(restaurantId, 'story');
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('stores a category photo inside that category override only', async () => {
    const h = setup(meatLoversRow({ categoryExtras: { [ownCategory]: { introEn: 'Keep me' } } }));
    const result = await h.service.setCategoryImage(restaurantId, ownCategory.toUpperCase(), Buffer.from('i'), 'image/webp');
    expect(result.draft.categoryExtras[ownCategory]).toMatchObject({ introEn: 'Keep me', imageAssetPath: newHero });
  });

  it('cleans up the stored file when the draft write fails', async () => {
    const h = setup(meatLoversRow());
    h.update.mockRejectedValueOnce(new Error('db down'));
    await expect(h.service.setDraftImage(restaurantId, 'hero', Buffer.from('i'), 'image/webp')).rejects.toBeDefined();
    expect(h.deleteImageBestEffort).toHaveBeenCalledWith(newHero);
  });

  it('exposes normalized defaults for an assignment that was never edited', async () => {
    const h = setup(meatLoversRow());
    const view = await h.service.get(restaurantId);
    expect(view.draft).toEqual(DEFAULT_MEAT_LOVERS_SETTINGS);
    expect(view.published).toEqual(normalizeMeatLoversSettings({}));
  });
});
